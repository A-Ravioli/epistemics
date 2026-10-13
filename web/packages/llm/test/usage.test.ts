import { describe, expect, it } from 'vitest';
import { budgetGuard, combineSinks, costUsd, createUsageLedger, startOfStudyDay, type UsageSink } from '../src/index.js';

function call(costUsd: number, over: Partial<Parameters<UsageSink>[0]> = {}): Parameters<UsageSink>[0] {
  return { role: 'tutor', model: 'claude-opus-5', inputTokens: 100, cacheRead: 0, cacheWrite: 0, outputTokens: 50, costUsd, latencyMs: 10, ...over };
}

describe('costUsd', () => {
  it('prices opus 5 per million tokens', () => {
    expect(costUsd('claude-opus-5', { inputTokens: 1_000_000, outputTokens: 0, cacheRead: 0, cacheWrite: 0 })).toBe(5);
    expect(costUsd('claude-opus-5', { inputTokens: 0, outputTokens: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBe(25);
    expect(costUsd('claude-opus-5', { inputTokens: 0, outputTokens: 0, cacheRead: 1_000_000, cacheWrite: 0 })).toBe(0.5);
    expect(costUsd('unknown-model', { inputTokens: 1e6, outputTokens: 1e6, cacheRead: 0, cacheWrite: 0 })).toBe(0);
  });
});

describe('usage ledger', () => {
  it('accumulates per role and model and computes today\'s cost from the study-day boundary', () => {
    let now = new Date(2026, 8, 16, 10, 0, 0).getTime(); // 10:00 local
    const ledger = createUsageLedger({ now: () => now, dayStartHour: 4 });
    ledger.record(call(0.1));
    ledger.record(call(0.2, { role: 'grader', model: 'claude-sonnet-5', courseId: 'A' }));
    expect(ledger.totals().calls).toBe(2);
    expect(ledger.totals().costUsd).toBeCloseTo(0.3, 9);
    expect(ledger.byRole().tutor?.costUsd).toBeCloseTo(0.1, 9);
    expect(ledger.byModel()['claude-sonnet-5']?.calls).toBe(1);
    expect(ledger.todaysCost()).toBeCloseTo(0.3, 9);
    expect(ledger.todaysCost({ courseId: 'A' })).toBeCloseTo(0.2, 9);

    now = new Date(2026, 8, 17, 3, 0, 0).getTime(); // 03:00 next day: still the same study day
    expect(ledger.todaysCost()).toBeCloseTo(0.3, 9);
    now = new Date(2026, 8, 17, 4, 30, 0).getTime(); // after the boundary
    expect(ledger.todaysCost()).toBe(0);
  });

  it('startOfStudyDay rolls back before the day-start hour', () => {
    const t = new Date(2026, 8, 17, 2, 0, 0).getTime();
    expect(new Date(startOfStudyDay(t, 4)).getDate()).toBe(16);
    const later = new Date(2026, 8, 17, 12, 0, 0).getTime();
    expect(new Date(startOfStudyDay(later, 4)).getDate()).toBe(17);
  });

  it('load() restores persisted calls and combineSinks fans out', () => {
    const now = Date.now();
    const ledger = createUsageLedger({ now: () => now });
    ledger.load([{ ...call(1), at: now - 1000 }]);
    const seen: unknown[] = [];
    const sink = combineSinks(ledger.record, (c) => seen.push(c), undefined);
    sink(call(0.5));
    expect(seen).toHaveLength(1);
    expect(ledger.totals().costUsd).toBeCloseTo(1.5, 9);
  });
});

describe('budgetGuard', () => {
  function ledgerWith(spent: number) {
    const ledger = createUsageLedger();
    if (spent > 0) ledger.record(call(spent));
    return ledger;
  }

  it('allows below 80%', () => {
    expect(budgetGuard(ledgerWith(0.79), 1)).toMatchObject({ allowed: true, fraction: 0.79 });
    expect(budgetGuard(ledgerWith(0.79), 1).degradeToModel).toBeUndefined();
  });
  it('degrades the tutor to Sonnet at 80%', () => {
    const v = budgetGuard(ledgerWith(0.8), 1);
    expect(v.allowed).toBe(true);
    expect(v.degradeToModel).toBe('claude-sonnet-5');
  });
  it('does not degrade other roles or an already degraded tutor', () => {
    expect(budgetGuard(ledgerWith(0.9), 1, { role: 'grader' }).degradeToModel).toBeUndefined();
    expect(budgetGuard(ledgerWith(0.9), 1, { currentModel: 'claude-sonnet-5' }).degradeToModel).toBeUndefined();
  });
  it('blocks at 100%', () => {
    expect(budgetGuard(ledgerWith(1), 1).allowed).toBe(false);
    expect(budgetGuard(ledgerWith(1.5), 1, { role: 'observer' }).allowed).toBe(false);
  });
  it('treats a non-positive budget as unlimited', () => {
    expect(budgetGuard(ledgerWith(100), 0).allowed).toBe(true);
    expect(budgetGuard(ledgerWith(100), Number.POSITIVE_INFINITY).allowed).toBe(true);
  });
});
