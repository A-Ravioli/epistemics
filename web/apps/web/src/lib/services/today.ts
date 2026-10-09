/**
 * The Today read-model (DESIGN §3.2): queue summary, next lesson with its lock reason, checkpoint
 * availability, teach-back suggestions and the reviews-cleared streak.
 */
import { nextAvailableLesson, studyDay, DAY_MS, type Curriculum, type Lesson, type Unit } from '@epistemics/core';
import { listConceptStates, listSessions } from '@epistemics/db';
import { getClearedDays, getGateOverrideDay, getPendingRemediation, getQueueFirst, markDayCleared } from '../settings.js';
import { dayCfg, type CourseContext } from './context.js';
import { findConcept } from './courses.js';
import { loadQueue, todayKey, type LoadedQueue } from './queue.js';
import { warmupOffer, type WarmupOffer } from './warmup.js';

export interface TodayModel {
  day: string;
  queue: LoadedQueue;
  warmup?: WarmupOffer;
  nextLesson: Lesson | null;
  nextUnit?: Unit;
  /** Ordinal of the unit the learner is in; the Today screen keeps units generated two ahead of it. */
  currentUnitOrdinal: number;
  lessonLocked: boolean;
  lockReason?: string;
  overrideUsedToday: boolean;
  recoveryMode: boolean;
  completedLessonIds: Set<string>;
  checkpoint?: { unit: Unit; ready: boolean; reason?: string };
  remediation: { conceptId: string; name: string }[];
  teachback: { conceptId: string; name: string; mastery: number }[];
  streak: number;
  openLesson?: { lessonId: string; title: string };
}

/** The curriculum restricted to lessons that have concepts (built units). */
export function builtOnly(curriculum: Curriculum): Curriculum {
  return { ...curriculum, units: curriculum.units.map((u) => ({ ...u, lessons: u.lessons.filter((l) => l.concepts.length > 0) })) };
}

/** The ordinal of the unit the learner is currently in: the next lesson's unit, else the last unit with a completed lesson. */
export function currentUnitOrdinal(curriculum: Curriculum, nextUnit: Unit | undefined, completed: Set<string>): number {
  if (nextUnit) return nextUnit.ordinal;
  const units = [...curriculum.units].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = units.length - 1; i >= 0; i--) if (units[i]!.lessons.some((l) => completed.has(l.id))) return units[i]!.ordinal;
  return units[0]?.ordinal ?? 0;
}

export async function completedLessons(ctx: CourseContext): Promise<Set<string>> {
  const sessions = await listSessions(ctx.db, ctx.course.id, { type: 'lesson' });
  const out = new Set<string>();
  for (const s of sessions) if (s.endedAt !== undefined && s.lessonId && !s.lessonId.startsWith('remediation:') && s.summary?.['remediation'] !== true) out.add(s.lessonId);
  return out;
}

