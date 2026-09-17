/**
 * Which tables sync, with which key and columns. Column lists come from the drizzle schema so the two never
 * drift; the server schema (supabase/migrations) mirrors the same names. See docs/SYNC.md.
 */
import { getTableColumns } from 'drizzle-orm';
import { schema } from '@epistemics/db';
import type { Row } from './client.js';

export interface SyncTableSpec {
  table: string;
  /** Primary key column(s), SQL names. */
  pk: string[];
  /** Columns pushed and pulled (SQL names). Everything else is local-only. */
  columns: string[];
  /** Column holding the client-clock timestamp used for last-writer-wins. Default `updated_at`. */
  updatedAtColumn?: string;
  /** Rows are immutable: pull inserts only, never overwrites. */
  appendOnly?: boolean;
  /** Local-only columns reset to NULL when a pulled row replaces the local one (e.g. chunk embeddings). */
  resetOnPull?: string[];
  /** Return false to keep a row on this device (never pushed). */
  pushFilter?: (row: Row) => boolean;
}

function cols(t: Parameters<typeof getTableColumns>[0], omit: string[] = []): string[] {
  return Object.values(getTableColumns(t)).map((c) => c.name).filter((n) => !omit.includes(n));
}

/** Settings keys that describe this device / transport rather than the learner; never synced. */
export const LOCAL_ONLY_SETTING_PREFIXES = ['llm', 'sync', 'supabase'];

export function isLocalOnlySetting(key: string): boolean {
  return LOCAL_ONLY_SETTING_PREFIXES.some((p) => key.startsWith(p));
}

/** Pull order matters: parents before children so the UI can refresh consistently after a sync. */
export const SYNC_TABLES: SyncTableSpec[] = [
  { table: 'curricula', pk: ['id', 'version'], columns: cols(schema.curricula) },
  { table: 'sources', pk: ['id'], columns: cols(schema.sources) },
  { table: 'chunks', pk: ['id'], columns: cols(schema.chunks, ['embedding']), resetOnPull: ['embedding'] },
  { table: 'gen_cache', pk: ['key'], columns: cols(schema.genCache) },
  { table: 'courses', pk: ['id'], columns: cols(schema.courses) },
  { table: 'cards', pk: ['id'], columns: cols(schema.cards) },
  { table: 'review_log', pk: ['id'], columns: cols(schema.reviewLog), updatedAtColumn: 'review_time', appendOnly: true },
  { table: 'concept_state', pk: ['course_id', 'concept_id'], columns: cols(schema.conceptState) },
  { table: 'fsrs_params', pk: ['course_id'], columns: cols(schema.fsrsParams) },
  { table: 'sessions', pk: ['id'], columns: cols(schema.sessions) },
  { table: 'turns', pk: ['id'], columns: cols(schema.turns) },
  { table: 'receipts', pk: ['id'], columns: cols(schema.receipts) },
  { table: 'jol', pk: ['id'], columns: cols(schema.jol) },
  { table: 'llm_calls', pk: ['id'], columns: cols(schema.llmCalls), updatedAtColumn: 'created_at', appendOnly: true },
  { table: 'settings', pk: ['key'], columns: cols(schema.settings), pushFilter: (r) => !isLocalOnlySetting(String(r['key'])) },
];

/** Remote column names added by the server on top of the local ones. */
export const SERVER_COLUMNS = ['user_id', 'server_updated_at', 'updated_at'] as const;
