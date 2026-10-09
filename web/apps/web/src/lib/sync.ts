/**
 * Sync manager for the app: owns the Supabase client (built from settings / env defaults), watches the auth
 * session and runs a `@epistemics/sync` engine while a user is signed in. Also exposes the LLM transport for
 * the anthropic-proxy edge function. Pure module state with a tiny external store for React.
 */
import { useSyncExternalStore } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Db, DbExecutor } from '@epistemics/db';
import { countOutbox, listChunksMissingEmbedding, saveEmbedding } from '@epistemics/db';
import { asSyncClient, createSyncEngine, type SyncEngine, type SyncStatus } from '@epistemics/sync';
import type { Platform } from '@epistemics/platform';
import { getSyncSettings, setSyncSettings, type SyncSettings } from './settings.js';
import { syncEvents } from './sync-events.js';

export { syncEvents } from './sync-events.js';

export interface SyncUserInfo { id: string; email?: string }

export interface SyncSnapshot {
  /** URL and anon key present. */
  configured: boolean;
  settings: SyncSettings;
  user?: SyncUserInfo;
  status: SyncStatus;
  /** Last auth / configuration error (sign-in failures, unreachable project). */
  authError?: string;
}

const IDLE: SyncStatus = { state: 'stopped', pending: 0, pushed: 0, pulled: 0 };

let snapshot: SyncSnapshot = { configured: false, settings: { supabaseUrl: '', supabaseAnonKey: '' }, status: IDLE };
const listeners = new Set<() => void>();
function set(patch: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

let db: Db | undefined;
let executor: DbExecutor | undefined;
let client: SupabaseClient | undefined;
let engine: SyncEngine | undefined;
let unsubscribeAuth: (() => void) | undefined;
let activityOff: (() => void) | undefined;
let visibilityBound = false;

export function useSyncState(): SyncSnapshot {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot, () => snapshot);
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function getSupabase(): SupabaseClient | undefined {
  return client;
}

/** Recount pending outbox rows (works signed out too). */
export async function refreshPending(): Promise<number> {
  if (engine) return engine.refreshPending();
  if (!db) return 0;
  const pending = await countOutbox(db);
  set({ status: { ...snapshot.status, pending } });
  return pending;
}

function describeError(e: unknown, url?: string): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: string })?.message ?? String(e);
  if (/fetch|network|Load failed|ECONNREFUSED|ENOTFOUND/i.test(msg)) return `Could not reach Supabase${url ? ` at ${url}` : ''} (${msg}). Check the project URL; the app keeps working offline.`;
  return msg;
}

function stopEngine(): void {
  engine?.stop();
  engine = undefined;
  activityOff?.();
  activityOff = undefined;
}

/** Recompute hash embeddings for chunks that arrived without one. */
async function recomputeEmbeddings(database: Db): Promise<void> {
  const missing = await listChunksMissingEmbedding(database);
  if (missing.length === 0) return;
  const { createHashEmbedder } = await import('@epistemics/ingest');
  const embedder = createHashEmbedder();
  for (let i = 0; i < missing.length; i += 64) {
    const slice = missing.slice(i, i + 64);
    const vectors = await embedder.embed(slice.map((c) => c.text));
    for (let j = 0; j < slice.length; j++) await saveEmbedding(database, slice[j]!.id, vectors[j]!);
  }
}

function startEngine(user: SyncUserInfo): void {
  if (!db || !executor || !client) return;
  stopEngine();
  const database = db;
  engine = createSyncEngine({
    db: database,
    executor,
    client: asSyncClient(client),
    userId: user.id,
    log: (m, ...a) => console.debug('[sync]', m, ...a),
    onPulled: async (table, rows) => {
      if (table === 'chunks' && rows.length) await recomputeEmbeddings(database).catch((e: unknown) => console.warn('[sync] embeddings', e));
      syncEvents.emit('pulled');
    },
  });
  activityOff = syncEvents.on('activity', () => engine?.requestSync());
  engine.start({ intervalMs: 60_000, onStatus: (status) => set({ status }) });
  set({ user, status: engine.status(), authError: undefined });
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') engine?.requestSync();
  });
}

function makeClient(settings: SyncSettings): SupabaseClient | undefined {
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) return undefined;
  new URL(settings.supabaseUrl); // throws on malformed input; surfaced by the caller
  return createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

