import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_MS } from '@epistemics/core';
import { createSession, getCards, getConceptState, getReceipts, getReviewLog, isActivated } from '@epistemics/db';
import { TINY } from '../../../test-fixtures/tiny-pack.js';
import { activateConcept, applyReview, grantImplicitCredit, loadQueue } from './queue.js';
import { testContext, type TestContext } from './test-context.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await testContext();
});
afterEach(async () => {
  await ctx.exec.close();
});

describe('queue persistence', () => {
  it('enrolled cards are unactivated and the gate is open', async () => {
    const q = await loadQueue(ctx);
    expect(q.cards).toHaveLength(0);
    expect(q.queue.gateOpen).toBe(true);
    expect(q.order).toHaveLength(0);
    const all = await getCards(ctx.db, ctx.course.id);
    expect(all).toHaveLength(4);
    expect(all.every((c) => !isActivated(c, ctx.now()))).toBe(true);
  });

  it('activateConcept applies the CHECK result as the first review and the cards become due', async () => {
    const cards = await activateConcept(ctx, TINY.concept1, 3);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.state === 1)).toBe(true); // Learning
    const log = await getReviewLog(ctx.db, ctx.course.id);
    expect(log).toHaveLength(2);
    expect(log.every((l) => l.source === 'lesson' && l.stateBefore === 0 && l.rating === 3)).toBe(true);

    const q = await loadQueue(ctx);
    expect(q.queue.dueToday).toBe(2);
    expect(q.queue.gateOpen).toBe(false);
    // sibling burying: one card per concept per build
    expect(q.order).toHaveLength(1);
    expect(q.queue.buried).toHaveLength(1);
    expect(q.minutes).toBe(1);
  });

  it('applyReview persists the card, the log, the receipt and the concept state', async () => {
    await activateConcept(ctx, TINY.concept1, 3);
    const session = await createSession(ctx.db, { courseId: ctx.course.id, type: 'review' }, ctx.now());
    ctx.clock.now += 11 * 60_000;
    const q = await loadQueue(ctx);
    const card = q.order[0]!;
    const res = await applyReview(ctx, {
      card,
      rating: 3,
      source: 'review',
      assisted: false,
      confidence: 2,
      durationMs: 4200,
      receipt: { sessionId: session.id, answer: 'one minus' },
    });
    expect(res.card.reps).toBe(card.reps + 1);
    const saved = (await getCards(ctx.db, ctx.course.id)).find((c) => c.id === card.id)!;
    expect(saved.state).toBe(res.card.state);
    expect(saved.due).toBe(res.card.due);
    const log = await getReviewLog(ctx.db, ctx.course.id);
    const mine = log.filter((l) => l.cardId === card.id && l.source === 'review');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.confidence).toBe(2);
    expect(mine[0]!.durationMs).toBe(4200);
    const receipts = await getReceipts(ctx.db, ctx.course.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.itemId).toBe(card.itemId);
    const cs = await getConceptState(ctx.db, ctx.course.id, TINY.concept1);
    expect(cs?.unassistedN).toBe(1);
    expect(cs?.unassistedPass).toBe(1);
    expect(cs?.successfulSessions).toBe(1);
    expect(cs?.lastSuccessDay).toBe('2026-03-10');
    expect(cs!.mastery).toBeGreaterThan(0);
  });

  it('a second success on the same study day does not add a session; the next day does', async () => {
    await activateConcept(ctx, TINY.concept1, 3);
    const session = await createSession(ctx.db, { courseId: ctx.course.id, type: 'review' }, ctx.now());
    const review = async () => {
      const q = await loadQueue(ctx);
      const card = q.order[0] ?? (await getCards(ctx.db, ctx.course.id)).find((c) => c.conceptId === TINY.concept1)!;
      await applyReview(ctx, { card, rating: 3, source: 'review', assisted: false, receipt: { sessionId: session.id, answer: 'x' } });
    };
    ctx.clock.now += 15 * 60_000;
    await review();
    ctx.clock.now += 15 * 60_000;
    await review();
    expect((await getConceptState(ctx.db, ctx.course.id, TINY.concept1))?.successfulSessions).toBe(1);
    ctx.clock.now += DAY_MS;
    await review();
    expect((await getConceptState(ctx.db, ctx.course.id, TINY.concept1))?.successfulSessions).toBe(2);
  });

  it('an unaided pass on an encompassing concept grants implicit credit to Review-state cards', async () => {
    // Bring concept 1 cards to Review state with two Goods, then age them so R < 0.97.
    await activateConcept(ctx, TINY.concept1, 3);
    for (let i = 0; i < 2; i++) {
      ctx.clock.now += 15 * 60_000;
      for (const card of (await getCards(ctx.db, ctx.course.id)).filter((c) => c.conceptId === TINY.concept1)) {
        await applyReview(ctx, { card, rating: 3, source: 'review', assisted: false });
      }
    }
    const before = (await getCards(ctx.db, ctx.course.id)).filter((c) => c.conceptId === TINY.concept1);
    expect(before.every((c) => c.state === 2)).toBe(true);
    ctx.clock.now += 5 * DAY_MS;

    const granted = await grantImplicitCredit(ctx, TINY.concept2);
    expect(granted.length).toBeGreaterThan(0);
    const after = (await getCards(ctx.db, ctx.course.id)).filter((c) => c.conceptId === TINY.concept1);
    for (const a of after) {
      const b = before.find((x) => x.id === a.id)!;
      expect(a.stability).toBeGreaterThan(b.stability);
      expect(a.due).toBeGreaterThanOrEqual(b.due);
      expect(a.reps).toBe(b.reps); // synthetic: no real review counted
    }
    const implicitLogs = (await getReviewLog(ctx.db, ctx.course.id)).filter((l) => l.source === 'implicit');
    expect(implicitLogs).toHaveLength(granted.length);

    // A failure grants nothing.
    const again = await applyReview(ctx, { card: (await getCards(ctx.db, ctx.course.id)).find((c) => c.conceptId === TINY.concept1)!, rating: 1, source: 'review', assisted: false });
    expect(again.implicit).toHaveLength(0);
  });
});
