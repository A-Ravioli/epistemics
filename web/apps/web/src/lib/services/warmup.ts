/**
 * Warm-up brain dump (DESIGN §3.2): free recall of the last lesson, graded blind. Recalled concepts get a
 * review with rating Good on their activated cards; missed concepts go first in today's queue.
 */
import { buildWarmupPrompt, mapWarmupResult, uuidv7, type Lesson, type WarmupOutcome } from '@epistemics/core';
import { appendReviewLogs, createSession, endSession, getCards, isActivated, listSessions, saveCards } from '@epistemics/db';
import { gradeWarmup } from '@epistemics/llm';
import { getWarmupDay, setQueueFirst, setWarmupDay } from '../settings.js';
import type { CourseContext } from './context.js';
import { findLesson } from './courses.js';
import { todayKey } from './queue.js';

export interface WarmupOffer {
  lesson: Lesson;
  prompt: string;
}

/** The warm-up for today, or undefined when there is no completed lesson or it was already done today. */
export async function warmupOffer(ctx: CourseContext): Promise<WarmupOffer | undefined> {
  const done = await getWarmupDay(ctx.db, ctx.course.id);
  if (done === todayKey(ctx)) return undefined;
  const last = (await listSessions(ctx.db, ctx.course.id, { type: 'lesson' })).find((s) => s.endedAt !== undefined && s.lessonId && !s.lessonId.startsWith('remediation:'));
  if (!last?.lessonId) return undefined;
  const found = findLesson(ctx.curriculum, last.lessonId);
  if (!found) return undefined;
  return { lesson: found.lesson, prompt: buildWarmupPrompt(found.lesson) };
}

export interface WarmupResultView extends WarmupOutcome {
  partial: string[];
  reviewedCards: number;
}

export async function runWarmup(ctx: CourseContext, lesson: Lesson, dump: string): Promise<WarmupResultView> {
  const now = ctx.now();
  const session = await createSession(ctx.db, { courseId: ctx.course.id, type: 'warmup', lessonId: lesson.id }, now);
  const result = await gradeWarmup(ctx.provider, {
    dump,
    concepts: lesson.concepts.map((c) => ({ id: c.id, name: c.name, definition: c.definition })),
    metadata: { sessionId: session.id, courseId: ctx.course.id },
  });
  const outcome = mapWarmupResult(result.recalledConceptIds, lesson);

  const all = await getCards(ctx.db, ctx.course.id);
  const recalled = new Set(outcome.reviewed.map((r) => r.conceptId));
  const targets = all.filter((c) => recalled.has(c.conceptId) && isActivated(c, now) && c.state !== 0 && !c.suspended);
  const outs = targets.map((c) => ctx.scheduler.applyRating(c, 3, now, { source: 'warmup', assisted: false }));
  if (outs.length > 0) {
    await saveCards(ctx.db, outs.map((o) => o.card), now);
    await appendReviewLogs(ctx.db, outs.map((o) => ({ id: uuidv7(now), ...o.log })));
  }
  await setQueueFirst(ctx.db, ctx.course.id, outcome.queuedFirst);
  await setWarmupDay(ctx.db, ctx.course.id, todayKey(ctx));
  await endSession(ctx.db, session.id, { lessonId: lesson.id, recalled: result.recalledConceptIds, partial: result.partial, missed: outcome.queuedFirst, dump }, now);
  return { ...outcome, partial: result.partial, reviewedCards: outs.length };
}
