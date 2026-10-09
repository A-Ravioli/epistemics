#!/usr/bin/env node
// Exports conformance fixtures from the REAL TypeScript core (web/packages/core + ts-fsrs 5.4.2) for the
// Swift port's parity tests in ipad/EpistemicsKit/Tests/EpistemicsCoreTests/Fixtures/conformance/.
//
// Run from the repo root (Node ≥ 23.6 runs the .ts sources directly by stripping types; nothing to install):
//
//     node ipad/Tools/export-conformance.mjs
//
// The core imports its siblings as './x.js' while the files are './x.ts', so a resolve hook retries '.ts'.
// The web app's onboarding.ts is loaded with its persistence imports stubbed (only the pure matcher is used).
// Everything is seeded; re-running produces byte-identical files.

import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const out = join(repo, 'ipad/EpistemicsKit/Tests/EpistemicsCoreTests/Fixtures/conformance');
const packPath = join(repo, 'ipad/EpistemicsKit/Tests/EpistemicsCoreTests/Fixtures/probability-basics.epistemics.json');

const STUBS = {
  '@epistemics/db': 'export const getSetting = async () => undefined; export const setSetting = async () => {};',
  './settings.js': "export const KEYS = { onboarding: 'onboarding' };",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/lib/onboarding.ts') && STUBS[specifier] !== undefined) {
      return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      throw e;
    }
  },
});

const imp = (p) => import(pathToFileURL(join(repo, p)).href);
const core = await imp('web/packages/core/src/index.ts');
const onboarding = await imp('web/apps/web/src/lib/onboarding.ts');
const { tinyPack } = await imp('web/apps/web/test-fixtures/tiny-pack.ts');
const sessionFixture = await imp('web/packages/core/test/session/fixture.ts');
// ts-fsrs does not export its Alea PRNG; lift it verbatim out of the installed bundle.
const alea = (() => {
  const src = readFileSync(join(repo, 'web/packages/core/node_modules/ts-fsrs/dist/index.mjs'), 'utf8');
  const start = src.indexOf('class Alea {');
  const end = src.indexOf('\n}\n', src.indexOf('function alea(seed)')) + 3;
  if (start < 0 || end < start) throw new Error('Alea not found in the ts-fsrs bundle');
  return new Function(`${src.slice(start, end)}; return alea;`)();
})();

const pack = JSON.parse(readFileSync(packPath, 'utf8'));
mkdirSync(out, { recursive: true });
const write = (name, data) => {
  const text = JSON.stringify(data);
  writeFileSync(join(out, name), text);
  console.log(`${name}: ${(text.length / 1024).toFixed(0)} KB`);
};

const { mulberry32, createScheduler, buildQueue, seededRng } = { ...core, seededRng: sessionFixture.seededRng };
const DAY = 86_400_000;
const bitsOf = (x) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
};
/** sha256 of the canonical JSON of `v` with null-valued keys dropped (the TS writes `lastControl: null`, Swift omits nil). */
const stripNulls = (v) => Array.isArray(v) ? v.map(stripNulls) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [k, stripNulls(x)])) : v;
const digest = (v) => createHash('sha256').update(core.canonicalJson(stripNulls(JSON.parse(JSON.stringify(v))))).digest('hex');
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
const allConcepts = (cur) => cur.units.flatMap((u) => u.lessons.flatMap((l) => l.concepts));

