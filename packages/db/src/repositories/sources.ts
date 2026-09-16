import { asc, eq, isNull } from 'drizzle-orm';
import type { Chunk, SourceDoc } from '@epistemics/core';
import type { Db } from '../client.js';
import { chunks, sources } from '../schema.js';
import { batchAll } from './_util.js';
import { chunkToRow } from './chunks.js';

type Row = typeof sources.$inferSelect;

function rowToSource(r: Row): SourceDoc {
  const s: SourceDoc = { id: r.id, title: r.title, kind: r.kind as SourceDoc['kind'], hash: r.hash };
  if (r.licence !== null) s.licence = r.licence;
  if (r.pageCount !== null) s.pageCount = r.pageCount;
  return s;
}

/**
 * Upsert a source document and (re)write its chunks in one transaction. Existing chunks for the source are
 * replaced. `curriculumId` links the source to a curriculum (null for sources still being ingested).
 */
export async function saveSource(
  db: Db, source: SourceDoc, sourceChunks: readonly Chunk[], now: number = Date.now(), curriculumId: string | null = null,
): Promise<void> {
  const row: typeof sources.$inferInsert = {
    id: source.id, curriculumId, title: source.title, kind: source.kind, hash: source.hash,
    licence: source.licence ?? null, pageCount: source.pageCount ?? null, createdAt: now,
  };
  const { id: _id, createdAt: _ca, ...set } = row;
  await batchAll(db, [
    db.insert(sources).values(row).onConflictDoUpdate({ target: sources.id, set }),
    db.delete(chunks).where(eq(chunks.sourceId, source.id)),
    ...sourceChunks.map((c) => db.insert(chunks).values(chunkToRow(c))),
  ]);
}

export async function getSource(db: Db, id: string): Promise<SourceDoc | undefined> {
  const row = await db.select().from(sources).where(eq(sources.id, id)).get();
  return row ? rowToSource(row) : undefined;
}

export async function listSources(db: Db, curriculumId?: string | null): Promise<SourceDoc[]> {
  const where = curriculumId === undefined ? undefined : curriculumId === null ? isNull(sources.curriculumId) : eq(sources.curriculumId, curriculumId);
  const rows = await db.select().from(sources).where(where).orderBy(asc(sources.createdAt)).all();
  return rows.map(rowToSource);
}

export async function setSourceCurriculum(db: Db, sourceId: string, curriculumId: string | null): Promise<void> {
  await db.update(sources).set({ curriculumId }).where(eq(sources.id, sourceId)).run();
}

export async function deleteSource(db: Db, id: string): Promise<void> {
  await batchAll(db, [db.delete(chunks).where(eq(chunks.sourceId, id)), db.delete(sources).where(eq(sources.id, id))]);
}
