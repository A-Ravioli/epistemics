import type { Course, Curriculum, Scheduler } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import type { LlmProvider, UsageLedger } from '@epistemics/llm';

/** Everything a service or runner needs for one course. Built once per screen by the app state. */
export interface CourseContext {
  db: Db;
  provider: LlmProvider;
  course: Course;
  curriculum: Curriculum;
  scheduler: Scheduler;
  now: () => number;
  /** Usage ledger for the per-day cost guard (DESIGN §7.3); absent in tests. */
  ledger?: UsageLedger;
  /** USD per study day for this course; 0/undefined = unlimited. */
  dailyBudgetUsd?: number;
}

export function dayCfg(ctx: Pick<CourseContext, 'course'>) {
  return { timezone: ctx.course.settings.timezone, dayStartHour: ctx.course.settings.dayStartHour };
}
