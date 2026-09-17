import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Chunk, SourceDoc } from '@epistemics/core';
import type { Db } from '../client.js';
import { chunks, sources } from '../schema.js';
import { batchAll } from './_util.js';
import { dirtyQueries, markDirty, type WriteOptions } from './_outbox.js';
import { chunkToRow } from './chunks.js';

type Row = typeof sources.$inferSelect;

function rowToSource(r: Row): SourceDoc {
  const s: SourceDoc = { id: r.id, title: r.title, kind: r.kind as SourceDoc['kind'], hash: r.hash };
  if (r.licence !== null) s.licence = r.licence;
  if (r.pageCount !== null) s.pageCount = r.pageCount;
  return s;
}

async function liveChunkIds(db: Db, sourceId: string): Promise<string[]> {
  const rows = await db.select({ id: chunks.id }).from(chunks).where(and(eq(chunks.sourceId, sourceId), isNull(chunks.deletedAt))).all();
  return rows.map((r) => r.id);
}

/**
 * Upsert a source document and (re)write its chunks in one transaction. Existing chunks for the source are
 * replaced: the ones not in `sourceChunks` become tombstones so the replacement reaches other devices.
 * `curriculumId` links the source to a curriculum (null for sources still being ingested).
 */
export async function saveSource(
  db: Db, source: SourceDoc, sourceChunks: readonly Chunk[], now: number = Date.now(), curriculumId: string | null = null, opts: WriteOptions = {},
): Promise<void> {
  const row: typeof sources.$inferInsert = {
    id: source.id, curriculumId, title: source.title, kind: source.kind, hash: source.hash,
    licence: source.licence ?? null, pageCount: source.pageCount ?? null, createdAt: now, updatedAt: now, deletedAt: null,
  };
  const { id: _id, createdAt: _ca, ...set } = row;
  const keep = new Set(sourceChunks.map((c) => c.id));
  const stale = (await liveChunkIds(db, source.id)).filter((id) => !keep.has(id));
  await batchAll(db, [
    db.insert(sources).values(row).onConflictDoUpdate({ target: sources.id, set }),
    ...stale.map((id) => db.update(chunks).set({ deletedAt: now, updatedAt: now, embedding: null }).where(eq(chunks.id, id))),
    ...sourceChunks.map((c) => {
      const crow = chunkToRow(c, now);
      const { id: _cid, ...cset } = crow;
      return db.insert(chunks).values(crow).onConflictDoUpdate({ target: chunks.id, set: cset });
    }),
    ...dirtyQueries(db, 'sources', [source.id], now, opts),
    ...dirtyQueries(db, 'chunks', [...stale, ...sourceChunks.map((c) => c.id)], now, opts),
  ]);
}

export async function getSource(db: Db, id: string): Promise<SourceDoc | undefined> {
  const row = await db.select().from(sources).where(and(eq(sources.id, id), isNull(sources.deletedAt))).get();
  return row ? rowToSource(row) : undefined;
}

export async function listSources(db: Db, curriculumId?: string | null): Promise<SourceDoc[]> {
  const live = isNull(sources.deletedAt);
  const where = curriculumId === undefined ? live : curriculumId === null ? and(live, isNull(sources.curriculumId)) : and(live, eq(sources.curriculumId, curriculumId));
  const rows = await db.select().from(sources).where(where).orderBy(asc(sources.createdAt)).all();
  return rows.map(rowToSource);
}

export async function setSourceCurriculum(db: Db, sourceId: string, curriculumId: string | null, now: number = Date.now()): Promise<void> {
  await db.update(sources).set({ curriculumId, updatedAt: now }).where(eq(sources.id, sourceId)).run();
  await markDirty(db, 'sources', sourceId, now);
}

/** Soft delete the source and its chunks (tombstones are synced; embeddings are dropped locally). */
export async function deleteSource(db: Db, id: string, now: number = Date.now()): Promise<void> {
  const ids = await liveChunkIds(db, id);
  await batchAll(db, [
    db.update(chunks).set({ deletedAt: now, updatedAt: now, embedding: null }).where(and(eq(chunks.sourceId, id), isNull(chunks.deletedAt))),
    db.update(sources).set({ deletedAt: now, updatedAt: now }).where(eq(sources.id, id)),
    ...dirtyQueries(db, 'sources', [id], now),
    ...dirtyQueries(db, 'chunks', ids, now),
  ]);
}
