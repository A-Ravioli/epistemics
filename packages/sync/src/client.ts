/**
 * The subset of `@supabase/supabase-js` the sync engine and the app use. Kept minimal and structural so tests
 * can run against an in-memory fake (`test/fake-supabase.ts`) and so the engine never depends on the SDK's
 * generics. A real `SupabaseClient` satisfies it; see `asSyncClient` for the (type-only) adaptation.
 */
export type Row = Record<string, unknown>;

export interface SyncError { message: string; code?: string; details?: string }

export interface SelectResult { data: Row[] | null; error: SyncError | null }

export interface SelectBuilder extends PromiseLike<SelectResult> {
  gt(column: string, value: string | number): SelectBuilder;
  gte(column: string, value: string | number): SelectBuilder;
  order(column: string, options?: { ascending?: boolean }): SelectBuilder;
  limit(count: number): SelectBuilder;
}

export interface TableClient {
  select(columns?: string): SelectBuilder;
  upsert(rows: Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): PromiseLike<{ error: SyncError | null }>;
}

export interface SyncUser { id: string; email?: string }
export interface SyncSession { access_token: string; user: SyncUser }

export interface SupabaseLikeAuth {
  getUser(): Promise<{ data: { user: SyncUser | null }; error: SyncError | null }>;
  getSession(): Promise<{ data: { session: SyncSession | null }; error: SyncError | null }>;
  onAuthStateChange(callback: (event: string, session: SyncSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user: SyncUser | null; session: SyncSession | null }; error: SyncError | null }>;
  signUp(credentials: { email: string; password: string }): Promise<{ data: { user: SyncUser | null; session: SyncSession | null }; error: SyncError | null }>;
  signInWithOtp(credentials: { email: string; options?: { emailRedirectTo?: string } }): Promise<{ error: SyncError | null }>;
  signOut(): Promise<{ error: SyncError | null }>;
}

export interface SupabaseLikeClient {
  from(table: string): TableClient;
  auth: SupabaseLikeAuth;
}

/**
 * Type-only adaptation of a real supabase-js client. The SDK's builders are generic over a Database type we do
 * not declare, so their method signatures are wider than ours; at runtime they are exactly what we call.
 */
export function asSyncClient(client: unknown): SupabaseLikeClient {
  return client as SupabaseLikeClient;
}