async function bindAuth(): Promise<void> {
  unsubscribeAuth?.();
  unsubscribeAuth = undefined;
  stopEngine();
  if (!client) { set({ user: undefined, status: { ...IDLE, pending: snapshot.status.pending } }); return; }
  const c = client;
  const apply = (session: { user: { id: string; email?: string } } | null) => {
    if (session?.user) {
      if (engine && snapshot.user?.id === session.user.id) return;
      const u: SyncUserInfo = { id: session.user.id };
      if (session.user.email) u.email = session.user.email;
      startEngine(u);
    } else {
      stopEngine();
      set({ user: undefined, status: { ...IDLE, pending: snapshot.status.pending } });
    }
  };
  const { data } = c.auth.onAuthStateChange((_event, session) => apply(session));
  unsubscribeAuth = () => data.subscription.unsubscribe();
  try {
    const { data: s } = await c.auth.getSession();
    apply(s.session);
  } catch (e) {
    set({ authError: describeError(e, snapshot.settings.supabaseUrl) });
  }
}

/** Called once at boot. Never throws: a bad configuration only surfaces on the Account screen. */
export async function startSync(platform: Platform, database: Db): Promise<void> {
  db = database;
  executor = platform.db;
  bindVisibility();
  const settings = await getSyncSettings(database);
  set({ settings, configured: !!(settings.supabaseUrl && settings.supabaseAnonKey) });
  try {
    client = makeClient(settings);
  } catch (e) {
    client = undefined;
    set({ authError: describeError(e, settings.supabaseUrl) });
  }
  await bindAuth();
  await refreshPending().catch(() => undefined);
}

/** Save URL + anon key and rebuild the client. Throws on a malformed URL. */
export async function configureSupabase(settings: SyncSettings): Promise<void> {
  if (!db) throw new Error('Sync is not initialised');
  const trimmed = { supabaseUrl: settings.supabaseUrl.trim().replace(/\/+$/, ''), supabaseAnonKey: settings.supabaseAnonKey.trim() };
  if (trimmed.supabaseUrl) {
    let u: URL;
    try { u = new URL(trimmed.supabaseUrl); } catch { throw new Error(`"${trimmed.supabaseUrl}" is not a valid URL (expected https://<ref>.supabase.co)`); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('The Supabase URL must start with https://');
  }
  if (client) await client.auth.signOut().catch(() => undefined);
  await setSyncSettings(db, trimmed);
  set({ settings: trimmed, configured: !!(trimmed.supabaseUrl && trimmed.supabaseAnonKey), authError: undefined });
  client = makeClient(trimmed);
  await bindAuth();
}

function requireClient(): SupabaseClient {
  if (!client) throw new Error('Enter your Supabase project URL and anon key first.');
  return client;
}

async function authCall<T extends { error: { message: string } | null }>(fn: (c: SupabaseClient) => Promise<T>): Promise<T> {
  const c = requireClient();
  set({ authError: undefined });
  try {
    const r = await fn(c);
    if (r.error) {
      const msg = describeError(r.error, snapshot.settings.supabaseUrl);
      set({ authError: msg });
      throw new Error(msg);
    }
    return r;
  } catch (e) {
    const msg = describeError(e, snapshot.settings.supabaseUrl);
    set({ authError: msg });
    throw new Error(msg);
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  await authCall((c) => c.auth.signInWithPassword({ email, password }));
}

/** Returns true when the project requires email confirmation (no session yet). */
export async function signUp(email: string, password: string): Promise<boolean> {
  const r = await authCall((c) => c.auth.signUp({ email, password }));
  return !r.data.session;
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirect = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
  await authCall((c) => c.auth.signInWithOtp({ email, options: redirect ? { emailRedirectTo: redirect } : undefined }));
}

export async function signOut(): Promise<void> {
  stopEngine();
  if (client) await client.auth.signOut().catch(() => undefined);
  set({ user: undefined, status: { ...IDLE, pending: snapshot.status.pending }, authError: undefined });
}

export function requestSync(): void {
  engine?.requestSync();
}

export async function syncNow(): Promise<SyncStatus> {
  if (!engine) throw new Error('Sign in to sync.');
  const s = await engine.syncOnce();
  set({ status: s });
  return s;
}

/**
 * LLM transport through the `anthropic-proxy` edge function: base URL plus a fetch that attaches the current
 * access token. Undefined when not configured or not signed in.
 */
export function getEdgeTransport(): { baseURL: string; fetch: typeof fetch } | undefined {
  const c = client;
  if (!c || !snapshot.user || !snapshot.settings.supabaseUrl) return undefined;
  const baseURL = `${snapshot.settings.supabaseUrl}/functions/v1/anthropic-proxy`;
  const edgeFetch: typeof fetch = async (input, init) => {
    const { data } = await c.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not signed in to Supabase');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('authorization', `Bearer ${token}`);
    headers.delete('x-api-key');
    return globalThis.fetch(input, { ...init, headers });
  };
  return { baseURL, fetch: edgeFetch };
}
