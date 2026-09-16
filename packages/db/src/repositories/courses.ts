/**
 * Courses and enrolment.
 *
 * Card activation: enrolling creates one `cards` row per item, all in FSRS state New. Items are introduced by
 * the lesson engine over time, so a freshly created card must not show up in the review queue. We encode
 * "not yet activated" as `due = now + UNACTIVATED_OFFSET_MS` (100 years). `activateCards` moves a concept's
 * cards to `due = now`. Queue queries therefore just filter on `due <= now` and need no extra flag, and
 * `isActivated(card)` distinguishes the two states.
 */
import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { uuidv7 } from '@epistemics/core';
import type { Course, CourseGoals, CourseSettings, Curriculum, Scaffolding } from '@epistemics/core';
import type { Db } from '../client.js';
import { cards, courses } from '../schema.js';
import { batchAll, chunk, parseJson, toJson } from './_util.js';
import { iterateConcepts } from './curricula.js';

export const UNACTIVATED_OFFSET_MS = 100 * 365.25 * 86_400_000;
/** Cards with due at/after this are considered unactivated (50 years out: nothing legitimate is scheduled that far). */
export const UNACTIVATED_THRESHOLD_MS = 50 * 365.25 * 86_400_000;
export function isActivated(card: { due: number }, now: number = Date.now()): boolean {
  return card.due < now + UNACTIVATED_THRESHOLD_MS;
}

type CourseRow = typeof courses.$inferSelect;

function rowToCourse(r: CourseRow): Course {
  return {
    id: r.id, curriculumId: r.curriculumId, curriculumVersion: r.curriculumVersion, title: r.title,
    goals: parseJson<CourseGoals>(r.goalsJson, {} as CourseGoals),
    settings: parseJson<CourseSettings>(r.settingsJson, {} as CourseSettings),
    scaffolding: r.scaffolding as Scaffolding,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export interface NewCourse {
  id?: string;
  curriculumId: string;
  curriculumVersion: number;
  title: string;
  goals: CourseGoals;
  settings: CourseSettings;
  scaffolding?: Scaffolding;
}

export async function createCourse(db: Db, input: NewCourse, now: number = Date.now()): Promise<Course> {
  const course: Course = {
    id: input.id ?? uuidv7(now), curriculumId: input.curriculumId, curriculumVersion: input.curriculumVersion,
    title: input.title, goals: input.goals, settings: input.settings, scaffolding: input.scaffolding ?? 'novice',
    createdAt: now, updatedAt: now,
  };
  await db.insert(courses).values({
    id: course.id, curriculumId: course.curriculumId, curriculumVersion: course.curriculumVersion, title: course.title,
    goalsJson: toJson(course.goals), settingsJson: toJson(course.settings), scaffolding: course.scaffolding,
    createdAt: now, updatedAt: now, deletedAt: null,
  }).run();
  return course;
}

export async function getCourse(db: Db, id: string): Promise<Course | undefined> {
  const row = await db.select().from(courses).where(and(eq(courses.id, id), isNull(courses.deletedAt))).get();
  return row ? rowToCourse(row) : undefined;
}

export async function listCourses(db: Db): Promise<Course[]> {
  const rows = await db.select().from(courses).where(isNull(courses.deletedAt)).orderBy(asc(courses.createdAt)).all();
  return rows.map(rowToCourse);
}

export type CoursePatch = Partial<Pick<Course, 'title' | 'goals' | 'settings' | 'scaffolding'>>;

export async function updateCourse(db: Db, id: string, patch: CoursePatch, now: number = Date.now()): Promise<Course | undefined> {
  const set: Partial<typeof courses.$inferInsert> = { updatedAt: now };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.goals !== undefined) set.goalsJson = toJson(patch.goals);
  if (patch.settings !== undefined) set.settingsJson = toJson(patch.settings);
  if (patch.scaffolding !== undefined) set.scaffolding = patch.scaffolding;
  await db.update(courses).set(set).where(eq(courses.id, id)).run();
  return getCourse(db, id);
}

export async function deleteCourse(db: Db, id: string, now: number = Date.now()): Promise<void> {
  await db.update(courses).set({ deletedAt: now, updatedAt: now }).where(eq(courses.id, id)).run();
}

/**
 * Create a course for `curriculum` and one New card per item. Cards start unactivated
 * (see module doc); call `activateCards` when the lesson engine introduces a concept.
 */
export async function enrol(
  db: Db, curriculum: Curriculum, goals: CourseGoals, settings: CourseSettings, now: number = Date.now(),
  opts: { title?: string; scaffolding?: Scaffolding; id?: string } = {},
): Promise<Course> {
  const m = curriculum.manifest;
  const course = await createCourse(db, {
    id: opts.id, curriculumId: m.id, curriculumVersion: m.version, title: opts.title ?? m.title,
    goals, settings, scaffolding: opts.scaffolding,
  }, now);
  const rows: (typeof cards.$inferInsert)[] = [];
  for (const { concept } of iterateConcepts(curriculum)) {
    for (const item of concept.items) {
      rows.push({
        id: uuidv7(now), courseId: course.id, itemId: item.id, conceptId: concept.id,
        state: 0, due: now + UNACTIVATED_OFFSET_MS, lastReview: null,
        stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0,
        suspended: 0, provisional: 0, updatedAt: now,
      });
    }
  }
  await batchAll(db, chunk(rows, 100).map((slice) => db.insert(cards).values(slice)));
  return course;
}

/** Make a concept's unactivated cards due now. Returns the number of cards activated. */
export async function activateCards(db: Db, courseId: string, conceptId: string, now: number = Date.now()): Promise<number> {
  const threshold = now + UNACTIVATED_THRESHOLD_MS;
  const before = await db.select({ id: cards.id }).from(cards)
    .where(and(eq(cards.courseId, courseId), eq(cards.conceptId, conceptId), gte(cards.due, threshold))).all();
  if (before.length === 0) return 0;
  await db.update(cards).set({ due: now, updatedAt: now })
    .where(and(eq(cards.courseId, courseId), eq(cards.conceptId, conceptId), gte(cards.due, threshold))).run();
  return before.length;
}
