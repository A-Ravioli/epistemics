/**
 * Typed access to the `settings` table. Keys are namespaced; per-course keys embed the course id.
 */
import type { Db } from '@epistemics/db';
import { getSetting, setSetting } from '@epistemics/db';
import type { ModelConfig } from '@epistemics/llm';

export type LlmMode = 'mock' | 'anthropic' | 'ollama';
export type AnthropicTransport = 'byok' | 'proxy';

export interface LlmSettings {
  mode: LlmMode;
  transport: AnthropicTransport;
  /** Route Anthropic calls through the Supabase `anthropic-proxy` edge function while signed in (overrides `transport`). */
  viaSupabase?: boolean;
  models: Partial<ModelConfig>;
  ollamaBaseUrl: string;
  ollamaModel: string;
  /** USD per study day per course; 0 = unlimited. */
  dailyBudgetUsd: number;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  mode: 'mock',
  transport: 'byok',
  models: {},
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  dailyBudgetUsd: 0,
};

export const KEYS = {
  llm: 'llm',
  activeCourseId: 'activeCourseId',
  gateOverride: (courseId: string) => `gateOverride:${courseId}`,
  remediation: (courseId: string) => `remediation:${courseId}`,
  queueFirst: (courseId: string) => `queueFirst:${courseId}`,
  warmupDone: (courseId: string) => `warmupDone:${courseId}`,
  clearedDays: (courseId: string) => `clearedDays:${courseId}`,
  overrides: (courseId: string) => `overrides:${courseId}`,
  diagnosticDone: (courseId: string) => `diagnosticDone:${courseId}`,
  builtCurricula: 'builtCurricula',
  /** First-run draft and completion (docs/ONBOARDING.md); account-scoped, so it syncs. */
  onboarding: 'onboarding',
  /** Device-local sync configuration; the `sync` prefix keeps it out of the outbox push (packages/sync tables.ts). */
  sync: 'sync',
} as const;

export interface SyncSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Build-time defaults (apps/web/.env.local: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). */
export function envSupabaseDefaults(): SyncSettings | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const url = env['VITE_SUPABASE_URL'];
  const key = env['VITE_SUPABASE_ANON_KEY'];
  return url && key ? { supabaseUrl: url, supabaseAnonKey: key } : undefined;
}

/** Stored values win; otherwise the build-time defaults; otherwise empty (sync off). */
export async function getSyncSettings(db: Db): Promise<SyncSettings> {
  const stored = await getSetting<Partial<SyncSettings>>(db, KEYS.sync);
  const env = envSupabaseDefaults();
  return {
    supabaseUrl: stored?.supabaseUrl ?? env?.supabaseUrl ?? '',
    supabaseAnonKey: stored?.supabaseAnonKey ?? env?.supabaseAnonKey ?? '',
  };
}

export async function setSyncSettings(db: Db, s: SyncSettings): Promise<void> {
  await setSetting(db, KEYS.sync, s);
}

/** Curricula built by the learner in this app (the Shelf's "built by you" list), newest last. */
export interface BuiltCurriculumRef { id: string; version: number; at: number }

export async function getBuiltCurricula(db: Db): Promise<BuiltCurriculumRef[]> {
  return (await getSetting<BuiltCurriculumRef[]>(db, KEYS.builtCurricula)) ?? [];
}

export async function addBuiltCurriculum(db: Db, id: string, version: number, at: number = Date.now()): Promise<void> {
  const cur = await getBuiltCurricula(db);
  if (cur.some((r) => r.id === id && r.version === version)) return;
  await setSetting(db, KEYS.builtCurricula, [...cur, { id, version, at }]);
}

export async function getLlmSettings(db: Db): Promise<LlmSettings> {
  const stored = await getSetting<Partial<LlmSettings>>(db, KEYS.llm);
  return { ...DEFAULT_LLM_SETTINGS, ...(stored ?? {}), models: { ...(stored?.models ?? {}) } };
}

export async function setLlmSettings(db: Db, s: LlmSettings): Promise<void> {
  await setSetting(db, KEYS.llm, s);
}

export async function getActiveCourseId(db: Db): Promise<string | undefined> {
  return getSetting<string>(db, KEYS.activeCourseId);
}

export async function setActiveCourseId(db: Db, id: string | undefined): Promise<void> {
  await setSetting(db, KEYS.activeCourseId, id ?? null);
}

/** Pending remediation mini-lessons (concept ids) for a course, oldest first. */
export async function getPendingRemediation(db: Db, courseId: string): Promise<string[]> {
  return (await getSetting<string[]>(db, KEYS.remediation(courseId))) ?? [];
}

export async function addPendingRemediation(db: Db, courseId: string, conceptId: string): Promise<void> {
  const cur = await getPendingRemediation(db, courseId);
  if (!cur.includes(conceptId)) await setSetting(db, KEYS.remediation(courseId), [...cur, conceptId]);
}

export async function removePendingRemediation(db: Db, courseId: string, conceptId: string): Promise<void> {
  const cur = await getPendingRemediation(db, courseId);
  await setSetting(db, KEYS.remediation(courseId), cur.filter((c) => c !== conceptId));
}

/** Concepts whose cards go first in today's queue (missed in the warm-up). */
export async function getQueueFirst(db: Db, courseId: string): Promise<string[]> {
  return (await getSetting<string[]>(db, KEYS.queueFirst(courseId))) ?? [];
}
export async function setQueueFirst(db: Db, courseId: string, conceptIds: string[]): Promise<void> {
  await setSetting(db, KEYS.queueFirst(courseId), conceptIds);
}

export async function getWarmupDay(db: Db, courseId: string): Promise<string | undefined> {
  return getSetting<string>(db, KEYS.warmupDone(courseId));
}
export async function setWarmupDay(db: Db, courseId: string, day: string): Promise<void> {
  await setSetting(db, KEYS.warmupDone(courseId), day);
}

/** Study days ("YYYY-MM-DD") on which the review queue was cleared. */
export async function getClearedDays(db: Db, courseId: string): Promise<string[]> {
  return (await getSetting<string[]>(db, KEYS.clearedDays(courseId))) ?? [];
}
export async function markDayCleared(db: Db, courseId: string, day: string): Promise<void> {
  const cur = await getClearedDays(db, courseId);
  if (!cur.includes(day)) await setSetting(db, KEYS.clearedDays(courseId), [...cur, day].sort().slice(-400));
}

/** The study day on which the review gate was last overridden (one override per day). */
export async function getGateOverrideDay(db: Db, courseId: string): Promise<string | undefined> {
  return getSetting<string>(db, KEYS.gateOverride(courseId));
}
export async function setGateOverrideDay(db: Db, courseId: string, day: string): Promise<void> {
  await setSetting(db, KEYS.gateOverride(courseId), day);
  const log = (await getSetting<string[]>(db, KEYS.overrides(courseId))) ?? [];
  await setSetting(db, KEYS.overrides(courseId), [...log, day]);
}
export async function getOverrideLog(db: Db, courseId: string): Promise<string[]> {
  return (await getSetting<string[]>(db, KEYS.overrides(courseId))) ?? [];
}

export async function isDiagnosticDone(db: Db, courseId: string): Promise<boolean> {
  return (await getSetting<boolean>(db, KEYS.diagnosticDone(courseId))) === true;
}
export async function setDiagnosticDone(db: Db, courseId: string): Promise<void> {
  await setSetting(db, KEYS.diagnosticDone(courseId), true);
}