// ---------------------------------------------------------------------------
// JS number semantics
// ---------------------------------------------------------------------------
{
  const rng = mulberry32(99);
  const values = [0, -0, 1, -1, 0.1, 0.2, 0.1 + 0.2, 1.5, 100, 1e20, 1e21, 1.5e21, 1e-6, 1e-7, 1.23e-7, 123456789012345680000,
    5e-324, 1.7976931348623157e308, 2 ** 53, 2 ** 53 + 2, 4.35, 0.000001, 0.0000012345, 9.999999999999999e20, 33.299999999999997];
  for (let i = 0; i < 3000; i++) {
    const e = Math.floor(rng() * 60) - 30;
    values.push((rng() < 0.5 ? 1 : -1) * rng() * 10 ** e);
    values.push(Math.round(rng() * 1e6) / 1e3);
  }
  for (let i = 0; i < 2000; i++) values.push(Math.round(rng() * 1e10) / 1e8 * (Math.round(rng() * 1e10) / 1e8)); // D×S-like
  const numberStrings = values.map((v) => [bitsOf(v), String(v)]);

  const fixed = [0.125, 0.375, 2.5, 1.005, 0.045, 1.255, 0.5, 1 / 512, 3 / 512, 1e-9, 5e-9, 4.999999999e-9, 0.123456785, 12.3456789050,
    -0.001, -1.5, 36500.123456785, 21, 1e21, 0.995, 0.994999, 99.995];
  for (let k = 1; k < 400; k += 2) fixed.push(k / 512, k / 1024 + 3, k / 2 ** 9 * 7);
  for (let i = 0; i < 2000; i++) fixed.push(rng() * 10 ** (Math.floor(rng() * 8) - 3), Math.round(rng() * 1e9) / 1e8);
  const toFixed = fixed.flatMap((v) => [[bitsOf(v), 2, v.toFixed(2)], [bitsOf(v), 8, v.toFixed(8)]]);

  const seeds = ['', ' ', 'abc', '1773144000000_1_0', '1773144000000_3_17.21004', 'é😀ü', 'x'.repeat(300)];
  for (let i = 0; i < 300; i++) seeds.push(`${1_700_000_000_000 + Math.floor(rng() * 1e11)}_${1 + Math.floor(rng() * 30)}_${rng() * 300}`);
  const aleaOut = seeds.map((s) => { const g = alea(s); return [s, [g(), g(), g(), g(), g()].map(bitsOf)]; });

  const words = ['card-1', 'card-10', 'card-2', 'Card-2', 'a_b', 'aB', 'a-b', 'ab', 'r0', 'r10', 'sim-card-12', 'sim-card-3', 'A', 'a', '',
    'b1', 'B1', '01934c5e-0d3f-7a2b-8c1d-aaaaaaaaaaaa', '01934c5e-0d3f-7a2b-8c1d-aaaaaaaaaaab', '01934c5e-0d3f-7a2c-0000-000000000000', 'c4#check', 'c4-i2'];
  for (const ch of ' _-,;:!?.\'"()[]{}@*/\\&#%`^+<=>|~$09aAzZ') words.push(`x${ch}y`);
  const localeCompare = [];
  for (const a of words) for (const b of words) localeCompare.push([a, b, Math.sign(a.localeCompare(b))]);

  // Comparator call order of V8's Array.prototype.sort.
  const sortLogs = [];
  for (let t = 0; t < 150; t++) {
    const n = Math.floor(rng() ** 2 * 400);
    const k = 1 + Math.floor(rng() * (rng() < 0.5 ? 5 : n + 1));
    const vals = Array.from({ length: n }, (_, i) => (t % 3 === 0 ? Math.floor(rng() * k) : t % 3 === 1 ? i % 37 + Math.floor(rng() * 3) : n - i + Math.floor(rng() * k)));
    const log = [];
    const sorted = vals.map((v, i) => ({ v, i })).sort((x, y) => { log.push(x.i, y.i); return x.v - y.v; }).map((x) => x.i);
    sortLogs.push({ values: vals, log, sorted });
  }

  const mulberry = [1, 7, 42, 123456789, -5].map((s) => { const g = mulberry32(s); return [s, Array.from({ length: 20 }, () => bitsOf(g()))]; });
  const lcg = [1, 42, 0x9e3779b9].map((s) => { const g = seededRng(s); return [s, Array.from({ length: 20 }, () => bitsOf(g()))]; });

  const json = [
    { b: 1, a: [1, 2.5, 1e21, -0, null, true], '10': 'x', '2': 'y', c: { z: '"q"\\\n\t\u0001é😀', y: 0.1 + 0.2 } },
    pack.manifest, pack.units[0].lessons[0].concepts[0].items[0],
  ];
  const canonical = json.map((v) => { const c = core.canonicalJson(v); return [v, c]; });
  const sha = await Promise.all(['', 'abc', 'é😀', core.canonicalJson(pack.edges)].map(async (t) => [t, await core.sha256(t)]));
  const stable = await Promise.all([['item', 'c1'], ['concept', 'é'], ['', '']].map(async ([n, k]) => [n, k, await core.stableId(n, k)]));

  write('js.json', { numberStrings, toFixed, alea: aleaOut, localeCompare, sortLogs, mulberry, lcg, canonical, sha256: sha, stableId: stable });
}

