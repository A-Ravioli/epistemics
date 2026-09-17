import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from '@epistemics/core';
import type { LessonPhase, ObserverResult, Session, SessionType, Turn } from '@epistemics/core';
import type { Db } from '../client.js';
import { sessions, turns } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';
import { dirtyQueries, markDirty, type WriteOptions } from './_outbox.js';

type SessionRow = typeof sessions.$inferSelect;
type TurnRow = typeof turns.$inferSelect;

function rowToSession(r: SessionRow): Session {
  const s: Session = { id: r.id, courseId: r.courseId, type: r.type as SessionType, startedAt: r.startedAt };
  if (r.lessonId !== null) s.lessonId = r.lessonId;
  if (r.unitId !== null) s.unitId = r.unitId;
  if (r.endedAt !== null) s.endedAt = r.endedAt;
  if (r.summaryJson !== null) s.summary = parseJson<Record<string, unknown>>(r.summaryJson, {});
  return s;
}

export interface NewSession { id?: string; courseId: string; type: SessionType; lessonId?: string; unitId?: string }

export async function createSession(db: Db, input: NewSession, now: number = Date.now()): Promise<Session> {
  const id = input.id ?? uuidv7(now);
  await batchAll(db, [
    db.insert(sessions).values({
      id, courseId: input.courseId, type: input.type, lessonId: input.lessonId ?? null, unitId: input.unitId ?? null,
      startedAt: now, endedAt: null, summaryJson: null, stateJson: null, updatedAt: now,
    }),
    ...dirtyQueries(db, 'sessions', [id], now),
  ]);
  const s: Session = { id, courseId: input.courseId, type: input.type, startedAt: now };
  if (input.lessonId) s.lessonId = input.lessonId;
  if (input.unitId) s.unitId = input.unitId;
  return s;
}

export async function getSession(db: Db, id: string): Promise<Session | undefined> {
  const row = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  return row ? rowToSession(row) : undefined;
}

export type SessionPatch = Partial<Pick<Session, 'lessonId' | 'unitId' | 'endedAt' | 'summary'>>;

export async function updateSession(db: Db, id: string, patch: SessionPatch, now: number = Date.now()): Promise<void> {
  const set: Partial<typeof sessions.$inferInsert> = {};
  if (patch.lessonId !== undefined) set.lessonId = patch.lessonId;
  if (patch.unitId !== undefined) set.unitId = patch.unitId;
  if (patch.endedAt !== undefined) set.endedAt = patch.endedAt;
  if (patch.summary !== undefined) set.summaryJson = toJson(patch.summary);
  if (Object.keys(set).length === 0) return;
  set.updatedAt = now;
  await db.update(sessions).set(set).where(eq(sessions.id, id)).run();
  await markDirty(db, 'sessions', id, now);
}

export async function endSession(db: Db, id: string, summary: Record<string, unknown> | undefined, now: number = Date.now()): Promise<void> {
  await db.update(sessions).set({ endedAt: now, summaryJson: summary === undefined ? null : toJson(summary), stateJson: null, updatedAt: now })
    .where(eq(sessions.id, id)).run();
  await markDirty(db, 'sessions', id, now);
}

export async function listSessions(db: Db, courseId: string, opts: { type?: SessionType; limit?: number } = {}): Promise<Session[]> {
  const where = opts.type ? and(eq(sessions.courseId, courseId), eq(sessions.type, opts.type)) : eq(sessions.courseId, courseId);
  const q = db.select().from(sessions).where(where).orderBy(desc(sessions.startedAt));
  const rows = opts.limit ? await q.limit(opts.limit).all() : await q.all();
  return rows.map(rowToSession);
}

/** Most recent session of `type` for the course that has not ended (resumable). */
export async function getOpenSession(db: Db, courseId: string, type: SessionType): Promise<Session | undefined> {
  const row = await db.select().from(sessions)
    .where(and(eq(sessions.courseId, courseId), eq(sessions.type, type), isNull(sessions.endedAt)))
    .orderBy(desc(sessions.startedAt)).get();
  return row ? rowToSession(row) : undefined;
}

/** Persist serialised engine state for resume. Accepts a pre-serialised string or any JSON value. */
export async function saveState(db: Db, sessionId: string, state: string | unknown, now: number = Date.now()): Promise<void> {
  const stateJson = typeof state === 'string' ? state : toJson(state);
  await db.update(sessions).set({ stateJson, updatedAt: now }).where(eq(sessions.id, sessionId)).run();
  await markDirty(db, 'sessions', sessionId, now);
}

export async function getState<T = unknown>(db: Db, sessionId: string): Promise<T | undefined> {
  const row = await db.select({ stateJson: sessions.stateJson }).from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row || row.stateJson === null) return undefined;
  return parseJson<T | undefined>(row.stateJson, undefined);
}

function rowToTurn(r: TurnRow): Turn {
  const t: Turn = { id: r.id, sessionId: r.sessionId, ordinal: r.ordinal, role: r.role as Turn['role'], content: r.content, createdAt: r.createdAt };
  if (r.phase !== null) t.phase = r.phase as LessonPhase;
  if (r.conceptId !== null) t.conceptId = r.conceptId;
  if (r.hintLevel !== null) t.hintLevel = r.hintLevel;
  if (r.observerJson !== null) t.observer = parseJson<ObserverResult | undefined>(r.observerJson, undefined);
  return t;
}

export async function saveTurns(db: Db, list: readonly Turn[], now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  await batchAll(db, [
    ...list.map((t) => {
      const row: typeof turns.$inferInsert = {
        id: t.id, sessionId: t.sessionId, ordinal: t.ordinal, role: t.role, content: t.content,
        phase: t.phase ?? null, conceptId: t.conceptId ?? null, hintLevel: t.hintLevel ?? null,
        observerJson: t.observer === undefined ? null : toJson(t.observer), createdAt: t.createdAt, updatedAt: now,
      };
      const { id: _id, ...set } = row;
      return db.insert(turns).values(row).onConflictDoUpdate({ target: turns.id, set });
    }),
    ...dirtyQueries(db, 'turns', list.map((t) => t.id), now, opts),
  ]);
}

export async function getTurns(db: Db, sessionId: string): Promise<Turn[]> {
  const rows = await db.select().from(turns).where(eq(turns.sessionId, sessionId)).orderBy(asc(turns.ordinal)).all();
  return rows.map(rowToTurn);
}
