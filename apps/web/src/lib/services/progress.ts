/**
 * Progress read-model (DESIGN §10.8, §11): assisted vs unassisted pass rates, calibration, high-confidence
 * errors, review-debt history, load forecast and cost.
 */
import {
  assistedPassRate,
  brierScore,
  calibrationBins,
  simulateLoad,
  studyDay,
  unassistedPassRate,
  type CalibrationBin,
  type CalibrationPair,
  type CalibrationSummary,
  type Confidence,
  type ConceptState,
  type Receipt,
  type SimulatedDay,
} from '@epistemics/core';
import { getCards, getReceipts, getReviewLog, isActivated, listConceptStates, listLlmCalls, usageByRole, type RoleUsage } from '@epistemics/db';
import { getOverrideLog } from '../settings.js';
import { dayCfg, type CourseContext } from './context.js';
import { findConcept, findItem } from './courses.js';

export interface ProgressModel {
  concepts: (ConceptState & { name: string; unassistedRate: number; assistedRate: number })[];
  unassistedRate: number;
  assistedRate: number;
  /** Per-week (ISO week key) unassisted and assisted rates for the trend. */
  trend: { week: string; unassisted: number; assisted: number; n: number }[];
  calibration: CalibrationSummary;
  bins: CalibrationBin[];
  highConfidenceErrors: (Receipt & { conceptName: string; prompt: string })[];
  debtHistory: { day: string; reviews: number; lapses: number }[];
  forecast: SimulatedDay[];
  cost: { month: number; total: number; byRole: RoleUsage[]; calls: number };
  overrides: string[];
  mastered: number;
  started: number;
  total: number;
}

function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function loadProgress(ctx: CourseContext): Promise<ProgressModel> {
  const now = ctx.now();
  const states = await listConceptStates(ctx.db, ctx.course.id);
  const receipts = await getReceipts(ctx.db, ctx.course.id);
  const log = await getReviewLog(ctx.db, ctx.course.id);
  const cards = (await getCards(ctx.db, ctx.course.id)).filter((c) => isActivated(c, now));

  const concepts = states.map((s) => ({
    ...s,
    name: findConcept(ctx.curriculum, s.conceptId)?.concept.name ?? s.conceptId,
    unassistedRate: unassistedPassRate(s),
    assistedRate: assistedPassRate(s),
  }));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const uN = sum(states.map((s) => s.unassistedN));
  const aN = sum(states.map((s) => s.assistedN));
  const unassistedRate = uN ? sum(states.map((s) => s.unassistedPass)) / uN : 0;
  const assistedRate = aN ? sum(states.map((s) => s.assistedPass)) / aN : 0;

  const weeks = new Map<string, { u: number; uN: number; a: number; aN: number }>();
  for (const r of receipts) {
    const k = weekKey(r.createdAt);
    const w = weeks.get(k) ?? { u: 0, uN: 0, a: 0, aN: 0 };
    if (r.assisted) {
      w.aN += 1;
      if (r.rating >= 3) w.a += 1;
    } else {
      w.uN += 1;
      if (r.rating >= 3) w.u += 1;
    }
    weeks.set(k, w);
  }
  const trend = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, w]) => ({ week, unassisted: w.uN ? w.u / w.uN : 0, assisted: w.aN ? w.a / w.aN : 0, n: w.uN + w.aN }));

  const pairs: CalibrationPair[] = receipts
    .filter((r) => r.confidence !== undefined && !r.assisted)
    .slice(-200)
    .map((r) => ({ confidence: r.confidence as Confidence, correct: r.rating >= 3 }));
  const calibration = brierScore(pairs);
  const bins = calibrationBins(pairs);

  const highConfidenceErrors = receipts
    .filter((r) => r.confidence === 3 && r.rating < 3 && !r.assisted)
    .slice(-20)
    .reverse()
    .map((r) => ({
      ...r,
      conceptName: findConcept(ctx.curriculum, r.conceptId)?.concept.name ?? r.conceptId,
      prompt: findItem(ctx.curriculum, r.itemId)?.item.prompt ?? (r.itemId.endsWith('#check') || r.itemId.endsWith('#pretest') ? findConcept(ctx.curriculum, r.conceptId)?.concept.script.pretest.prompt ?? '' : ''),
    }));

  const days = new Map<string, { reviews: number; lapses: number }>();
  for (const l of log) {
    if (l.source === 'implicit') continue;
    const k = studyDay(l.reviewTime, dayCfg(ctx));
    const d = days.get(k) ?? { reviews: 0, lapses: 0 };
    d.reviews += 1;
    if (l.rating === 1 && l.stateBefore === 2) d.lapses += 1;
    days.set(k, d);
  }
  const debtHistory = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([day, d]) => ({ day, ...d }));

  const forecast = cards.length > 0 ? simulateLoad(cards, 14, ctx.course.settings, ctx.scheduler, { startAt: now, seed: 7 }) : [];

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const byRole = await usageByRole(ctx.db, monthStart.getTime());
  const allCalls = await listLlmCalls(ctx.db);
  const mine = allCalls.filter((c) => c.courseId === ctx.course.id);
  const cost = {
    month: mine.filter((c) => c.createdAt >= monthStart.getTime()).reduce((a, c) => a + c.costUsd, 0),
    total: mine.reduce((a, c) => a + c.costUsd, 0),
    byRole,
    calls: mine.length,
  };

  const total = ctx.curriculum.units.reduce((a, u) => a + u.lessons.reduce((b, l) => b + l.concepts.length, 0), 0);
  const mastered = concepts.filter((c) => c.mastery >= 0.85 && c.unassistedRate >= 0.8).length;
  const started = concepts.filter((c) => c.unassistedN + c.assistedN > 0).length;

  return {
    concepts,
    unassistedRate,
    assistedRate,
    trend,
    calibration,
    bins,
    highConfidenceErrors,
    debtHistory,
    forecast,
    cost,
    overrides: await getOverrideLog(ctx.db, ctx.course.id),
    mastered,
    started,
    total,
  };
}
