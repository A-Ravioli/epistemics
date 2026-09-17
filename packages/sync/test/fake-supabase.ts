/**
 * In-memory stand-in for Supabase: one Map per table keyed by the conflict columns, `user_id` scoping,
 * a per-request `server_updated_at` (like Postgres `now()` per transaction) and the server-side LWW
 * trigger (`updated_at` older than the stored row → write ignored).
 */
import type { Row, SelectBuilder, SelectResult, SupabaseLikeAuth, SupabaseLikeClient, SyncSession, SyncUser, TableClient } from '../src/client.js';

export interface FakeSupabase {
  client: SupabaseLikeClient;
  tables: Map<string, Map<string, Row>>;
  /** Rows of `table` visible to `userId` (default: the current user). */
  rows(table: string, userId?: string): Row[];
  /** Switch the acting user (like signing in as someone else). */
  setUser(user: SyncUser | null): void;
  calls: { upserts: number; selects: number };
  /** Make every request fail with this message (undefined = healthy). */
  failWith?: string;
  /** How `server_updated_at` is assigned: per row (`clock_timestamp()`, the real trigger) or per upsert call (`now()`). */
  timestampMode: 'per-row' | 'per-call';
}

export function createFakeSupabase(user: SyncUser | null = { id: 'user-a', email: 'a@example.com' }): FakeSupabase {
  const tables = new Map<string, Map<string, Row>>();
  let current = user;
  let tick = 0;
  const calls = { upserts: 0, selects: 0 };
  const nextTs = () => new Date(1_800_000_000_000 + ++tick).toISOString();
  const table = (name: string) => { let t = tables.get(name); if (!t) { t = new Map(); tables.set(name, t); } return t; };
  const fake: FakeSupabase = {
    tables, calls, timestampMode: 'per-row',
    rows: (name, userId = current?.id) => [...table(name).values()].filter((r) => r['user_id'] === userId),
    setUser: (u) => { current = u; },
    client: undefined as never,
  };

  function from(name: string): TableClient {
    const t = table(name);
    return {
      async upsert(rows, options) {
        calls.upserts++;
        if (fake.failWith) return { error: { message: fake.failWith } };
        if (!current) return { error: { message: 'not authenticated' } };
        const conflict = (options?.onConflict ?? 'user_id,id').split(',');
        const callTs = nextTs();
        for (const r of rows) {
          const row: Row = { ...r, user_id: r['user_id'] ?? current.id };
          if (row['user_id'] !== current.id) return { error: { message: 'row-level security violation' } };
          const key = JSON.stringify(conflict.map((c) => row[c]));
          const old = t.get(key);
          if (old && Number(row['updated_at']) < Number(old['updated_at'])) continue; // BEFORE UPDATE trigger keeps the old row
          // `clock_timestamp()` per row (default) or `now()` per statement.
          t.set(key, { ...old, ...row, server_updated_at: fake.timestampMode === 'per-call' ? callTs : nextTs() });
        }
        return { error: null };
      },
      select() {
        const filters: ((r: Row) => boolean)[] = [];
        const orders: { column: string; ascending: boolean }[] = [];
        let limit = Infinity;
        const builder: SelectBuilder = {
          gt(c, v) { filters.push((r) => String(r[c]) > String(v)); return builder; },
          gte(c, v) { filters.push((r) => String(r[c]) >= String(v)); return builder; },
          order(c, o) { orders.push({ column: c, ascending: o?.ascending ?? true }); return builder; },
          limit(n) { limit = n; return builder; },
          then(onfulfilled, onrejected) {
            calls.selects++;
            let result: SelectResult;
            if (fake.failWith) result = { data: null, error: { message: fake.failWith } };
            else if (!current) result = { data: [], error: null };
            else {
              let rows = [...t.values()].filter((r) => r['user_id'] === current!.id).filter((r) => filters.every((f) => f(r)));
              // PostgREST applies `order` calls in sequence: the first is the primary sort key.
              rows.sort((a, b) => {
                for (const o of orders) {
                  const x = a[o.column] as string | number, y = b[o.column] as string | number;
                  if (x === y) continue;
                  return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
                }
                return 0;
              });
              rows = rows.slice(0, limit);
              result = { data: rows.map((r) => ({ ...r })), error: null };
            }
            return Promise.resolve(result).then(onfulfilled, onrejected);
          },
        };
        return builder;
      },
    };
  }

  const session = (): SyncSession | null => (current ? { access_token: `token-${current.id}`, user: current } : null);
  const auth: SupabaseLikeAuth = {
    async getUser() { return { data: { user: current }, error: null }; },
    async getSession() { return { data: { session: session() }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() { /* noop */ } } } }; },
    async signInWithPassword({ email }) { current = { id: `user-${email}`, email }; return { data: { user: current, session: session() }, error: null }; },
    async signUp({ email }) { current = { id: `user-${email}`, email }; return { data: { user: current, session: session() }, error: null }; },
    async signInWithOtp() { return { error: null }; },
    async signOut() { current = null; return { error: null }; },
  };
  fake.client = { from, auth };
  return fake;
}
