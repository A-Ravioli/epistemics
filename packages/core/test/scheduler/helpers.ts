import type { Card, CourseSettings } from '../../src/types.js';
import { createScheduler, type SchedulerParams } from '../../src/scheduler/index.js';

/** 2026-03-10 12:00 UTC, a Tuesday. */
export const NOW = Date.UTC(2026, 2, 10, 12);
export const DAY = 86_400_000;
export const HOUR = 3_600_000;

export const settings: CourseSettings = {
  desiredRetention: 0.9,
  reviewsPerDay: 120,
  maxNewItemsPerDay: 40,
  easyDays: [],
  dayStartHour: 4,
  timezone: 'UTC',
};

export function mkScheduler(over: Partial<SchedulerParams> = {}) {
  return createScheduler({ desiredRetention: 0.9, enableFuzz: false, ...over });
}

let seq = 0;
export function mkCard(over: Partial<Card> = {}): Card {
  seq += 1;
  return {
    id: over.id ?? `card-${seq}`,
    courseId: 'course-1',
    itemId: over.itemId ?? `item-${seq}`,
    conceptId: over.conceptId ?? `concept-${seq}`,
    state: 0,
    due: NOW,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    suspended: false,
    provisional: false,
    ...over,
  };
}

/** A Review-state card last reviewed `daysAgo` days before NOW with the given stability. */
export function reviewCard(daysAgo: number, stability: number, over: Partial<Card> = {}): Card {
  const lastReview = NOW - daysAgo * DAY;
  return mkCard({
    state: 2,
    stability,
    difficulty: 5,
    lastReview,
    due: lastReview + stability * DAY,
    scheduledDays: Math.round(stability),
    reps: 3,
    ...over,
  });
}