// ---------------------------------------------------------------------------
// FSRS: review sequences, previews, retrievability, parameters
// ---------------------------------------------------------------------------
const compactCard = (c) => [c.state, c.due, c.lastReview ?? null, c.stability, c.difficulty, c.scheduledDays, c.learningSteps, c.reps, c.lapses, c.provisional ? 1 : 0];
const compactLog = (l) => [l.rating, l.stateBefore, l.elapsedDays, l.scheduledDays, l.stability, l.difficulty, l.reviewTime];
{
  const D = core.DEFAULT_FSRS_W;
  const w19 = D.slice(0, 19).map((x, i) => x * (1 + ((i % 3) - 1) * 0.07));
  const w17 = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const w21 = D.map((x, i) => (i === 20 ? 0.3 : x * (1 + ((i * 7) % 5 - 2) * 0.05)));
  const configs = [
    { desiredRetention: 0.9, enableFuzz: true },
    { desiredRetention: 0.9, enableFuzz: false },
    { desiredRetention: 0.85, enableFuzz: true },
    { desiredRetention: 0.95, enableFuzz: true, maximumIntervalDays: 30 },
    { desiredRetention: 0.9, enableFuzz: false, maximumIntervalDays: 7 },
    { desiredRetention: 0.9, enableFuzz: true, w: w19 },
    { desiredRetention: 0.88, enableFuzz: true, w: w17 },
    { desiredRetention: 0.92, enableFuzz: true, w: w21 },
  ];
  const schedulers = configs.map(createScheduler);
  const params = configs.map((c, i) => ({ config: c, w: [...schedulers[i].params.w].map(bitsOf), engineW: [...schedulers[i].engine.parameters.w].map(bitsOf), intervalModifier: bitsOf(schedulers[i].engine.interval_modifier), maximumInterval: schedulers[i].params.maximum_interval }));
  const odd = [[1, 2, 3], D.map((x) => x * 50), D.map((x) => -x), [...D.slice(0, 20), 0.9]].map((w) => {
    const s = createScheduler({ desiredRetention: 0.9, w });
    return { w, effective: [...s.engine.parameters.w].map(bitsOf), intervalModifier: bitsOf(s.engine.interval_modifier) };
  });

  const sequences = [];
  const sources = ['review', 'lesson', 'checkpoint', 'warmup', 'diagnostic'];
  for (let i = 0; i < 240; i++) {
    const ci = i % configs.length;
    const s = schedulers[ci];
    const rng = mulberry32(1000 + i);
    let now = Date.UTC(2024, 0, 1) + Math.floor(rng() * 3 * 365 * DAY);
    let card = s.newCard('course', `item-${i}`, `concept-${i % 17}`, now, `card-${i}`);
    if (rng() < 0.12) card = s.seedKnownCard(card, now, rng() < 0.5 ? 21 : 0.5 + rng() * 60);
    const initial = compactCard(card);
    const steps = [];
    const n = 1 + Math.floor(rng() * 12);
    for (let k = 0; k < n; k++) {
      const mode = rng();
      if (mode < 0.12) now += 0;
      else if (mode < 0.3) now += Math.floor(rng() * 30 * 60_000);
      else if (mode < 0.45) now += Math.floor(rng() * 23 * 3_600_000);
      else if (mode < 0.8) now = Math.max(now, card.due + Math.floor((rng() - 0.4) * 3 * DAY));
      else now += Math.floor(rng() * 400 * DAY);
      const r = rng();
      const rating = r < 0.2 ? 1 : r < 0.35 ? 2 : r < 0.85 ? 3 : 4;
      const ctx = { source: pick(rng, sources), assisted: rng() < 0.3 };
      if (rng() < 0.5) ctx.confidence = 1 + Math.floor(rng() * 3);
      if (rng() < 0.5) ctx.durationMs = Math.floor(rng() * 90_000);
      const preview = s.previewRatings(card, now, ctx);
      const res = s.applyRating(card, rating, now, ctx);
      if (JSON.stringify(res.card) !== JSON.stringify(preview[rating].card)) throw new Error('apply != preview');
      steps.push({
        now, rating, ctx,
        preview: [1, 2, 3, 4].map((g) => [compactCard(preview[g].card), compactLog(preview[g].log)]),
        after: compactCard(res.card),
        log: compactLog(res.log),
        r: [0, 3 * DAY, 30 * DAY + 1234].map((dt) => bitsOf(s.retrievability(res.card, now + dt))),
      });
      card = res.card;
    }
    sequences.push({ config: ci, initial, initialBits: [bitsOf(initial[3]), bitsOf(initial[4])], id: card.id, itemId: card.itemId, conceptId: card.conceptId, steps });
  }

  const intervals = configs.map((_, ci) => [0.001, 0.4, 1, 2.3, 7.77, 21, 100, 365.25, 9999].map((st) => schedulers[ci].intervalForStability(st)));

  // Implicit credit over random Review cards (FIRe-lite, DESIGN §5.6).
  const implicit = [];
  {
    const rng = mulberry32(5);
    const s = schedulers[1];
    const now = Date.UTC(2026, 2, 10, 12);
    for (let t = 0; t < 60; t++) {
      const edges = [{ from: 'B', to: 'A', kind: 'encompasses', weight: rng() * 0.8 - 0.1 }, { from: 'B', to: 'Z', kind: 'encompasses', weight: rng() }];
      const cards = Array.from({ length: 4 }, (_, j) => {
        const daysAgo = rng() * 200;
        const stability = 0.3 + rng() * 80;
        const lastReview = now - Math.floor(daysAgo * DAY);
        return { id: `x${t}-${j}`, courseId: 'c', itemId: `i${j}`, conceptId: j % 2 ? 'A' : 'Z', state: rng() < 0.85 ? 2 : 1, due: lastReview + Math.floor(stability * DAY), lastReview, stability, difficulty: 1 + rng() * 9, scheduledDays: Math.round(stability), learningSteps: 0, reps: 3, lapses: 0, suspended: rng() < 0.1, provisional: false };
      });
      const res = core.implicitCredit({ passedConceptId: 'B', edges, cardsByConcept: new Map([['A', cards.filter((c) => c.conceptId === 'A')], ['Z', cards.filter((c) => c.conceptId === 'Z')]]), now, scheduler: s });
      implicit.push({ edges, cards, results: res.map((r) => ({ card: r.card, log: r.log })) });
    }
  }
  write('fsrs.json', { configs, params, odd, sequences, intervals, implicit });
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------
{
  const zones = ['UTC', 'America/New_York', 'Europe/London', 'Australia/Sydney', 'Asia/Kolkata', 'Pacific/Chatham', 'America/St_Johns',
    'Asia/Tokyo', 'Pacific/Apia', 'America/Sao_Paulo', 'Europe/Berlin', 'Pacific/Kiritimati', 'America/Los_Angeles'];
  const rng = mulberry32(11);
  const cases = [];
  const windows = [[2026, 2, 6], [2026, 2, 27], [2026, 3, 3], [2026, 8, 25], [2026, 9, 2], [2026, 9, 23], [2026, 9, 30], [2011, 11, 28]];
  for (const tz of zones) {
    for (let i = 0; i < 150; i++) cases.push([Date.UTC(2000, 0, 1) + Math.floor(rng() * 35 * 365 * DAY), tz, Math.floor(rng() * 7)]);
    for (const [y, m, d] of windows) for (let t = Date.UTC(y, m, d); t < Date.UTC(y, m, d + 4); t += 37 * 60_000 + 1001) cases.push([t, tz, (t / 60_000) % 2 ? 4 : 0]);
  }
  const time = cases.map(([at, tz, h]) => [at, tz, h, core.studyDay(at, { timezone: tz, dayStartHour: h }), core.studyDayStart(at, { timezone: tz, dayStartHour: h }), core.tzOffsetMinutes(at, tz)]);
  write('time.json', { cases: time });
}

// ---------------------------------------------------------------------------
// Queue and simulator
// ---------------------------------------------------------------------------
{
  const s = createScheduler({ desiredRetention: 0.9, enableFuzz: false });
  const zones = ['UTC', 'Asia/Tokyo', 'America/New_York', 'Australia/Sydney'];
  const scenarios = [];
  for (let t = 0; t < 160; t++) {
    const rng = mulberry32(500 + t);
    const now = Date.UTC(2026, Math.floor(rng() * 12), 1 + Math.floor(rng() * 28), Math.floor(rng() * 24), Math.floor(rng() * 60));
    const settings = { desiredRetention: 0.9, reviewsPerDay: 1 + Math.floor(rng() * (t % 4 === 0 ? 10 : 80)), maxNewItemsPerDay: Math.floor(rng() * 30), easyDays: [], dayStartHour: Math.floor(rng() * 6), timezone: pick(rng, zones) };
    const n = Math.floor(rng() ** 1.5 * (t % 5 === 0 ? 260 : 60));
    const dueSlots = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => now + Math.floor((rng() - 0.7) * 8 * DAY));
    const cards = [];
    for (let i = 0; i < n; i++) {
      const st = pick(rng, [0, 0, 1, 2, 2, 2, 3]);
      const due = rng() < 0.6 ? pick(rng, dueSlots) : now + Math.floor((rng() - 0.6) * 10 * DAY);
      const stability = 0.2 + rng() * 40;
      cards.push({
        id: rng() < 0.5 ? `card-${t}-${i}` : `0193${Math.floor(rng() * 1e8).toString(16).padStart(8, '0')}-${i}`,
        courseId: 'c', itemId: `item-${i}`, conceptId: `k${Math.floor(rng() * (n / 2 + 2))}`, state: st, due,
        lastReview: st === 0 ? undefined : due - Math.floor(stability * DAY), stability: st === 0 ? 0 : stability, difficulty: st === 0 ? 0 : 1 + rng() * 9,
        scheduledDays: st === 1 || st === 3 ? (rng() < 0.7 ? 0 : 1) : st === 0 ? 0 : Math.max(1, Math.round(stability)),
        learningSteps: 0, reps: st === 0 ? 0 : 2, lapses: 0, suspended: rng() < 0.05, provisional: false,
      });
      if (cards[i].lastReview === undefined) delete cards[i].lastReview;
    }
    const itemsByCard = {};
    for (const c of cards) if (rng() < 0.8) itemsByCard[c.id] = { conceptId: rng() < 0.9 ? c.conceptId : `alt${Math.floor(rng() * 5)}`, type: pick(rng, ['recall', 'explain', 'apply']) };
    const opts = {};
    const rngSeed = rng() < 0.7 ? Math.floor(rng() * 1000) : null;
    if (rng() < 0.3) opts.recentlyShownConceptIds = ['k0', 'k3', 'alt1'];
    if (rng() < 0.3) opts.reviewsDoneToday = Math.floor(rng() * 20);
    if (rng() < 0.3) opts.newDoneToday = Math.floor(rng() * 10);
    if (rng() < 0.3) opts.learnAheadMs = Math.floor(rng() * 4 * 3_600_000);
    if (rng() < 0.15) opts.debtCarriedOverDays = Math.floor(rng() * 5);
    const q = buildQueue({
      cards, now, settings, itemsByCard: new Map(Object.entries(itemsByCard)), retrievability: (c) => s.retrievability(c, now),
      ...(rngSeed === null ? {} : { rng: mulberry32(rngSeed) }), ...opts,
      recentlyShownConceptIds: opts.recentlyShownConceptIds ? new Set(opts.recentlyShownConceptIds) : undefined,
    });
    const ids = (xs) => xs.map((c) => c.id);
    scenarios.push({ now, settings, cards, itemsByCard, rngSeed, opts,
      out: { learning: ids(q.learning), reviews: ids(q.reviews), newCards: ids(q.newCards), buried: ids(q.buried), debt: q.debt, dueToday: q.dueToday, gateOpen: q.gateOpen, recoveryMode: q.recoveryMode, overdueDays: q.overdueDays, daysToClear: q.daysToClear } });
  }

  const fz = createScheduler({ desiredRetention: 0.9, enableFuzz: true });
  const base = { desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: 'UTC' };
  const NOW = Date.UTC(2026, 2, 10, 12);
  const backlog = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, courseId: 'c', itemId: `i${i}`, conceptId: `c${i % 25}`, state: 2, due: NOW - (i % 6) * DAY, lastReview: NOW - 10 * DAY, stability: 4 + (i % 7), difficulty: 5, scheduledDays: 8, learningSteps: 0, reps: 3, lapses: 0, suspended: false, provisional: false }));
  const sims = [
    { cards: [], days: 45, settings: base, opts: { newPerDay: 10, seed: 3, startAt: NOW } },
    { cards: backlog, days: 20, settings: { ...base, reviewsPerDay: 12, timezone: 'America/New_York' }, opts: { newPerDay: 4, seed: 9, startAt: NOW + 5 * 3_600_000 } },
    { cards: [], days: 30, settings: { ...base, timezone: 'Australia/Sydney', dayStartHour: 3 }, opts: { newPerDay: 6, seed: 21, pNew: 0.5 } },
  ].map((sim) => ({ ...sim, out: core.simulateLoad(sim.cards, sim.days, sim.settings, fz, sim.opts) }));
  write('queue.json', { scenarios, simulations: sims });
}

