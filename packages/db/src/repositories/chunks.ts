/**
 * Chunks of source text. Search is a plain LIKE scan for now (no FTS5 in tauri-plugin-sql / default wasm
 * build); swap for FTS5 + sqlite-vec when the rusqlite executor lands.
 */
import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import type { Chunk } from '@epistemics/core';
import type { Db } from '../client.js';
import { chunks } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';
import { dirtyQueries, type WriteOptions } from './_outbox.js';

type Row = typeof chunks.$inferSelect;

export function chunkToRow(c: Chunk, now: number): typeof chunks.$inferInsert {
  return {
    id: c.id, sourceId: c.sourceId, ordinal: c.ordinal, headingPath: toJson(c.headingPath),
    pageStart: c.pageStart ?? null, pageEnd: c.pageEnd ?? null, text: c.text, tokenCount: c.tokenCount, hash: c.hash,
    updatedAt: now, deletedAt: null,
  };
}

function rowToChunk(r: Pick<Row, 'id' | 'sourceId' | 'ordinal' | 'headingPath' | 'pageStart' | 'pageEnd' | 'text' | 'tokenCount' | 'hash'>): Chunk {
  const c: Chunk = {
    id: r.id, sourceId: r.sourceId, ordinal: r.ordinal, headingPath: parseJson<string[]>(r.headingPath, []),
    text: r.text, tokenCount: r.tokenCount, hash: r.hash,
  };
  if (r.pageStart !== null) c.pageStart = r.pageStart;
  if (r.pageEnd !== null) c.pageEnd = r.pageEnd;
  return c;
}

const chunkCols = {
  id: chunks.id, sourceId: chunks.sourceId, ordinal: chunks.ordinal, headingPath: chunks.headingPath,
  pageStart: chunks.pageStart, pageEnd: chunks.pageEnd, text: chunks.text, tokenCount: chunks.tokenCount, hash: chunks.hash,
};

const live = () => isNull(chunks.deletedAt);

export async function saveChunks(db: Db, list: readonly Chunk[], now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  await batchAll(db, [
    ...list.map((c) => {
      const row = chunkToRow(c, now);
      const { id: _id, ...set } = row;
      return db.insert(chunks).values(row).onConflictDoUpdate({ target: chunks.id, set });
    }),
    ...dirtyQueries(db, 'chunks', list.map((c) => c.id), now, opts),
  ]);
}

export async function getChunksBySource(db: Db, sourceId: string): Promise<Chunk[]> {
  const rows = await db.select(chunkCols).from(chunks).where(and(eq(chunks.sourceId, sourceId), live())).orderBy(asc(chunks.ordinal)).all();
  return rows.map(rowToChunk);
}

export async function getChunksByIds(db: Db, ids: readonly string[]): Promise<Chunk[]> {
  if (ids.length === 0) return [];
  const rows = await db.select(chunkCols).from(chunks).where(and(inArray(chunks.id, [...ids]), live())).all();
  const byId = new Map(rows.map((r) => [r.id, rowToChunk(r)]));
  return ids.flatMap((id) => { const c = byId.get(id); return c ? [c] : []; });
}

export async function getChunk(db: Db, id: string): Promise<Chunk | undefined> {
  const row = await db.select(chunkCols).from(chunks).where(and(eq(chunks.id, id), live())).get();
  return row ? rowToChunk(row) : undefined;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Case-insensitive substring search over chunk text: every whitespace-separated term must appear.
 * Ranked by number of term occurrences (crude), then source order. `sourceIds` empty = all sources.
 */
export async function searchChunks(db: Db, sourceIds: readonly string[], query: string, limit = 20): Promise<Chunk[]> {
  const terms = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const termConds = terms.map((t) => like(chunks.text, `%${escapeLike(t)}%`));
  const conds = [...termConds, live()];
  if (sourceIds.length > 0) conds.push(inArray(chunks.sourceId, [...sourceIds]));
  const rows = await db.select(chunkCols).from(chunks).where(and(...conds))
    .orderBy(asc(chunks.sourceId), asc(chunks.ordinal)).all();
  const lower = terms.map((t) => t.toLowerCase());
  const scored = rows.map((r) => {
    const text = r.text.toLowerCase();
    let score = 0;
    for (const t of lower) { let i = -1; while ((i = text.indexOf(t, i + 1)) !== -1) score++; }
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ r }) => rowToChunk(r));
}

/**
 * Store an embedding vector as little-endian float32 bytes. Embeddings are local-only (never synced, so this
 * neither bumps `updated_at` nor writes the outbox); each device recomputes them after a pull.
 */
export async function saveEmbedding(db: Db, chunkId: string, embedding: Float32Array): Promise<void> {
  const bytes = new Uint8Array(embedding.buffer.slice(embedding.byteOffset, embedding.byteOffset + embedding.byteLength));
  await db.update(chunks).set({ embedding: bytes }).where(eq(chunks.id, chunkId)).run();
}

export async function getEmbeddings(db: Db, sourceIds: readonly string[]): Promise<{ chunkId: string; embedding: Float32Array }[]> {
  const where = sourceIds.length ? and(inArray(chunks.sourceId, [...sourceIds]), sql`${chunks.embedding} IS NOT NULL`, live()) : and(sql`${chunks.embedding} IS NOT NULL`, live());
  const rows = await db.select({ id: chunks.id, embedding: chunks.embedding }).from(chunks).where(where).all();
  return rows.flatMap((r) => {
    const e = r.embedding;
    if (!(e instanceof Uint8Array)) return [];
    const copy = new Uint8Array(e.byteLength);
    copy.set(e);
    return [{ chunkId: r.id, embedding: new Float32Array(copy.buffer, 0, copy.byteLength >> 2) }];
  });
}

/** Ids of live chunks without an embedding (e.g. just pulled by sync), with their text, for recomputation. */
export async function listChunksMissingEmbedding(db: Db, limit = 5000): Promise<{ id: string; text: string }[]> {
  return db.select({ id: chunks.id, text: chunks.text }).from(chunks)
    .where(and(sql`${chunks.embedding} IS NULL`, live())).orderBy(asc(chunks.sourceId), asc(chunks.ordinal)).limit(limit).all();
}
