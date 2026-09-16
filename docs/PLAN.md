# Epistemics: implementation plan

Companion to [DESIGN.md](DESIGN.md). Six phases, each ending in something usable. Estimates assume one developer working most days with Claude Code assistance; take them as relative sizes.

---

## 0. Guiding rules for the build

1. **Pedagogy lives in `packages/core`, is pure, and is tested with scripted learners** before any UI exists. The LLM is an effect executor.
2. **One frontend build.** Nothing in `apps/web` imports Tauri directly; only `packages/platform` does, lazily.
3. **The review log is sacred.** Append-only, never rewritten by migrations; everything else can be recomputed from it plus the curriculum.
4. **Generate once.** Every LLM-generated artifact is keyed by `(input hash, prompt version, model)` and stored before it is used.
5. **Ship a hand-authored curriculum first.** The tutor and scheduler are validated on a small human-written pack before the Architect exists, so generation bugs and pedagogy bugs are never confused.
6. **Prompts are versioned files** under `content/prompts` with a changelog; the eval suite runs on every prompt or model change.

---

## 1. Repository layout and tooling (set up in Phase 0)

```
epistemics/
  apps/web  apps/desktop  apps/server
  packages/core  packages/db  packages/platform  packages/llm  packages/ingest  packages/ui
  content/packs  content/prompts
  evals/
  docs/
  pnpm-workspace.yaml  turbo.json  package.json  tsconfig.base.json  .github/workflows/ci.yml
```

