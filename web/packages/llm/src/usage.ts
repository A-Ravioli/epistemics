/**
 * Usage accounting: a sink-compatible ledger (per role / model totals, today's cost) and the per-day budget guard
 * (DESIGN §7.3: degrade the tutor to Sonnet at 80% of budget, stop at 100%).
 */
import type { LlmRole } from '@epistemics/core';
import type { Usage, UsageSink } from './provider.js';

export type UsageCall = Parameters<UsageSink>[0] & { at: number };

export interface UsageTotals {
  calls: number; inputTokens: number; cacheRead: number; cacheWrite: number; outputTokens: number; costUsd: number; latencyMs: number;
}

export interface UsageFilter { role?: LlmRole; model?: string; courseId?: string; sessionId?: string; sinceMs?: number }

export interface UsageLedger {
  /** Pass as `onUsage` to a provider. */
  record: UsageSink;
  readonly calls: readonly UsageCall[];
  totals(filter?: UsageFilter): UsageTotals;
  byRole(filter?: UsageFilter): Partial<Record<LlmRole, UsageTotals>>;
  byModel(filter?: UsageFilter): Record<string, UsageTotals>;
  /** USD spent since the current course-local day started (day boundary at `dayStartHour`, default 4am local). */
  todaysCost(filter?: Omit<UsageFilter, 'sinceMs'>): number;
  startOfToday(): number;
  /** Load previously persisted calls (e.g. from the llm_calls table) so today's cost survives a reload. */
  load(calls: UsageCall[]): void;
  clear(): void;
}

export interface UsageLedgerOptions {
  now?: () => number;
  /** Hour at which a study day starts (matches CourseSettings.dayStartHour). Default 4. */
  dayStartHour?: number;
  /** Drop calls older than this many days to bound memory. Default 7. */
  retainDays?: number;
}

const EMPTY: UsageTotals = { calls: 0, inputTokens: 0, cacheRead: 0, cacheWrite: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 };

function add(t: UsageTotals, u: Usage): UsageTotals {
  return {
    calls: t.calls + 1,
    inputTokens: t.inputTokens + u.inputTokens,
    cacheRead: t.cacheRead + u.cacheRead,
    cacheWrite: t.cacheWrite + u.cacheWrite,
    outputTokens: t.outputTokens + u.outputTokens,
    costUsd: t.costUsd + u.costUsd,
    latencyMs: t.latencyMs + u.latencyMs,
  };
}

export function startOfStudyDay(nowMs: number, dayStartHour = 4): number {
  const d = new Date(nowMs);
  d.setHours(dayStartHour, 0, 0, 0);
  if (d.getTime() > nowMs) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function createUsageLedger(opts: UsageLedgerOptions = {}): UsageLedger {
  const now = opts.now ?? (() => Date.now());
  const dayStartHour = opts.dayStartHour ?? 4;
  const retainMs = (opts.retainDays ?? 7) * 86_400_000;
  const calls: UsageCall[] = [];

  const matches = (c: UsageCall, f: UsageFilter | undefined): boolean => {
    if (!f) return true;
    if (f.role && c.role !== f.role) return false;
    if (f.model && c.model !== f.model) return false;
    if (f.courseId && c.courseId !== f.courseId) return false;
    if (f.sessionId && c.sessionId !== f.sessionId) return false;
    if (f.sinceMs !== undefined && c.at < f.sinceMs) return false;
    return true;
  };

  const prune = () => {
    const cutoff = now() - retainMs;
    while (calls.length > 0 && calls[0]!.at < cutoff) calls.shift();
  };

  const ledger: UsageLedger = {
    calls,
    record(call) {
      calls.push({ ...call, at: now() });
      prune();
    },
    totals(filter) {
      return calls.filter((c) => matches(c, filter)).reduce(add, EMPTY);
    },
    byRole(filter) {
      const out: Partial<Record<LlmRole, UsageTotals>> = {};
      for (const c of calls) if (matches(c, filter)) out[c.role] = add(out[c.role] ?? EMPTY, c);
      return out;
    },
    byModel(filter) {
      const out: Record<string, UsageTotals> = {};
      for (const c of calls) if (matches(c, filter)) out[c.model] = add(out[c.model] ?? EMPTY, c);
      return out;
    },
    startOfToday() {
      return startOfStudyDay(now(), dayStartHour);
    },
    todaysCost(filter) {
      return ledger.totals({ ...(filter ?? {}), sinceMs: ledger.startOfToday() }).costUsd;
    },
    load(loaded) {
      calls.push(...loaded);
      calls.sort((a, b) => a.at - b.at);
      prune();
    },
    clear() {
      calls.length = 0;
    },
  };
  return ledger;
}

export interface BudgetVerdict {
  allowed: boolean;
  /** Set when the caller should switch this role to a cheaper model before stopping. */
  degradeToModel?: string;
  spentUsd: number;
  budgetUsd: number;
  /** spent / budget, 0..∞ */
  fraction: number;
}

export interface BudgetGuardOptions {
  /** Role about to be called. Only the tutor degrades; every role is blocked at 100%. Default 'tutor'. */
  role?: LlmRole;
  courseId?: string;
  /** Fraction at which the tutor degrades. Default 0.8. */
  degradeAt?: number;
  degradeModel?: string;
  /** The model currently configured for the role; when it already equals degradeModel no degrade is suggested. */
  currentModel?: string;
}

export const DEGRADE_MODEL = 'claude-sonnet-5';

/** Per-day cost guard. `dailyUsd <= 0` or non-finite means unlimited. */
export function budgetGuard(ledger: UsageLedger, dailyUsd: number, opts: BudgetGuardOptions = {}): BudgetVerdict {
  const role = opts.role ?? 'tutor';
  const spentUsd = ledger.todaysCost(opts.courseId ? { courseId: opts.courseId } : undefined);
  if (!Number.isFinite(dailyUsd) || dailyUsd <= 0) return { allowed: true, spentUsd, budgetUsd: dailyUsd, fraction: 0 };
  const fraction = spentUsd / dailyUsd;
  if (fraction >= 1) return { allowed: false, spentUsd, budgetUsd: dailyUsd, fraction };
  const degradeModel = opts.degradeModel ?? DEGRADE_MODEL;
  if (role === 'tutor' && fraction >= (opts.degradeAt ?? 0.8) && opts.currentModel !== degradeModel) {
    return { allowed: true, degradeToModel: degradeModel, spentUsd, budgetUsd: dailyUsd, fraction };
  }
  return { allowed: true, spentUsd, budgetUsd: dailyUsd, fraction };
}

/** Fan a usage call out to several sinks (ledger + database logger + UI). */
export function combineSinks(...sinks: (UsageSink | undefined)[]): UsageSink {
  const live = sinks.filter((s): s is UsageSink => typeof s === 'function');
  return (call) => {
    for (const s of live) s(call);
  };
}