// ---------------------------------------------------------------------------
// Lesson reducer: scripted sessions over the bundled pack
// ---------------------------------------------------------------------------
{
  const { createLessonState, reduceLesson, composeRemediation, ratingFromGrade } = core;
  function runLesson(lesson, init, seed, opts = {}) {
    const rng = mulberry32(seed);
    let state = init;
    const steps = [];
    const tags = lesson.concepts.flatMap((c) => c.misconceptions.map((m) => m.tag));
    const queue = [{ type: 'start' }];
    const late = []; // grade events held back and delivered out of order
    const send = (event) => {
      const r = reduceLesson(state, event, lesson);
      state = r.state;
      // Every state is compared by digest; every 12th (and the last) in full, to keep the fixture small.
      const n = steps.length;
      steps.push({ event, stateDigest: digest(state), ...(n % 12 === 0 || state.done ? { state } : {}), effects: r.effects });
      for (const e of r.effects) {
        if (e.type === 'call_tutor') queue.push(rng() < (opts.leak ?? 0.12) ? { type: 'leak_detected' } : { type: 'tutor_turn', content: `T${steps.length}` });
        else if (e.type === 'grade_item') {
          const fail = e.itemKind === 'check' ? rng() < (opts.checkFail ?? 0.5) : rng() < 0.35;
          const score = fail ? Math.floor(rng() * 70) / 100 : 0.7 + Math.floor(rng() * 31) / 100;
          const grade = { criteria: [{ id: 'c1', met: !fail, evidence: 'q' }], score, misconceptionTags: rng() < 0.4 ? [pick(rng, tags), pick(rng, tags)] : [], feedback: `fb ${score}`, confidence: Math.floor(rng() * 100) / 100 };
          const ev = { type: 'grade', itemKind: e.itemKind, itemId: e.itemId, grade, rating: ratingFromGrade(score, grade.confidence) };
          if (e.itemKind === 'pretest' && rng() < 0.5) late.push(ev); else queue.push(ev);
        } else if (e.type === 'call_observer') {
          queue.push({ type: 'observer', result: { attemptMade: rng() < 0.7, gaveUp: false, offTopic: rng() < 0.15, objectiveProgress: [], misconceptionTags: rng() < 0.3 ? [pick(rng, tags)] : [], keyIdeaStated: rng() < 0.3, priorKnowledgeElicited: rng() < 0.4, stuck: false, unsourcedClaims: [] } });
        } else if (e.type === 'request_summary') queue.push({ type: 'summary_submitted', text: '  My   summary\nof the lesson.  ' });
        else if (e.type === 'request_jol') {
          const predictions = {};
          for (const id of e.conceptIds) if (rng() < 0.8) predictions[id] = Math.round((rng() * 1.6 - 0.3) * 100) / 100;
          queue.push({ type: 'jol_submitted', predictions });
        }
      }
    };
    for (let guard = 0; guard < 400 && !state.done; guard++) {
      if (late.length && rng() < 0.3) { send(late.shift()); continue; }
      if (queue.length) { send(queue.shift()); continue; }
      const x = rng();
      if (x < 0.07) send({ type: 'give_up' });
      else if (x < 0.1) send(pick(rng, [{ type: 'start' }, { type: 'observer', result: { attemptMade: true, gaveUp: false, offTopic: false, objectiveProgress: [], misconceptionTags: [], keyIdeaStated: true, priorKnowledgeElicited: true, stuck: false, unsourcedClaims: [] } }, { type: 'grade', itemKind: 'check', itemId: 'nope', grade: { criteria: [], score: 1, misconceptionTags: [], feedback: '', confidence: 1 }, rating: 4 }, { type: 'leak_detected' }, { type: 'summary_submitted', text: 'early' }]));
      else {
        const ev = { type: 'learner_turn', content: `L${steps.length} ${pick(rng, ['answer', 'idk', 'the key idea is…', '  spaced\tout  '])}` };
        if (rng() < 0.7) ev.confidence = 1 + Math.floor(rng() * 3);
        send(ev);
      }
    }
    while (late.length) send(late.shift());
    return steps;
  }
  const lessons = pack.units.flatMap((u) => u.lessons);
  const scripts = [];
  const scaff = ['novice', 'developing', 'advanced'];
  lessons.forEach((lesson, i) => {
    for (const k of [0, 1]) {
      const scaffolding = scaff[(i + k) % 3];
      const learnerMisconceptions = k ? { [lesson.concepts[0].id]: [lesson.concepts[0].misconceptions[0]?.tag ?? 'x'] } : undefined;
      const init = createLessonState({ sessionId: `s${i}${k}`, courseId: 'course', lesson, scaffolding, learnerMisconceptions });
      scripts.push({ lessonId: lesson.id, init, steps: runLesson(lesson, init, 77 + i * 2 + k, { leak: k ? 0.2 : 0.08, checkFail: k ? 0.6 : 0.3 }) });
    }
  });
  const remediations = allConcepts(pack).filter((_, i) => i % 7 === 0).map((concept, i) => {
    const plan = composeRemediation(concept, { sessionId: `r${i}`, courseId: 'course', scaffolding: scaff[i % 3], learnerMisconceptions: i % 2 ? [concept.misconceptions[0]?.tag ?? 'x'] : undefined });
    return { conceptId: concept.id, lesson: plan.lesson, init: plan.state, steps: runLesson(plan.lesson, plan.state, 300 + i, { checkFail: 0.5 }) };
  });
  // buildTutorControl for every phase × concept × hint level.
  const controls = [];
  for (const lesson of lessons.slice(0, 3)) {
    const st = createLessonState({ sessionId: 's', courseId: 'c', lesson, scaffolding: 'novice' });
    for (let ci = 0; ci <= lesson.concepts.length; ci++) {
      for (const phase of ['PRIME', 'PROBE', 'DEVELOP', 'CONSOLIDATE', 'EXTEND', 'CHECK', 'REMEDIATE', 'WRAP', 'DONE']) {
        for (const hintLevel of [0, 1, 2, 3]) {
          const state = { ...st, conceptIndex: ci, phase, hintLevel, guidingIndex: hintLevel + 1, workedExampleShown: hintLevel > 1, summaryText: hintLevel ? ' a\n summary ' : undefined, misconceptions: { [lesson.concepts[0].id]: [lesson.concepts[0].misconceptions[0].tag] } };
          controls.push({ lessonId: lesson.id, conceptIndex: ci, phase, hintLevel, control: core.buildTutorControl(state, lesson, hintLevel === 2 ? { preamble: '  Feedback first.  ' } : {}) });
        }
      }
    }
  }
  write('lesson.json', { scripts, remediations, controls });
}