export function streakFromDays(cleared: string[], today: string): number {
  const set = new Set(cleared);
  let streak = 0;
  let cursor = new Date(`${today}T00:00:00Z`).getTime();
  // Today counts if cleared; otherwise start from yesterday so an unfinished day does not break the streak.
  if (!set.has(today)) cursor -= DAY_MS;
  for (;;) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export async function loadToday(ctx: CourseContext): Promise<TodayModel> {
  const day = todayKey(ctx);
  const queueFirst = await getQueueFirst(ctx.db, ctx.course.id);
  const queue = await loadQueue(ctx, { queueFirstConceptIds: queueFirst });
  const states = await listConceptStates(ctx.db, ctx.course.id);
  const mastery = new Map(states.map((s) => [s.conceptId, s.mastery]));
  const completed = await completedLessons(ctx);
  // Lessons of units that are not generated yet (lazy build, DESIGN §8.1 step 7) have no concepts and must never be offered.
  const nextLesson = nextAvailableLesson(builtOnly(ctx.curriculum), mastery, completed);
  const nextUnit = nextLesson ? ctx.curriculum.units.find((u) => u.lessons.some((l) => l.id === nextLesson.id)) : undefined;
  const overrideDay = await getGateOverrideDay(ctx.db, ctx.course.id);
  const overrideUsedToday = overrideDay === day;

  let lessonLocked = false;
  let lockReason: string | undefined;
  if (queue.queue.recoveryMode) {
    lessonLocked = true;
    lockReason = `Recovery mode: the backlog is ${queue.queue.overdueDays} days old. About ${queue.queue.daysToClear} day(s) to clear at ${ctx.course.settings.reviewsPerDay} reviews a day.`;
  } else if (!queue.queue.gateOpen) {
    lessonLocked = true;
    const n = queue.queue.dueToday;
    lockReason = `${n} review${n === 1 ? '' : 's'} to go, ~${queue.minutes} min.`;
  }

  if (queue.queue.dueToday === 0 && queue.cards.some((c) => c.state !== 0)) await markDayCleared(ctx.db, ctx.course.id, day);
  const streak = streakFromDays(await getClearedDays(ctx.db, ctx.course.id), day);

  // Checkpoint: current unit fully taught and each concept retrieved successfully in ≥2 spaced sessions.
  let checkpoint: TodayModel['checkpoint'];
  const checkpointsDone = new Set((await listSessions(ctx.db, ctx.course.id, { type: 'checkpoint' })).filter((s) => s.endedAt !== undefined).map((s) => s.unitId));
  for (const unit of [...ctx.curriculum.units].sort((a, b) => a.ordinal - b.ordinal)) {
    if (checkpointsDone.has(unit.id)) continue;
    const taught = unit.lessons.every((l) => completed.has(l.id));
    if (!taught) break;
    const sessionsOf = (id: string) => states.find((s) => s.conceptId === id)?.successfulSessions ?? 0;
    const short = unit.lessons.flatMap((l) => l.concepts).filter((c) => sessionsOf(c.id) < 2);
    checkpoint = short.length === 0
      ? { unit, ready: true }
      : { unit, ready: false, reason: `${short.length} concept${short.length === 1 ? '' : 's'} still need${short.length === 1 ? 's' : ''} a second spaced retrieval.` };
    break;
  }

  const remediation = (await getPendingRemediation(ctx.db, ctx.course.id))
    .map((id) => ({ conceptId: id, name: findConcept(ctx.curriculum, id)?.concept.name ?? id }));

  const teachback = states
    .filter((s) => s.mastery >= 0.6 && s.mastery <= 0.85)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3)
    .map((s) => ({ conceptId: s.conceptId, name: findConcept(ctx.curriculum, s.conceptId)?.concept.name ?? s.conceptId, mastery: s.mastery }));

  const openSession = (await listSessions(ctx.db, ctx.course.id, { type: 'lesson' })).find((s) => s.endedAt === undefined && s.lessonId);
  const openLesson = openSession?.lessonId
    ? { lessonId: openSession.lessonId, title: openSession.lessonId.startsWith('remediation:') ? `Remediation: ${findConcept(ctx.curriculum, openSession.lessonId.slice('remediation:'.length))?.concept.name ?? ''}` : ctx.curriculum.units.flatMap((u) => u.lessons).find((l) => l.id === openSession.lessonId)?.title ?? 'lesson' }
    : undefined;

  return {
    day,
    queue,
    warmup: await warmupOffer(ctx),
    nextLesson,
    nextUnit,
    currentUnitOrdinal: currentUnitOrdinal(ctx.curriculum, nextUnit, completed),
    lessonLocked,
    lockReason,
    overrideUsedToday,
    recoveryMode: queue.queue.recoveryMode,
    completedLessonIds: completed,
    checkpoint,
    remediation,
    teachback,
    streak,
    openLesson,
  };
}

export function studyDayOf(ctx: CourseContext, at: number): string {
  return studyDay(at, dayCfg(ctx));
}
