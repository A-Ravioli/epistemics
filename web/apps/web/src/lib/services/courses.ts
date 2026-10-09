import type { Course, CourseGoals, CourseSettings, Curriculum, Scaffolding } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import { enrol, getCourse, getCurriculum, listCourses, updateCourse } from '@epistemics/db';
import { currentTimezone } from '../format.js';
import { setActiveCourseId } from '../settings.js';

export function defaultCourseSettings(): CourseSettings {
  return { desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: currentTimezone() };
}

/** Initial scaffolding from the scope interview (DESIGN §3.3). */
export function scaffoldingFromBackground(background: string | undefined, depth: 'intro' | 'working' | 'deep'): Scaffolding {
  const b = (background ?? '').trim();
  if (depth === 'deep' && b.length > 40) return 'advanced';
  if (b.length > 0 || depth !== 'intro') return 'developing';
  return 'novice';
}

export interface EnrolInput {
  curriculum: Curriculum;
  goals: CourseGoals;
  settings?: Partial<CourseSettings>;
  scaffolding?: Scaffolding;
  title?: string;
}

export async function enrolInCurriculum(db: Db, input: EnrolInput, now: number = Date.now()): Promise<Course> {
  const settings: CourseSettings = { ...defaultCourseSettings(), ...(input.settings ?? {}) };
  const course = await enrol(db, input.curriculum, input.goals, settings, now, { title: input.title, scaffolding: input.scaffolding });
  await setActiveCourseId(db, course.id);
  return course;
}

export async function listMyCourses(db: Db): Promise<Course[]> {
  return listCourses(db);
}

export async function getCourseWithCurriculum(db: Db, courseId: string): Promise<{ course: Course; curriculum: Curriculum } | undefined> {
  const course = await getCourse(db, courseId);
  if (!course) return undefined;
  const curriculum = await getCurriculum(db, course.curriculumId, course.curriculumVersion);
  if (!curriculum) return undefined;
  return { course, curriculum };
}

export async function patchCourseSettings(db: Db, courseId: string, patch: Partial<CourseSettings>): Promise<Course | undefined> {
  const course = await getCourse(db, courseId);
  if (!course) return undefined;
  return updateCourse(db, courseId, { settings: { ...course.settings, ...patch } });
}

// --- curriculum lookups (pure) ---

export function allConcepts(c: Curriculum) {
  const out: { concept: Curriculum['units'][number]['lessons'][number]['concepts'][number]; lessonId: string; unitId: string }[] = [];
  for (const u of c.units) for (const l of u.lessons) for (const k of l.concepts) out.push({ concept: k, lessonId: l.id, unitId: u.id });
  return out;
}

export function findLesson(c: Curriculum, lessonId: string) {
  for (const u of c.units) for (const l of u.lessons) if (l.id === lessonId) return { unit: u, lesson: l };
  return undefined;
}

export function findConcept(c: Curriculum, conceptId: string) {
  for (const u of c.units) for (const l of u.lessons) for (const k of l.concepts) if (k.id === conceptId) return { unit: u, lesson: l, concept: k };
  return undefined;
}

export function findItem(c: Curriculum, itemId: string) {
  for (const u of c.units) for (const l of u.lessons) for (const k of l.concepts) for (const i of k.items) if (i.id === itemId) return { unit: u, lesson: l, concept: k, item: i };
  return undefined;
}

export function findUnit(c: Curriculum, unitId: string) {
  return c.units.find((u) => u.id === unitId);
}
