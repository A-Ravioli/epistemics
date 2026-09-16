import type { Course, Curriculum, Scheduler } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import type { LlmProvider } from '@epistemics/llm';

/** Everything a service or runner needs for one course. Built once per screen by the app state. */
export interface CourseContext {
  db: Db;
  provider: LlmProvider;
  course: Course;
  curriculum: Curriculum;
  scheduler: Scheduler;
  now: () => number;
}

export function dayCfg(ctx: Pick<CourseContext, 'course'>) {
  return { timezone: ctx.course.settings.timezone, dayStartHour: ctx.course.settings.dayStartHour };
}
