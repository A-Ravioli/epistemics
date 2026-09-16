import { and, eq } from 'drizzle-orm';
import type { ConceptState } from '@epistemics/core';
import type { Db } from '../client.js';
import { conceptState } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';

type Row = typeof conceptState.$inferSelect;

function rowToState(r: Row): ConceptState {
  const s: ConceptState = {
    courseId: r.courseId, conceptId: r.conceptId, mastery: r.mastery, successfulSessions: r.successfulSessions,
    misconceptions: parseJson<string[]>(r.misconceptionsJson, []),
    assistedPass: r.assistedPass, assistedN: r.assistedN, unassistedPass: r.unassistedPass, unassistedN: r.unassistedN,
    updatedAt: r.updatedAt,
  };
  if (r.lastSuccessDay !== null) s.lastSuccessDay = r.lastSuccessDay;
  return s;
}

function stateToRow(s: ConceptState): typeof conceptState.$inferInsert {
  return {
    courseId: s.courseId, conceptId: s.conceptId, mastery: s.mastery, successfulSessions: s.successfulSessions,
    lastSuccessDay: s.lastSuccessDay ?? null, misconceptionsJson: toJson(s.misconceptions),
    assistedPass: s.assistedPass, assistedN: s.assistedN, unassistedPass: s.unassistedPass, unassistedN: s.unassistedN,
    updatedAt: s.updatedAt,
  };
}

export function emptyConceptState(courseId: string, conceptId: string, now: number): ConceptState {
  return { courseId, conceptId, mastery: 0, successfulSessions: 0, misconceptions: [], assistedPass: 0, assistedN: 0, unassistedPass: 0, unassistedN: 0, updatedAt: now };
}

export async function getConceptState(db: Db, courseId: string, conceptId: string): Promise<ConceptState | undefined> {
  const row = await db.select().from(conceptState)
    .where(and(eq(conceptState.courseId, courseId), eq(conceptState.conceptId, conceptId))).get();
  return row ? rowToState(row) : undefined;
}

export async function upsertConceptState(db: Db, state: ConceptState): Promise<void> {
  const row = stateToRow(state);
  const { courseId: _c, conceptId: _k, ...set } = row;
  await db.insert(conceptState).values(row)
    .onConflictDoUpdate({ target: [conceptState.courseId, conceptState.conceptId], set }).run();
}

export async function upsertConceptStates(db: Db, states: readonly ConceptState[]): Promise<void> {
  await batchAll(db, states.map((s) => {
    const row = stateToRow(s);
    const { courseId: _c, conceptId: _k, ...set } = row;
    return db.insert(conceptState).values(row).onConflictDoUpdate({ target: [conceptState.courseId, conceptState.conceptId], set });
  }));
}

export async function listConceptStates(db: Db, courseId: string): Promise<ConceptState[]> {
  const rows = await db.select().from(conceptState).where(eq(conceptState.courseId, courseId)).all();
  return rows.map(rowToState);
}