// ---------------------------------------------------------------------------
// Checkpoint, diagnostic, teach-back, learner model, onboarding
// ---------------------------------------------------------------------------
{
  const { composeCheckpoint, createCheckpointState, reduceCheckpoint } = core;
  const [u1, u2] = pack.units;
  const conceptIds = allConcepts(pack).map((c) => c.id);
  const compositions = [];
  for (let seed = 1; seed <= 24; seed++) {
    const rng = mulberry32(seed);
    const mastery = Object.fromEntries(conceptIds.filter(() => rng() < 0.7).map((id) => [id, Math.floor(rng() * 10) / 10]));
    const size = pick(rng, [undefined, 1, 4, 10, 12, 30, 200]);
    const unit = seed % 3 === 0 ? u1 : u2;
    const previous = seed % 3 === 0 ? [] : [u1];
    const items = composeCheckpoint({ unit, previousUnits: previous, conceptMastery: new Map(Object.entries(mastery)), size, rng: seededRng(seed) });
    compositions.push({ seed, unitId: unit.id, previousUnitIds: previous.map((u) => u.id), mastery, size: size ?? null, itemIds: items.map((i) => i.id) });
  }
  const runs = [];
  for (let seed = 1; seed <= 8; seed++) {
    const rng = mulberry32(seed + 40);
    const items = composeCheckpoint({ unit: u2, previousUnits: [u1], conceptMastery: new Map(), size: 6 + seed, rng: seededRng(seed) });
    let state = createCheckpointState({ sessionId: 's', courseId: 'c', unitId: u2.id, items });
    const steps = [];
    const send = (event) => { const r = reduceCheckpoint(state, event); state = r.state; steps.push({ event, state, effects: r.effects }); return r.effects; };
    send({ type: 'start' });
    for (let g = 0; g < 200 && !state.done; g++) {
      const cur = state.items[state.index];
      const x = rng();
      if (x < 0.03) send({ type: 'finish' });
      else if (x < 0.08) send({ type: 'grade', itemId: pick(rng, items).id, grade: { criteria: [], score: 0.5, misconceptionTags: [], feedback: 'f', confidence: 1 }, rating: 2 });
      else if (x < 0.1) send({ type: 'answer_submitted', itemId: 'nope', answer: 'a', confidence: 1 });
      else if (cur) {
        const effs = send({ type: 'answer_submitted', itemId: cur.itemId, answer: `ans ${g}`, confidence: 1 + Math.floor(rng() * 3) });
        for (const e of effs) if (e.type === 'grade_item') {
          const score = Math.floor(rng() * 101) / 100;
          send({ type: 'grade', itemId: e.itemId, grade: { criteria: [{ id: 'c1', met: score > 0.5, evidence: 'e' }], score, misconceptionTags: [], feedback: `f${score}`, confidence: 0.9 }, rating: core.ratingFromGrade(score, 0.9) });
        }
      } else send({ type: 'finish' });
    }
    runs.push({ itemIds: items.map((i) => i.id), steps });
  }

  // Diagnostic: noisy learners over the pack and the core test fixture.
  const diagnostics = [];
  for (const [name, cur] of [['pack', pack], ['fixture', sessionFixture.curriculum]]) {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = mulberry32(seed + 900);
      let s = core.createDiagnostic(cur);
      const frontier = Math.floor(rng() * (s.maxDepth + 2));
      const probes = [];
      for (let p = core.nextProbe(s); p; p = core.nextProbe(s)) {
        const passed = rng() < 0.15 ? !((s.depth[p.conceptId] ?? 0) < frontier) : (s.depth[p.conceptId] ?? 0) < frontier;
        probes.push([p, passed]);
        s = core.recordResult(s, p.conceptId, passed);
      }
      diagnostics.push({ curriculum: name, initial: core.createDiagnostic(cur), probes, final: s, result: core.diagnosticResult(s) });
    }
  }

  // Teach-back scripts.
  const teachbacks = allConcepts(pack).slice(0, 6).map((concept, i) => {
    const rng = mulberry32(i + 70);
    let state = core.createTeachbackState({ sessionId: 's', courseId: 'c', concept });
    const steps = [];
    const send = (event) => { const r = core.reduceTeachback(state, event); state = r.state; steps.push({ event, state, effects: r.effects }); };
    send({ type: 'start' });
    for (let g = 0; g < 30 && !state.done; g++) {
      const x = rng();
      if (state.grading) send({ type: 'grade', grade: { criteria: [], score: Math.floor(rng() * 100) / 100, misconceptionTags: [], feedback: 'f', confidence: 0.8 }, rating: 3 });
      else if (x < 0.4) send({ type: 'student_turn', content: `S${g}` });
      else if (x < 0.45) send({ type: 'end' });
      else send({ type: 'learner_turn', content: rng() < 0.1 ? '   ' : ` part ${g} `, ...(rng() < 0.1 ? { done: true } : {}) });
    }
    return { conceptId: concept.id, steps };
  });

  // Learner model.
  const course = { id: 'c', curriculumId: 'p', curriculumVersion: 1, title: 'T', goals: { purpose: 'exam', examDate: 1, weeklyMinutes: 140, background: '  I know   a bit\nabout dice — and coins.  ' }, settings: { desiredRetention: 0.9, reviewsPerDay: 60, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: 'UTC' }, scaffolding: 'developing', createdAt: 1, updatedAt: 2 };
  const learnerModels = [];
  for (let seed = 1; seed <= 12; seed++) {
    const rng = mulberry32(seed + 1200);
    const concepts = allConcepts(pack);
    const conceptStates = concepts.filter(() => rng() < 0.6).map((c) => ({ courseId: 'c', conceptId: c.id, mastery: rng() < 0.1 ? 1.2 : rng() < 0.2 ? 0 : rng(), successfulSessions: Math.floor(rng() * 4), misconceptions: c.misconceptions.map((m) => m.tag).slice(0, Math.floor(rng() * 5)), assistedPass: 0, assistedN: 0, unassistedPass: 0, unassistedN: 0, updatedAt: 0 }));
    const input = {
      course: seed % 2 ? course : { ...course, goals: { purpose: 'understand', weeklyMinutes: 70 } },
      conceptStates, conceptNames: new Map(concepts.filter(() => rng() < 0.9).map((c) => [c.id, c.name])),
      calibration: { brier: rng() * 0.4, overconfidenceBias: rng() * 0.6 - 0.3, n: Math.floor(rng() * 3) * 40 },
      recent: { ...(rng() < 0.7 ? { lastLessonSummary: 'Learned  things.\n'.repeat(Math.floor(rng() * 40)) } : {}), openQuestions: ['why\tso?', 'x'.repeat(200), 'a', 'b', 'c'].slice(0, Math.floor(rng() * 6)) },
      ...(rng() < 0.5 ? { preferences: { verbosity: 'terse', examplesDomain: ' sports  and games ' } } : {}),
    };
    const focus = concepts.filter(() => rng() < 0.4).map((c) => c.id).concat(['unknown-1']);
    const summary = core.summarizeLearnerModel(input);
    learnerModels.push({ input: { ...input, conceptNames: Object.fromEntries(input.conceptNames) }, focus, summary, text: core.renderLearnerModel(summary, focus) });
  }

  // Onboarding matcher.
  const tiny = tinyPack();
  const recalls = ['', '  ', 'I remember the complement rule from school.', 'you add probabilities of disjoint events; that addition thing',
    'probability is about events, I think', "Bayes' theorem and base rates, plus conditional probability", 'BAYES THEOREM', 'permutations vs combinations, factorial',
    'expected value, variance and standard deviation; the binomial distribution; geometric; memorylessness', 'the law of large numbers and monte carlo simulation',
    'independence — independent random variables — covariance and correlation', 'sample spaces and events, equally likely outcomes', 'café rules àla carte',
    'the multiplication principle; chain rule', 'Joint and marginal distributions'];
  const named = [];
  for (const [name, cur] of [['pack', pack], ['tiny', tiny]]) for (const r of recalls) for (const limit of [1, 4, 10]) named.push([name, r, limit, onboarding.conceptsNamed(cur, r, limit)]);

  write('sessions.json', { compositions, checkpointRuns: runs, diagnostics, teachbacks, learnerModels, conceptsNamed: named });
  write('tiny-pack.json', tiny);
  write('core-fixture.json', sessionFixture.curriculum);
}
