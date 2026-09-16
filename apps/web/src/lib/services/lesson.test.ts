import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCards, getJols, getReceipts, getSession, getState, listSessions, listConceptStates } from '@epistemics/db';
import { TINY } from '../../../test-fixtures/tiny-pack.js';
import { LessonRunner, type PersistedLesson } from './lesson.js';
import { getPendingRemediation } from '../settings.js';
import { testContext, type TestContext } from './test-context.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await testContext();
});
afterEach(async () => {
  LessonRunner.forget(ctx.course.id, TINY.lessonId);
  await ctx.exec.close();
});

const A = TINY.answers;

describe('LessonRunner with the mock provider', () => {
  it('runs a whole lesson: PRIME → CHECK → WRAP, activating items and persisting state along the way', async () => {
    const runner = await LessonRunner.open(ctx, TINY.lessonId);
    await runner.start();
    let v = runner.store.get();
    expect(v.state.phase).toBe('PRIME');
    expect(v.messages.filter((m) => m.role === 'tutor')).toHaveLength(1);
    expect(v.inputMode).toBe('answer_confidence');
    expect(v.busy).toBeNull();

    // state persisted after the reduce
    const saved = await getState<PersistedLesson>(ctx.db, runner.sessionId);
    expect(saved?.state.phase).toBe('PRIME');

    await runner.submit(A.pretest, 2);
    v = runner.store.get();
    expect(v.state.phase).toBe('PROBE');
    expect(v.messages.some((m) => m.role === 'system' && m.content === "Let's find out.")).toBe(true);
    // pretest receipt recorded, unassisted
    let receipts = await getReceipts(ctx.db, ctx.course.id);
    expect(receipts.map((r) => r.itemId)).toEqual([`${TINY.concept1}#pretest`]);
    expect(receipts[0]!.assisted).toBe(false);
    expect(receipts[0]!.confidence).toBe(2);

    await runner.submit(A.probe);
    v = runner.store.get();
    expect(v.state.phase).toBe('DEVELOP');
    expect(v.state.hintLevel).toBe(0);

    await runner.giveUp();
    v = runner.store.get();
    expect(v.state.phase).toBe('CONSOLIDATE');

    await runner.submit(A.consolidate);
    v = runner.store.get();
    expect(v.state.phase).toBe('EXTEND');
    receipts = await getReceipts(ctx.db, ctx.course.id);
    const consolidate = receipts.find((r) => r.itemId === TINY.explainItem);
    expect(consolidate?.assisted).toBe(true);
    expect(consolidate?.rating).toBeGreaterThanOrEqual(3);

    await runner.submit(A.transfer);
    v = runner.store.get();
    expect(v.state.phase).toBe('CHECK');
    expect(v.inputMode).toBe('answer_confidence');
    // nothing activated yet
    expect((await getCards(ctx.db, ctx.course.id)).every((c) => c.state === 0)).toBe(true);

    await runner.submit(A.check, 3);
    v = runner.store.get();
    expect(v.state.checkResults[TINY.concept1]?.rating).toBeGreaterThanOrEqual(3);
    expect(v.state.phase).toBe('WRAP');
    expect(v.inputMode).toBe('summary');
    const cards = (await getCards(ctx.db, ctx.course.id)).filter((c) => c.conceptId === TINY.concept1);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.state === 1)).toBe(true); // activated: Learning

    await runner.submitSummary(A.summary);
    v = runner.store.get();
    expect(v.inputMode).toBe('jol');
    expect(v.messages.filter((m) => m.role === 'tutor' && m.phase === 'WRAP')).toHaveLength(1);

    await runner.submitJol({ [TINY.concept1]: 0.8 });
    v = runner.store.get();
    expect(v.inputMode).toBe('done');
    expect(v.state.done).toBe(true);

    const session = await getSession(ctx.db, runner.sessionId);
    expect(session?.endedAt).toBeDefined();
    expect(session?.summary?.['summaryText']).toBe(A.summary);
    expect(await getState(ctx.db, runner.sessionId)).toBeUndefined();
    const jols = await getJols(ctx.db, ctx.course.id);
    expect(jols).toHaveLength(1);
    expect(jols[0]!.predictedRecall).toBe(0.8);
    const cs = (await listConceptStates(ctx.db, ctx.course.id)).find((s) => s.conceptId === TINY.concept1);
    expect(cs?.unassistedN).toBe(2); // pretest + check
    expect(cs?.assistedN).toBe(2); // consolidate + transfer
    expect(cs?.successfulSessions).toBe(1);
    expect(await getPendingRemediation(ctx.db, ctx.course.id)).toEqual([]);

    // tutor calls carried the learner model, no reference text, and a control message
    const tutorCalls = ctx.provider.calls.filter((c) => c.role === 'tutor');
    expect(tutorCalls.length).toBeGreaterThanOrEqual(5);
    for (const call of tutorCalls) {
      const ctxText = call.system[1]!.text;
      expect(ctxText).not.toContain('5/6 for the die');
      expect(call.messages[0]!.content).toContain('LEARNER MODEL');
      expect(call.messages[call.messages.length - 1]!.role).toBe('system');
    }
  });

  it('a failed CHECK enters REMEDIATE, then a second failure schedules remediation and activates with the check rating', async () => {
    const runner = await LessonRunner.open(ctx, TINY.lessonId);
    await runner.start();
    await runner.submit('no idea', 1);
    await runner.submit(A.probe);
    await runner.giveUp(); // DEVELOP → CONSOLIDATE
    await runner.submit(A.consolidate);
    await runner.submit(A.transfer);
    expect(runner.store.get().state.phase).toBe('CHECK');
    await runner.submit('it is always a half', 3); // certain and wrong → Again, hypercorrection
    let v = runner.store.get();
    expect(v.state.phase).toBe('REMEDIATE');
    expect(v.state.checkResults[TINY.concept1]?.rating).toBe(1);
    await runner.giveUp(); // REMEDIATE → CHECK
    expect(runner.store.get().state.phase).toBe('CHECK');
    await runner.giveUp(); // second failure
    v = runner.store.get();
    expect(v.state.phase).toBe('WRAP');
    expect(await getPendingRemediation(ctx.db, ctx.course.id)).toEqual([TINY.concept1]);
    const cards = (await getCards(ctx.db, ctx.course.id)).filter((c) => c.conceptId === TINY.concept1);
    expect(cards.every((c) => c.state === 1 && c.reps === 1)).toBe(true);
  });

  it('resumes from persisted state after a reload', async () => {
    const runner = await LessonRunner.open(ctx, TINY.lessonId);
    await runner.start();
    await runner.submit(A.pretest, 2);
    await runner.submit(A.probe);
    expect(runner.store.get().state.phase).toBe('DEVELOP');
    const transcriptLen = runner.store.get().state.transcript.length;

    LessonRunner.forget(ctx.course.id, TINY.lessonId);
    const resumed = await LessonRunner.open(ctx, TINY.lessonId);
    expect(resumed).not.toBe(runner);
    expect(resumed.sessionId).toBe(runner.sessionId);
    await resumed.start();
    const v = resumed.store.get();
    expect(v.state.phase).toBe('DEVELOP');
    expect(v.state.transcript).toHaveLength(transcriptLen);
    expect(v.messages.some((m) => m.role === 'system')).toBe(true); // notes restored
    expect((await listSessions(ctx.db, ctx.course.id, { type: 'lesson' })).filter((s) => s.endedAt === undefined)).toHaveLength(1);
  });

  it('a leaking tutor reply is regenerated with a strict control message', async () => {
    const leak = 'The answer is one minus the probability of the event, so it is 0.7 for rain and 5/6 for the die.';
    ctx.provider.push('tutor', leak, 'Second try: what do you think the two outcomes add up to?');
    const runner = await LessonRunner.open(ctx, TINY.lessonId);
    await runner.start();
    const v = runner.store.get();
    expect(v.messages.filter((m) => m.role === 'tutor')).toHaveLength(1);
    expect(v.messages[0]!.content).toContain('Second try');
    const calls = ctx.provider.calls.filter((c) => c.role === 'tutor');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.messages[calls[1]!.messages.length - 1]!.content).toContain('STRICT REGENERATION');
  });
});
