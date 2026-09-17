# Epistemics

Learning how to learn.

Epistemics is a local-first web and desktop app (one React build, browser + Tauri 2) that teaches a subject Socratically with an LLM, structures it into a dependency-ordered curriculum, checks you without help at every step, and enforces spaced review before it lets you learn anything new.

## Principles in one breath

Retrieve before you are taught and again after; space every review on a memory model (FSRS-6); a concept counts as learned only after three successful spaced retrievals without help; the tutor asks, hints, and withholds answers by rule in code, not by prompt wording; curricula are generated once, versioned, and shelved for reuse.

## Status

Implemented and tested (320 unit tests, 13 Playwright flows, Rust crate compiles in CI):

- **Core** (`packages/core`): FSRS-6 scheduler wrapper, review queue with the review-debt gate and recovery mode, sibling burying, concept mastery with successive relearning, prerequisite gating, fractional implicit credit, load simulator, calibration; the lesson state machine (PRIME → PROBE → DEVELOP → CONSOLIDATE → EXTEND → CHECK → WRAP) with an enforced hint ladder, checkpoint composer, adaptive diagnostic, teach-back, learner model.
- **LLM** (`packages/llm`): Anthropic provider on the official SDK (streaming, structured outputs, prompt caching, effort), Ollama provider, deterministic mock provider; tutor, observer, blind grader with consensus deferral, teach-back student, answer-leak detector, warm-up grader; versioned prompt files; usage ledger and budget guard.
- **Data** (`packages/db`, `packages/platform`): Drizzle schema, migrations, repositories; executors for Node (`node:sqlite`), the browser (sqlite-wasm on OPFS in a worker, single-owner lock), and Tauri; web and Tauri platform adapters (keychain secrets, streaming `llm_fetch` transport).
- **Ingest and Architect** (`packages/ingest`, `packages/architect`): PDF, EPUB, DOCX and Markdown parsing, structure-aware chunking, embeddings; the curriculum-generation pipeline (outline → concepts → prerequisite/encompassing graph → lesson scripts → items → item self-check) with content-hash caching, DAG validation, and lazy per-unit building.
- **Content** (`content/`): a hand-authored probability pack (2 units, 8 lessons, 29 concepts, 179 items, all numeric references machine-checked) and the prompt files.
- **Web app** (`apps/web`): Today, Review, Lesson, Checkpoint, Diagnostic, Teach-back, Course map, Shelf, Setup, Progress, Settings.
- **Desktop** (`apps/desktop`): Tauri 2 shell with OS-keychain secrets and a Rust `llm_fetch` command so the API key never enters the webview.
- **Server** (`apps/server`): Hono passthrough proxy for the browser build with a per-day USD budget.
- **Sync** (`packages/sync`, `supabase/`): optional cross-device sync through Supabase. Sign in on the Account screen and every review, lesson, course and generated curriculum syncs between the web app and the desktop app with last-writer-wins per row; the app keeps working offline. A Supabase edge function can hold the Anthropic key and enforce a per-user daily budget. Setup in [supabase/README.md](supabase/README.md); protocol in [docs/SYNC.md](docs/SYNC.md).

See [docs/UX-AUDIT.md](docs/UX-AUDIT.md) for the screen-by-screen UX audit, [docs/DESIGN.md](docs/DESIGN.md) for the design, [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) for the visual system (tokens, components and the rules that hold them together), [docs/PLAN.md](docs/PLAN.md) for the phased plan, and [docs/research/](docs/research/) for the evidence base.

## Run it

Prerequisites: Node 22+, pnpm 10.

```bash
pnpm install
pnpm dev                     # web app on http://localhost:5173
```

Open Settings and choose an LLM mode:

- **Demo (mock)**: default, no key; a deterministic stand-in tutor so every flow works offline.
- **Anthropic, bring your own key**: the key is stored in the browser (IndexedDB) and sent directly to the API from the page.
- **Anthropic via proxy**: run `ANTHROPIC_API_KEY=... pnpm --filter @epistemics/server dev` and the app talks to `/api/anthropic` with a daily budget.
- **Ollama**: a local model at `http://localhost:11434` (reduced quality).

Then Shelf → enrol in the probability pack (or Setup → build a course from a subject or your own files) → Today.

To sync between devices: create a Supabase project, apply `supabase/migrations`, and enter the project URL and anon key on the Account screen (or set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`). See [supabase/README.md](supabase/README.md).

Desktop:

```bash
pnpm tauri dev               # needs Rust and the Tauri system libraries, see apps/desktop/README.md
```

Checks:

```bash
pnpm -r --if-present typecheck
pnpm -r --if-present test
pnpm --filter @epistemics/web build
pnpm --filter @epistemics/web e2e   # Playwright, Chromium
```

## Layout

```
apps/web        React SPA (the single frontend build; Tauri loads its dist/)
apps/desktop    Tauri 2 shell (Rust commands: secrets, llm_fetch)
apps/server     Hono proxy with budget
packages/core   domain types, scheduler, session engine (pure TypeScript)
packages/db     Drizzle schema, executors, repositories
packages/platform  web / Tauri adapters behind one interface
packages/llm    providers, roles, prompts, usage
packages/ingest document parsing, chunking, embeddings
packages/architect  curriculum generation pipeline
packages/ui     shared components
packages/sync   Supabase push/pull engine
supabase/       Postgres schema with RLS, edge-function LLM proxy
content/        starter packs and prompt files
docs/           design, plan, research
```
