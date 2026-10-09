# Research: spaced-repetition scheduling algorithms and libraries (Sept 2026)

Sourcing note: several primary sites were unreachable during research (expertium.github.io, justinmath.com, notes.andymatuschak.org, docs.ankiweb.net). Where the primary page could not be read, facts come from GitHub raw sources (ts-fsrs, fsrs-rs, anki-manual, srs-benchmark), the npm/crates registries, and search snippets; those spots are flagged.

## 1. SM-2 and its weaknesses

SM-2 (SuperMemo, 1987; Anki's legacy scheduler) keeps per-card `ease` (start 2.5, floor 1.3) and `interval`. Good: `ivl *= ease`; Hard: `ivl *= 1.2`, `ease -= 0.15`; Again: `ease -= 0.2`, interval reset (Anki default "new interval" 0%); Easy: `ease += 0.15` plus easy bonus 1.3. Known problems:

- **Ease hell**: repeated lapses drive ease to 1.3 permanently, so intervals barely grow even after the card is well known. Mean reversion in FSRS's difficulty update was designed specifically against this.
- **No memory model**: it does not predict probability of recall, cannot be given a target retention, and cannot exploit the spacing effect (larger gain from reviewing when R is low).
- **Not personalised/trainable**; same multipliers for every user and deck; "Hard" and "Easy" semantics are ad hoc.
- Benchmarked, SM-2 is far worse than FSRS at predicting recall (blog summaries of srs-benchmark cite FSRS-6 beating Anki-SM-2 for ~99.6% of users).

Sources: [antiagent FSRS vs SM-2](https://www.antiagent.io/blog/fsrs-vs-sm-2), [memstride](https://memstride.com/blog/fsrs-vs-sm2-algorithm-comparison/), [Anki manual, deck-options.md (raw)](https://raw.githubusercontent.com/ankitects/anki-manual/main/src/deck-options.md).

## 2. FSRS (open-spaced-repetition, Jarrett Ye / L-M-Sherlock)

### DSR model
Each card carries **D** (difficulty, clamped 1–10), **S** (stability = days until R drops to 90%), and **R** (retrievability = P(recall) now). Descends from Wozniak's three-component model via MaiMemo's DHP model.

### Current version: FSRS-6 (21 parameters); FSRS-7 exists in the benchmark, not yet shipped
- **FSRS-6** (Anki 25.07+, ts-fsrs 5.x, fsrs-rs 6.x) has 21 trainable parameters w0..w20. It added a *trainable forgetting-curve decay* (w20) and an S-dependent same-day (short-term) stability formula.
- **FSRS-7** (34–35 params) is in `srs-benchmark` and `fsrs-rs` source but as of fsrs-rs 6.6.2 / Anki 26.09 the shipped default is still FSRS-6. FSRS-7 works with fractional interval lengths, has an 8-parameter dual forgetting curve, and is intended to ship with recency weighting plus "scheduling penalties".

### Formulas (FSRS-6, verified against ts-fsrs `packages/fsrs/src/algorithm.ts` and fsrs-rs)

Forgetting curve (power law):
```
R(t, S) = (1 + FACTOR · t / S) ^ (-w20)
FACTOR  = 0.9^(-1/w20) - 1          # guarantees R(S, S) = 0.9
```
(FSRS-4.5/5 used fixed decay 0.5, FACTOR = 19/81.)

Interval for desired retention r:
```
I(r, S) = (S / FACTOR) · (r^(-1/w20) - 1)     # ts-fsrs: intervalModifier = (r^(1/decay) - 1)/factor, decay = -w20
next_interval = clamp(round(S · intervalModifier), 1, maximum_interval)  then optional fuzz
```
At r = 0.9 the interval equals S.

Initial state after first rating G ∈ {1 Again, 2 Hard, 3 Good, 4 Easy}:
```
S0(G) = w[G-1]                       (w0..w3)
D0(G) = w4 - e^(w5·(G-1)) + 1
```
Difficulty update (linear damping + mean reversion toward D0(4), the anti-ease-hell part):
```
ΔD   = -w6 · (G - 3)
D'   = D + ΔD · (10 - D) / 9
D''  = w7 · D0(4) + (1 - w7) · D'        clamp to [1, 10]
```
Stability after successful recall (inter-day):
```
S'_r = S · ( e^w8 · (11 - D) · S^(-w9) · (e^(w10·(1-R)) - 1) · hardPenalty · easyBonus + 1 )
hardPenalty = w15 if G=Hard else 1;   easyBonus = w16 if G=Easy else 1
```
(Lower R at review time → bigger stability gain = spacing effect; higher S → smaller relative gain.)

Stability after a lapse (post-lapse stability, capped at previous S):
```
S'_f = min( w11 · D^(-w12) · ((S + 1)^w13 - 1) · e^(w14·(1-R)) ,  S )
```
Same-day / short-term review (FSRS-6):
```
S' = S · S^(-w19) · e^(w17 · (G - 3 + w18))       (for G ≥ Hard, multiplier floored at 1)
```

Default parameters (identical in ts-fsrs `constant.ts` and fsrs-rs `inference_v6.rs`):
```
[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
```
Parameter clamps worth knowing: S ∈ [0.001, 36500], initial S ≤ 100, decay w20 ∈ [0.1, 0.8].

### Optimizer
Maximum-likelihood fit: for every review, replay the card's history through the DSR equations, predict R at that review, and minimise binary cross-entropy against the actual outcome (Again = 0, else 1) with L2 regularisation, Adam + cosine-annealed LR, parameters clipped to physical ranges; recent reviews can be up-weighted. Data needed per review: card id, timestamp, rating, and (optionally) state and duration; elapsed days are derived from consecutive timestamps of the same card, so the review log is the only thing you must store faithfully. Anki's minimum went 1000 → 400 → none (24.06+; research showed optimisation beats defaults after ~16 reviews, though the manual says "a few hundred" is where it reliably helps).

Sources: [awesome-fsrs wiki: The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), [fsrs-optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer), [Anki issue #3094](https://github.com/ankitects/anki/issues/3094).

### Benchmark (srs-benchmark, 9,999 Anki collections, ~350M evaluated reviews, TimeSeriesSplit)
| Algorithm | Params | LogLoss↓ | RMSE(bins)↓ | AUC↑ |
|---|---|---|---|---|
| RWKV-Instant (research NN) | 2.76M | 0.2773 | 0.0250 | 0.833 |
| GRU / LSTM | 503 / 8.9k | 0.333 | 0.055 | 0.732 |
| FSRS-7 recency | 34 | 0.3370 | 0.0593 | 0.722 |
| **FSRS-6** | 21 | 0.3460 | 0.0653 | 0.703 |
| FSRS-5 | 19 | 0.3561 | 0.0742 | 0.701 |
| FSRS v4 (first Anki version) | 17 | 0.3726 | 0.0838 | 0.685 |
| DASH | 9 | 0.3682 | 0.0838 | 0.631 |
| AVG baseline | 0 | 0.3945 | 0.1034 | 0.500 |
| HLR (Duolingo) | 3 | 0.4694 | 0.1275 | 0.637 |
| Ebisu v2 | 0 | 0.4989 | 0.1627 | 0.605 |

Note HLR and Ebisu v2 are *worse than predicting the user's average*. Source: [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark).

### Desired retention
Permissible 0.70–0.99 in Anki; default 0.90. Workload vs retention is U-shaped: below ~0.8 relearning dominates, above 0.9 it rises sharply, above 0.97 "overwhelming" (Anki manual). Practical range 0.80–0.95; 0.85–0.90 is the usual sweet spot. Sources: [fsrs4anki wiki: optimal retention](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-optimal-retention).

### Anki integration timeline
- 23.10 (Oct 2023): FSRS v4 shipped as opt-in. 23.12: FSRS-4.5. 24.04: FSRS-5. 25.02: fsrs-rs 2.x, easy-days + load-balancer refinements. 25.07 (Jul 2025): FSRS-6, health check replaces "Evaluate". 26.08 / 26.09 (Aug–Sep 2026): fsrs-rs 6.6.1 / 6.6.2.
- **Default status**: issue [#3616 "Make FSRS the default?"](https://github.com/ankitects/anki/issues/3616) is still open; treat FSRS as still opt-in for existing Anki profiles as of 26.09.

## 3. Libraries

### ts-fsrs (npm) — recommended for the TS frontend
- Version **5.4.2** (published 2026-09-01; 6.0.0-beta.9 on the `beta` tag), MIT, zero runtime deps, Node ≥ 20, ESM/CJS/UMD. Implements FSRS-6; accepts 17/19/21-length `w` and migrates automatically. Monorepo: `packages/fsrs` (scheduler), `packages/binding` (optimizer).
```ts
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type ReviewLog } from 'ts-fsrs'

const params = generatorParameters({ request_retention: 0.9, maximum_interval: 36500,
  enable_fuzz: true, enable_short_term: true, learning_steps: ['1m','10m'], relearning_steps: ['10m'] })
const f = fsrs(params)
const card: Card = createEmptyCard(new Date())
const preview = f.repeat(card, new Date())            // RecordLog: {[Rating.Again|Hard|Good|Easy]: {card, log}}
const { card: next, log } = f.next(card, new Date(), Rating.Good)
f.get_retrievability(next, new Date(), false)        // number 0..1 (true → "xx.xx%" string)
f.rollback(next, log)                                 // undo one review
f.forget(next, new Date(), /*reset_count*/ false)     // back to New, keep/clear reps+lapses
f.reschedule(card, reviewLogs, { recordLogHandler, reviewsOrderBy, skipManual, update_memory_state })  // replay history
f.next_state({stability, difficulty}, elapsedDays, Rating.Good); f.next_interval(s, elapsedDays)
```
Types: `enum State {New=0, Learning=1, Review=2, Relearning=3}`, `enum Rating {Manual=0, Again=1, Hard=2, Good=3, Easy=4}`. `Card = {due, stability, difficulty, elapsed_days(deprecated), scheduled_days, learning_steps, reps, lapses, state, last_review?}`. `ReviewLog = {rating, state, due, stability, difficulty, elapsed_days(dep.), last_elapsed_days(dep.), scheduled_days, learning_steps, review}`. Defaults: retention 0.9, max interval 36500, fuzz off, short-term on, steps `['1m','10m']` / `['10m']`.
- Optimizer: **`@open-spaced-repetition/binding`** 0.5.0 (MIT, public beta): fsrs-rs compiled via napi-rs to native + **WASI**; `convertCsvToFsrsItems(csv, ratingCol, tz, offsetFn)`, `computeParameters(items, {enableShortTerm, numRelearningSteps, timeout, progress})`, `computeOptimalSteps(csv, retention, decayOrParams)`; runs in browsers with COOP/COEP headers. Older path: [`fsrs-browser`](https://github.com/open-spaced-repetition/fsrs-browser) (wasm-bindgen build of fsrs-rs; trains 24k reviews in ~3.5 s).
Links: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), [binding README](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md).

### fsrs-rs (Rust crate `fsrs`) — recommended for a Tauri backend
- **6.6.2** (2026-08-29), BSD-3-Clause; the crate Anki uses. Scheduler + optimizer + simulator in one crate. Training no longer depends on `burn`: since 6.3 it uses hand-written analytic gradients with scalar/SIMD kernels, so it is a light dependency and fast.
```rust
use fsrs::{FSRS, MemoryState, FSRSItem, FSRSReview, ComputeParametersInput, compute_parameters};
let fsrs = FSRS::default();                       // or FSRS::new(&params)?
let ns = fsrs.next_states(prev_state /*Option<MemoryState>*/, 0.9, elapsed_days)?;
let ivl = ns.good.interval.round().max(1.0) as u32;   // ns.again/.hard/.good/.easy: ItemState{memory, interval}
let st = fsrs.memory_state(FSRSItem{ reviews: vec![FSRSReview{rating:3, delta_t:5}, ...] }, None)?;
let r  = fsrs.current_retrievability(st, days_elapsed);
let w  = compute_parameters(ComputeParametersInput{ train_set: items, ..Default::default() })?;
let from_sm2 = fsrs.memory_state_from_sm2(ease, interval, 0.9)?;   // migration
```
Also exports `simulate`, cost-ADR retention policies, `evaluate_with_card_ids`, `FSRS6_DEFAULT_PARAMETERS`, `FSRS6_DEFAULT_DECAY`. Links: [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs), [crates.io](https://crates.io/crates/fsrs).

### py-fsrs
MIT; `Scheduler`, `Card`, `Rating`, `ReviewLog`; optional `fsrs[optimizer]` extra adds `Optimizer(review_logs).compute_optimal_parameters()`. Good for offline analysis notebooks. [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs).

## 4. Alternatives

**Half-Life Regression (Settles & Meeder, ACL 2016, Duolingo)**: `p = 2^(-Δ/h)`, `ĥ = 2^(Θ·x)` with features `x` = √(1+#correct), √(1+#incorrect), plus per-lexeme indicator weights. Pros: tiny, trivially trained by SGD, pooled across users. Cons: exponential curve (real forgetting is closer to power law), no per-user memory state, no spacing effect, needs a big population; in srs-benchmark it scores worse than the constant AVG baseline. [Paper repo](https://github.com/duolingo/halflife-regression).

**Ebisu (fasiha)**: Bayesian; Beta prior on recall probability at a reference half-life, exponential decay, exact analytic update. Pros: no training set required, principled uncertainty, soft/binomial results (nice for free-response partial credit). Cons: v2 assumes memory strength is fixed and merely uncertain, so it under-grows intervals and ends up bottom of the benchmark; v3 has been in RFC since 2022 without a definitive release. [Ebisu](https://github.com/fasiha/ebisu).

Verdict: FSRS is the only option that is both benchmark-leading and production-hardened (Anki, RemNote, many apps) with maintained TS and Rust implementations.

## 5. Non-flashcard items and concept-level scheduling

- **Successive relearning (Rawson & Dunlosky)**: retrieve each item to criterion (e.g. 3 correct in the first session, then 1 correct per later session) across ≥3 spaced sessions; 20% → ~80% one-week recall in their studies. Short-answer/explain-type questions work at least as well as MC. Maps directly to FSRS learning steps: keep the item in Learning with intra-day steps until first correct recall, then let FSRS space the relearning sessions. [Rawson & Dunlosky 2022](https://journals.sagepub.com/doi/full/10.1177/09637214221100484).
- **Free-response / concept items**: FSRS needs only a 4-level grade per review; grade free-response by rubric (fail → Again, partial → Hard, correct → Good, fluent → Easy) and, if you use an LLM judge, map score bands to grades. Keep the *scheduled unit* atomic-ish (one concept, one target answer) even if the prompt is open; Matuschak's guidance for conceptual prompts: focused, precise, consistent (same answer each time), tractable and effortful; use explanation, procedural, open-list and "salience" prompts rather than trying to schedule an essay. Orbit's own scheduler is deliberately simple: initial interval 5 days, ×2.3 on success, ÷2.3 on failure ([orbit scheduler](https://github.com/andymatuschak/orbit/blob/master/packages/core/src/schedulers/spacedRepetitionScheduler.ts)). Quantum Country's RCTs (initial intervals of 1 wk–2 mo) found flat forgetting (89% → 81% over two months) for prose-embedded prompts, so in-context conceptual questions decay far slower than isolated vocabulary and aggressive early intervals are fine (from search excerpts).
- **Knowledge tracing (BKT/DKT) vs FSRS**: BKT models a latent binary "known" per skill with learn/guess/slip parameters; DKT/SAINT/AKT need ~50k+ learner sequences. KT predicts next-answer correctness on a skill given a population; FSRS predicts *time-dependent* recall of an individual item with per-user fitting. For a personal app with one learner, FSRS is the right primitive; skill-level modelling sits *above* it: FSRS states per item, aggregate per concept.
- **Math Academy / FIRe (Skycak)**: two graphs, a prerequisite graph and an *encompassing* graph (topic B encompasses A if practising B implicitly practises A). A repetition on an advanced topic propagates *fractional* credit down to encompassed topics, cancelling redundant explicit reviews ("spaced repetition compression"); failures on advanced tasks propagate penalties back to prerequisites; due reviews go before new lessons. Practical takeaway: store `encompasses(child → parent, weight)`, and on a successful review of the parent apply a synthetic partial review to each child (simplest with FSRS: bump S by `weight × (S'_r − S)` and re-derive due dates). ([Skycak essay](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/), from search excerpts.)
- **Anki mechanics to copy**: (1) learning/relearning steps < 1 day (`1m 10m` / `10m`); (2) **fuzz**: ±small random % on review intervals ≥ 2.5 d so siblings don't cluster; (3) **load balancer**: choose the day within the fuzz window with the fewest cards due; (4) **easy days**: per-weekday weights; (5) **sibling burying**: after answering a card, hide its siblings until tomorrow; (6) `maximum_interval` default 36500 d; (7) review sort "due date, then random".

## 6. Practical design recommendations

**Choice**: ts-fsrs in the TypeScript client for scheduling and previews; the `fsrs` crate on Tauri for the optimizer and simulator; keep both on FSRS-6 with the same 21-vector. Expect a migration to FSRS-7 (34 params, fractional days) in the next year; store `w` as JSON so length can change.

**Schema (SQLite)**
```sql
CREATE TABLE cards (
  id INTEGER PRIMARY KEY, concept_id INTEGER, kind TEXT,        -- 'basic','free_response',...
  state INTEGER NOT NULL DEFAULT 0,          -- 0 New,1 Learning,2 Review,3 Relearning
  due INTEGER NOT NULL, last_review INTEGER, stability REAL, difficulty REAL,
  scheduled_days INTEGER DEFAULT 0, learning_steps INTEGER DEFAULT 0,
  reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, suspended INTEGER DEFAULT 0
);
CREATE TABLE review_log (                     -- append-only; the optimizer's only input
  id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, review_time INTEGER NOT NULL,  -- ms UTC
  rating INTEGER NOT NULL,                    -- 1..4 (0 = manual reschedule, excluded from training)
  state INTEGER NOT NULL,                     -- state *before* the review
  elapsed_days INTEGER, scheduled_days INTEGER, stability REAL, difficulty REAL,
  duration_ms INTEGER, source TEXT            -- 'review','implicit','manual'
);
CREATE INDEX idx_rl_card ON review_log(card_id, review_time);
CREATE TABLE params (preset TEXT PRIMARY KEY, w TEXT NOT NULL, desired_retention REAL, optimized_at INTEGER, n_reviews INTEGER);
```
Also store the user's timezone and `day_start_hour` (e.g. 4) so "same day" is computed the way the optimizer does.

**Initial parameters and optimizing**: start from the FSRS-6 defaults with `request_retention = 0.9`. Run the optimizer once you have a few hundred reviews, then monthly or every ~1,000 new reviews, in a worker and never on the UI thread. Do not reschedule existing cards on parameter change by default. Optionally run the health check (log loss vs defaults) and keep defaults if optimized params are worse.

**Lapses ("Again")**: transition Review → Relearning, run the `10m` relearning step, apply `S'_f` (min with old S), `lapses++`. Never map "Hard" to failure. Consider a leech rule (e.g. 8 lapses → tag/suspend and prompt a rewrite).

**Max interval**: keep 36500 unless the domain demands (exam date → cap at days-to-exam or set retention higher for that course).

**Daily queue and review-first policy**: intraday learning (due now) → interday learning → reviews (due date, then random) → new cards, with `new_per_day` and `reviews_per_day` limits; by default the review limit also caps new cards. Show new cards *after* reviews by default.

**Review debt gating**: define `debt = count(due reviews) − reviews_per_day` (or minutes via the simulator). If debt > 0, set today's effective new-card limit to 0 (or `max(0, new_limit − debt/k)`); when a backlog spans days, do not "catch up" in one sitting: sort overdue by retrievability ascending (lowest R first) or by relative overdueness, cap the session, and let FSRS's low-R bonus repair stability. Because at steady state each new card costs several future reviews, the new-card rate is the single lever that prevents the "abandonment spiral".

**Concept-level layer**: keep FSRS per item; compute a concept's "mastery" as the mean (or min) retrievability of its items; use the encompassing graph for implicit credit and gate new lessons on prerequisite concepts' mastery ≥ threshold.

Key links: [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) · [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) · [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) · [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) · [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs) · [fsrs-optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) · [fsrs-browser](https://github.com/open-spaced-repetition/fsrs-browser) · [Anki manual source](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md) · [Anki #3616](https://github.com/ankitects/anki/issues/3616) · [Ebisu](https://github.com/fasiha/ebisu) · [HLR](https://github.com/duolingo/halflife-regression) · [Orbit](https://github.com/andymatuschak/orbit) · [Skycak FIRe](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/) · [Rawson & Dunlosky 2022](https://journals.sagepub.com/doi/full/10.1177/09637214221100484)
