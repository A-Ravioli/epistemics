import { createScheduler, daysToExam, type Course, type Scheduler } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import { getFsrsParams } from '@epistemics/db';

/** Scheduler for a course: fitted parameters when present, exam-date interval cap when set. */
export async function schedulerForCourse(db: Db, course: Course, now: number = Date.now()): Promise<Scheduler> {
  const params = await getFsrsParams(db, course.id);
  return createScheduler({
    w: params?.w.length ? params.w : undefined,
    desiredRetention: course.settings.desiredRetention,
    maximumIntervalDays: course.goals.examDate ? daysToExam(now, course.goals.examDate) : undefined,
  });
}
