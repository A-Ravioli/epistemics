# Epistemics for iPad

The Epistemics course loop (structured courses, Socratic lessons, spaced reviews, unaided checks), on an
iPad, with every answer written by hand with Apple Pencil.

**Status: design only.** Nothing is built yet.

- [docs/DESIGN.md](docs/DESIGN.md): what the app is, how it reads ink, each session, the item types on
  paper, architecture and plan.
- [docs/RESEARCH.md](docs/RESEARCH.md): the evidence on handwriting, drawing and reading ink, including
  where it does *not* support the idea.
- Screen mockups: the [Epistemics for iPad design canvas](https://claude.ai/artifact/UeuzHVusewReCeCm1p6RZK) (first run, Today, a lesson page, a review, a
  marked receipt, map from memory, the checkpoint paper).

The web and desktop app lives in [`../web`](../web). The two share the course pack format
(`web/content/packs`), the prompts (`web/content/prompts`) and the pedagogy in
[`web/docs/DESIGN.md`](../web/docs/DESIGN.md), but no code.

Planned stack: SwiftUI + PencilKit, iPadOS 27 or later (Xcode 27), SQLite via GRDB with the web's schema,
Claude through the existing Supabase edge function.
