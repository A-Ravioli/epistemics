# Epistemics

Learning how to learn: structured courses taught Socratically by an LLM, with spaced retrieval enforced
before anything new is taught.

This repository holds two apps that share a pedagogy and a course format but no code:

| Folder | What | Status |
|---|---|---|
| [`web/`](web) | The web app and the Tauri desktop app: a pnpm monorepo (React, TypeScript, Rust shell, Supabase sync). Learners type their answers. | Built and tested. See [web/README.md](web/README.md) |
| [`ipad/`](ipad) | A native iPad app where every answer is handwritten or drawn with Apple Pencil. | Design only. See [ipad/README.md](ipad/README.md) |

Shared between them: the course pack format and bundled packs (`web/content/packs`), the prompts
(`web/content/prompts`), the learning design ([web/docs/DESIGN.md](web/docs/DESIGN.md)) and its evidence
base ([web/docs/research](web/docs/research)).

```bash
cd web && pnpm install && pnpm dev     # the web app on http://localhost:5173
```