| Tool | Choice | Notes |
|---|---|---|
| Package manager | pnpm 12 with catalogs | Single source of versions |
| Task runner | Turborepo 2 | `build`, `test`, `lint`, `typecheck`, `dev` |
| Language | TypeScript 7 (`tsgo`), strict | Project references per package |
| Frontend | React 19, Vite 8, TanStack Router (hash history in Tauri) + Query | SPA only |
| UI | Tailwind 4, shadcn on Base UI, Streamdown for chat, react-markdown + KaTeX for static views | |
| Data | Drizzle ORM 0.45 (`sqlite-proxy`), drizzle-kit migrations | Pin; do not float to 1.0 RC |
| Web DB | `@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS in a Worker | Web Locks for single owner |
| Desktop | Tauri 2.11, `tauri-plugin-sql` → `rusqlite` later, `keyring`, `reqwest`, `fsrs` crate | Stay on 2.x; keep plugin surface thin for 3.0 |
| Scheduler | `ts-fsrs` 5.x; `@open-spaced-repetition/binding` (WASI) for the web optimizer | FSRS-6 |
| LLM | `@anthropic-ai/sdk` with injected fetch; Zod schemas + `zodOutputFormat` | Model IDs in config |
| Ingest | `pdfjs-dist`, zip + DOMParser for EPUB, `mammoth`, `remark`, `tesseract.js`, `@huggingface/transformers` | All in workers |
| Tests | Vitest 5 (node + browser mode), Playwright 1.63, `cargo test` | |
| CI | GitHub Actions: lint, typecheck, unit, browser DB tests, Rust tests, eval smoke (mocked LLM), desktop build on 3 OSes weekly | |

Conventions: UUIDv7 ids; `snake_case` SQL, `camelCase` TS; every table has `created_at`, `updated_at`, `deleted_at`; Zod schema for every LLM output; every prompt file has a `version` header.

---

## 2. Phases

### Phase 0: Skeleton that runs in both shells (≈ 1 week)

Goal: an empty app that boots in the browser and in Tauri from one build, with a working database in both.

Tasks:
- [ ] Monorepo scaffold, catalogs, Turborepo pipeline, CI skeleton.
- [ ] `packages/db`: Drizzle schema for the core tables (DESIGN §9.3), first migration, `DbExecutor` interface, repository stubs.
- [ ] Web executor: sqlite-wasm worker, `opfs-sahpool`, Web Locks owner election, migration runner, in-memory fallback. Browser-mode Vitest that creates, migrates, and reopens a DB.
- [ ] Desktop executor: `tauri-plugin-sql` behind the same interface; Rust migration registration; `cargo test` for the migration list.
- [ ] `packages/platform`: `Platform` interface, `isTauri()` switch, lazy import of the Tauri implementation.
- [ ] `apps/web`: router, layout shell, Settings screen with a DB self-test.
- [ ] `apps/desktop`: Tauri config pointing at `apps/web/dist`, capabilities, hash routing, dev script that runs Vite + Tauri.
- [ ] `apps/server`: Hono proxy skeleton (health endpoint only).

Acceptance: `pnpm dev` serves the SPA; `pnpm tauri dev` opens the same UI; both show "DB OK, 1 migration applied"; CI green.

### Phase 1: Scheduler and review loop with a hand-authored pack (≈ 2 weeks)

Goal: a usable spaced-repetition app with the review gate, before any LLM is involved.

Tasks:
- [ ] `packages/core/scheduler`: ts-fsrs wrapper; queue builder (learning → review → new), sibling burying, fuzz + load balancing, easy days, leech rule, exam-date interval cap.
- [ ] Review gate and debt meter; recovery mode; the one daily override with logging.
- [ ] Concept mastery, successive-relearning counter, prerequisite availability (DESIGN §5.5) as pure functions with property tests.
- [ ] Pack format v1 (`.epistemics` zip, manifest, curriculum.json, items.json) and importer; Shelf screen with enrol.
- [ ] Hand-author `content/packs/probability-basics.epistemics`: ~2 units, 8 lessons, ~30 concepts, ~200 items across `recall`, `cloze`, `explain`, `apply`, with rubrics. This is the fixture for everything after.
- [ ] Review screen: confidence before reveal, rating after, keyboard shortcuts, self-grade for `recall`/`cloze`; `explain`/`apply` temporarily self-graded with the rubric shown.
- [ ] `review_log` writer, `jol` collection at session end, Today screen (queue, debt meter, locked lesson placeholder).
- [ ] Course map (graph coloured by mastery) using the prerequisite edges from the pack.
- [ ] Simulator (port of ts-fsrs/fsrs-rs simulate) for the debt meter's minutes estimate and the Progress forecast.

Acceptance: a week of simulated use (scripted learner with a forgetting model) produces a stable daily load; retention predicted by FSRS matches the simulated learner within tolerance; the gate locks and unlocks correctly in tests; the review UI is pleasant enough to use daily.

### Phase 2: LLM layer and the Socratic lesson (≈ 3 weeks)

Goal: lessons from the hand-authored pack are taught by the tutor with the full state machine, observer, and blind grader.

Tasks:
- [ ] `packages/llm`: `LlmProvider` interface; Anthropic provider on the official SDK (streaming, `messages.parse` for structured output, cache breakpoints, effort per role, usage logging into `llm_calls`); mocked provider for tests that replays recorded responses.
- [ ] Desktop transport: `llm_fetch` Rust command (allowlist, keychain key, reqwest, Channel streaming) and the JS `Response` wrapper; `cargo test` for the allowlist; keychain get/set commands and the Settings UI for keys.
- [ ] Web transport: Hono passthrough proxy with SSE streaming and a per-day budget; BYOK mode behind a setting.
- [ ] Prompt files v1: tutor charter, observer schema, grader schema, teach-back student. Zod schemas for observer and grader outputs.
- [ ] `packages/core/session`: lesson state machine reducer (PRIME → PROBE → DEVELOP → CONSOLIDATE → EXTEND → CHECK → wrap), hint ladder, scaffolding level selection, item activation, assisted/unassisted logging. Unit tests with scripted learners covering: novice path, advanced path, stuck learner, give-up, misconception loop, leak regeneration.
- [ ] Guardrails: leak detector (string + Haiku entailment), turn-shape check, two-attempts-before-reveal, cost guard with model degradation.
- [ ] Blind grader with consensus deferral and receipts; dispute flow; rating map; replace the temporary self-grading for `explain`/`apply` in review.
- [ ] Lesson screen: streaming chat, phase indicator, hint pips, source side panel, give-up; Today screen unlocks the lesson through the gate.
- [ ] Prompt-caching assertion test (`cache_read_input_tokens > 0` on turn 2).
- [ ] `evals/`: first sets: 30 leak cases, 20 sycophancy dialogues, 40 grader items with human labels; runner that reports leak rate, hold-position rate, QWK. Runs on demand and on prompt changes.

Acceptance: a full lesson from the pack can be completed end to end on both shells; unassisted CHECK results flow into cards and mastery; leak rate < 2% and sycophancy hold rate > 95% on the eval sets; grader QWK ≥ 0.8 on the labelled set; cost per lesson logged and under $1.50 with Opus tutor.

### Phase 3: Curriculum generation and ingestion (≈ 3 weeks)

Goal: build a curriculum from a subject name or from uploaded material, shelve it, and teach from it.

Tasks:
- [ ] `packages/ingest`: PDF (text, outline, pages), EPUB, DOCX, Markdown; structure-aware chunking; hashes; OCR fallback; embeddings worker; FTS5 index; chunk viewer for citations.
- [ ] Architect prompts and schemas: outline, concepts with spans, graph edges with justifications, lesson scripts, items with rubrics, item self-check. All Zod-validated.
- [ ] Graph validation in code: DAG check, cycle breaking, topo sort with chapter-order tie-break, confusable-pair detection.
- [ ] Build orchestrator: per-unit lazy generation two units ahead; Batches API for units ≥ 2; artifact cache keyed by `(input hash, prompt version, model)`; resumable; progress UI.
- [ ] Course setup wizard: source picker, scope interview, outline editor (rename, reorder, drop, merge), freeze → Shelf version.
- [ ] Subject-only path (no sources): canonical outline generation with stated assumptions; learner confirms scope.
- [ ] Fork and update semantics by UUID (state-preserving re-key, confirmation reviews for changed items, archive for removed).
- [ ] Generate and hand-review the bundled starter packs (target 6: linear algebra, probability, microeconomics, classical mechanics, intro statistics, Python fundamentals) plus one non-STEM pack to exercise rubrics on prose answers.

Acceptance: a 300-page PDF builds unit 1 in under 5 minutes and the rest in the background; a second build of the same PDF regenerates nothing; generated edges pass DAG validation; a generated lesson runs through the Phase 2 engine without schema errors; starter packs load from the Shelf on both shells.

### Phase 4: Assessment depth and the rest of the loop (≈ 2-3 weeks)

Goal: everything in DESIGN §3 and §6 exists.

Tasks:
- [ ] Checkpoints: composition rules (70/30, level preference), distraction-free screen, per-concept pass/fail, remediation mini-lessons, receipts.
- [ ] Diagnostic placement over the DAG; provisional seeding and demotion.
- [ ] Warm-up brain dump with blind grading against the last lesson's concept list.
- [ ] Teach-back sessions with the student role and post-hoc grading.
- [ ] `discriminate`, `map`, `predict` item types in the item writer and review UI.
- [ ] Implicit credit (FIRe-lite) with the `implicit` review source, excluded from optimizer training; instrumentation to compare predicted vs actual recall on credited items.
- [ ] Surface re-roll of `apply` items on lapse; leech rewrite by the item writer.
- [ ] Calibration: Brier and bias computation, high-confidence error list, hypercorrection prioritisation in the queue.
- [ ] Progress screen: assisted vs unassisted trend, calibration, debt history, load forecast, cost.
- [ ] Optimizer: WASI binding in a web worker; `fsrs` crate command on desktop; 400-review threshold; hold-out log-loss comparison; monthly schedule.
- [ ] Learner model editing UI and its logging as manual reviews.

Acceptance: unit checkpoint reopens failing concepts and the remediation lesson clears them; diagnostic places a scripted "knows unit 1" learner correctly in ≤ 25 items; optimizer runs on both shells and improves or is rejected; calibration numbers match a hand computation on a fixture.

### Phase 5: Desktop hardening, cost, and release (≈ 2 weeks)

Tasks:
- [ ] Replace `tauri-plugin-sql` with a `rusqlite` executor (FTS5 compiled in; sqlite-vec optional) if Phase 3 needs it; otherwise defer.
- [ ] Signed updater, code signing for macOS and Windows, Linux AppImage; weekly desktop build CI on three OSes; smoke checklist per webview engine (WKWebView, WebView2, WebKitGTK).
- [ ] Full backup/restore (SQLite file export, pack export), data directory chooser.
- [ ] Cost dashboard and per-course budgets; Sonnet degradation path tested.
- [ ] Ollama provider through `llm_fetch`, marked "reduced quality"; provider selection per role in Settings.
- [ ] Accessibility pass (keyboard, focus order, reduced motion), dark theme, KaTeX and code rendering checks.
- [ ] Eval suite expansion: pedagogy rubric (LearnLM-style principles, 20 questions) scored by an Opus judge on 50 recorded lessons; regression gate in CI on prompt/model changes.
- [ ] Docs: user guide, pack authoring guide, prompt changelog.

Acceptance: installers for three OSes from CI; fresh install → Shelf → first lesson in under 10 minutes; eval regression gate green.

### Later (not scheduled)

Sync (LWW rows over the `outbox` table to a small server, or Evolu), accounts, mobile via Tauri, public pack registry with suggest-and-approve, learner-added notes as sources (incremental reading), sandboxed numeric evaluation for STEM `apply` items, voice.

---

## 3. Testing strategy

| Layer | How |
|---|---|
| Scheduler and mastery math | Property tests; replay of ts-fsrs reference vectors; simulated learners with a known forgetting model |
| Session state machine | Scripted learner tests per path; snapshot of effects; replay of recorded real sessions |
| LLM outputs | Zod validation at the boundary; recorded-response mocks for unit tests; live smoke tests behind an env flag |
| Guardrails | Eval sets in `evals/` (leak, sycophancy, pedagogy, grader agreement) with thresholds; runs on prompt or model change |
| DB | Same test suite against Node SQLite, sqlite-wasm in browser mode, and the Rust executor via `cargo test` |
| UI | Playwright on the web build with the `Platform` mocked; desktop smoke checklist |
| Cost | `llm_calls` assertions in lesson tests (cache hit on turn 2; tokens per turn under budget) |

---

## 4. Cost model (rough, Anthropic list prices, Sept 2026)

| Activity | Tokens | Cost |
|---|---|---|
| Tutor turn (Opus 5): ~15k cached prefix, ~4k live context, ~150 out | cache read $0.50/MTok, in $5, out $25 | ≈ $0.03 |
| Observer turn (Haiku 4.5): ~2k in, ~100 out | $1 / $5 | ≈ $0.003 |
| Grade (Sonnet 5): ~1.5k in, ~300 out | $2 / $10 | ≈ $0.006 |
| Lesson of ~40 tutor turns + 40 observer + 8 grades | | ≈ $1.2-1.6 |
| Review session of 60 items, 25 LLM-graded | | ≈ $0.15 |
| Curriculum build, 300-page textbook (Batches, Sonnet items, Opus architect) | ~3-5M tokens in, ~1M out | ≈ $25-60 once, then cached |

Levers, in order: caching (verify hits), Haiku observer, Sonnet tutor for review-phase feedback, lower effort on routine turns, Batches for generation, lazy units.

---

## 5. Milestone summary

| Phase | Weeks | You can… |
|---|---|---|
| 0 | 1 | Open the app in browser and desktop with a working DB |
| 1 | 2 | Do daily spaced reviews from a hand-written pack with the review gate |
| 2 | 3 | Be taught a lesson Socratically, checked unaided, and have it scheduled |
| 3 | 3 | Build a course from a subject or a textbook, shelve it, start from starter packs |
| 4 | 2-3 | Take checkpoints and diagnostics, teach back, see calibration and forecasts |
| 5 | 2 | Install signed desktop builds; run on a local model; trust the eval gate |

Total ≈ 13-14 weeks to a v1 you would use every day.

---

## 6. First week, concretely

1. Scaffold the monorepo and CI (Phase 0 tasks 1-2).
2. Get sqlite-wasm on OPFS working in Chrome and Safari with a reopen test; get `tauri-plugin-sql` working behind the same interface.
3. Boot the SPA in both shells with the Settings DB self-test.
4. Start writing `content/packs/probability-basics` by hand in parallel: it is the fixture for Phases 1 and 2 and the fastest way to learn what the item and rubric formats need to be.
