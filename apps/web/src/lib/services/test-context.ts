/** Test helper: an in-memory course context on the node executor with the mock provider. Not bundled. */
import { createScheduler, type Course } from '@epistemics/core';
import { createDb, enrol, saveCurriculum, type DbExecutor } from '@epistemics/db';
import { createNodeExecutor } from '@epistemics/db/node';
import { createMockProvider, type MockProvider } from '@epistemics/llm';
import { tinyPack } from '../../../test-fixtures/tiny-pack.js';
import type { CourseContext } from './context.js';

export interface TestContext extends CourseContext {
  exec: DbExecutor;
  provider: MockProvider;
  /** Mutable clock; `ctx.now()` reads it. */
  clock: { now: number };
}

export const T0 = Date.UTC(2026, 2, 10, 15, 0, 0); // 2026-03-10 15:00 UTC

export async function testContext(opts: { now?: number } = {}): Promise<TestContext> {
  const exec = createNodeExecutor(':memory:');
  await exec.migrate();
  const db = createDb(exec);
  const clock = { now: opts.now ?? T0 };
  const curriculum = tinyPack();
  await saveCurriculum(db, curriculum, clock.now);
  const course: Course = await enrol(
    db,
    curriculum,
    { purpose: 'understand', weeklyMinutes: 120 },
    { desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: 'UTC' },
    clock.now,
    { scaffolding: 'developing' },
  );
  const provider = createMockProvider();
  return { exec, db, provider, course, curriculum, scheduler: createScheduler({ desiredRetention: 0.9 }), now: () => clock.now, clock };
}
