/**
 * Chunks of source text. Search is a plain LIKE scan for now (no FTS5 in tauri-plugin-sql / default wasm
 * build); swap for FTS5 + sqlite-vec when the rusqlite executor lands.
 */
import { and, asc, eq, inArray, like, sql } from 'drizzle-orm';
import type { Chunk } from '@epistemics/core';
import type { Db } from '../client.js';
import { chunks } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';

type Row = typeof chunks.$inferSelect;

export function chunkToRow(c: Chunk): typeof chunks.$inferInsert {
  return {
    id: c.id, sourceId: c.sourceId, ordinal: c.ordinal, headingPath: toJson(c.headingPath),
    pageStart: c.pageStart ?? null, pageEnd: c.pageEnd ?? null, text: c.text, tokenCount: c.tokenCount, hash: c.hash,
  };
}

function rowToChunk(r: Omit<Row, 'embedding'>): Chunk {
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

export async function saveChunks(db: Db, list: readonly Chunk[]): Promise<void> {
  await batchAll(db, list.map((c) => {
    const row = chunkToRow(c);
    const { id: _id, ...set } = row;
    return db.insert(chunks).values(row).onConflictDoUpdate({ target: chunks.id, set });
  }));
}

export async function getChunksBySource(db: Db, sourceId: string): Promise<Chunk[]> {
  const rows = await db.select(chunkCols).from(chunks).where(eq(chunks.sourceId, sourceId)).orderBy(asc(chunks.ordinal)).all();
  return rows.map(rowToChunk);
}

export async function getChunksByIds(db: Db, ids: readonly string[]): Promise<Chunk[]> {
  if (ids.length === 0) return [];
  const rows = await db.select(chunkCols).from(chunks).where(inArray(chunks.id, [...ids])).all();
  const byId = new Map(rows.map((r) => [r.id, rowToChunk(r)]));
  return ids.flatMap((id) => { const c = byId.get(id); return c ? [c] : []; });
}

export async function getChunk(db: Db, id: string): Promise<Chunk | undefined> {
  const row = await db.select(chunkCols).from(chunks).where(eq(chunks.id, id)).get();
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
  const conds = [...termConds];
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

/** Store an embedding vector as little-endian float32 bytes. */
export async function saveEmbedding(db: Db, chunkId: string, embedding: Float32Array): Promise<void> {
  const bytes = new Uint8Array(embedding.buffer.slice(embedding.byteOffset, embedding.byteOffset + embedding.byteLength));
  await db.update(chunks).set({ embedding: bytes }).where(eq(chunks.id, chunkId)).run();
}

export async function getEmbeddings(db: Db, sourceIds: readonly string[]): Promise<{ chunkId: string; embedding: Float32Array }[]> {
  const where = sourceIds.length ? and(inArray(chunks.sourceId, [...sourceIds]), sql`${chunks.embedding} IS NOT NULL`) : sql`${chunks.embedding} IS NOT NULL`;
  const rows = await db.select({ id: chunks.id, embedding: chunks.embedding }).from(chunks).where(where).all();
  return rows.flatMap((r) => {
    const e = r.embedding;
    if (!(e instanceof Uint8Array)) return [];
    const copy = new Uint8Array(e.byteLength);
    copy.set(e);
    return [{ chunkId: r.id, embedding: new Float32Array(copy.buffer, 0, copy.byteLength >> 2) }];
  });
}
