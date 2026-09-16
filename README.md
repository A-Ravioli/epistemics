# epistemics

Learning how to learn.

Epistemics is a local-first web and desktop app (one codebase, browser + Tauri 2) that teaches a subject Socratically with an LLM, structures it into a dependency-ordered curriculum, assesses you without help at every step, and enforces spaced review before it lets you learn anything new.

## Status

Design phase. No application code yet.

## Documents

- [docs/DESIGN.md](docs/DESIGN.md): product and system design (learner loop, lesson state machine, scheduling, assessment, curriculum generation, the Shelf, architecture, data model).
- [docs/PLAN.md](docs/PLAN.md): implementation plan in six phases with acceptance criteria, testing strategy, and a cost model.
- [docs/research/](docs/research/): the evidence base.
  - [01-learning-science.md](docs/research/01-learning-science.md): what works empirically (retrieval, spacing, interleaving, feedback, metacognition, tutoring, LLM-tutor RCTs).
  - [02-spaced-repetition.md](docs/research/02-spaced-repetition.md): FSRS and alternatives, library APIs, schema, review-debt gating.
  - [03-landscape-and-llm-tutoring.md](docs/research/03-landscape-and-llm-tutoring.md): existing tools and Socratic tutoring patterns, failure modes, grading, reuse.
  - [04-tech-stack.md](docs/research/04-tech-stack.md): Tauri 2, shared SQLite layer, LLM transport, ingestion, monorepo.

## Principles in one breath

Retrieve before you are taught and again after; space every review on a memory model; a concept counts as learned only after three successful spaced retrievals without help; the tutor asks, hints, and withholds answers by rule, not by prompt wording; curricula are generated once, versioned, and shelved for reuse.
