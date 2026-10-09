# Epistemics for iPad

The Epistemics course loop (structured courses, Socratic lessons, spaced reviews, unaided checks), on an
iPad, with every answer written by hand with Apple Pencil.

- [docs/DESIGN.md](docs/DESIGN.md): what the app is, how it reads ink, each session, the item types on
  paper, architecture and plan.
- [docs/RESEARCH.md](docs/RESEARCH.md): the evidence on handwriting, drawing and reading ink, including
  where it does *not* support the idea.
- [docs/AUDIT.md](docs/AUDIT.md): the design measured against Khan Academy, Khanmigo, ALEKS, Math Academy and
  the evidence, with ranked improvements.
- Screen mockups: the [Epistemics for iPad design canvas](https://claude.ai/artifact/UeuzHVusewReCeCm1p6RZK).

The web and desktop app lives in [`../web`](../web). The two share the course pack format
(`web/content/packs`, copied into the app at build time), the prompts (`web/content/prompts`) and the
pedagogy in [`web/docs/DESIGN.md`](../web/docs/DESIGN.md), but no code.

## Status

Built and running in the iPad simulator (iPadOS 27). What works:

- **First run**: pick a pack (or open an exported `.epistemics.json`), choose who marks the answers, take
  a handwritten adaptive placement test that skips the lessons you already know (DESIGN §6.1), choose
  minutes a day.
- **Today, lessons, reviews, warm-up, checkpoint paper, map from memory, teach-back**, the notebook,
  course map, progress, shelf and settings: every screen in DESIGN §6.
- **Ink**: PencilKit, Pencil only (a finger scrolls), paper chosen by item type, pages that grow, tool tray
  and hand-in on the free-hand side, left-handed layout.
- **Reading ink** (DESIGN §5): PencilKit's on-device `PKStrokeRecognizer` draft, then the Claude Reader,
  which is never given the answer key; speculative reads while the Pencil rests; confirmation when it
  matters; blind grading of the confirmed text; blue marks placed on the learner's own strokes.
- **Scheduling and pedagogy**: a line-for-line Swift port of `web/packages/core` (FSRS-6, the review gate,
  mastery, the lesson state machine, checkpoints, teach-back), proven against fixtures exported from the
  real TypeScript.

### Layout

```
Epistemics.xcodeproj
Epistemics/          the app (SwiftUI): App, Design, Ink, Reading, Store, Services, Screens
EpistemicsTests/     app tests: storage, maths text, the recogniser, and end-to-end session flows
EpistemicsKit/       Swift package, no UIKit
  EpistemicsCore     port of web/packages/core (API: Sources/EpistemicsCore/API.md)
  EpistemicsLLM      port of web/packages/llm + the Reader role (API: Sources/EpistemicsLLM/API.md)
Tools/export-conformance.mjs   regenerates the parity fixtures from the TypeScript core
```

## Build, run and test

Needs Xcode 27 with the iOS 27 simulator.

```bash
open Epistemics.xcodeproj
```

```bash
cd EpistemicsKit && swift test
```

```bash
xcodebuild -project Epistemics.xcodeproj -scheme Epistemics -destination 'platform=iOS Simulator,name=Epistemics iPad Air 11' test
```

```bash
node ipad/Tools/export-conformance.mjs
```

The last one is run from the repository root, and only when the web core changes.

The tutor defaults to the offline demo. Settings takes a Claude API key (kept in the Keychain) or the URL of a
proxy that holds the key (`web/apps/server`). In the simulator a pointer can draw; on a device only Apple
Pencil does, unless Settings → "Let a finger draw too" is on. Debug builds have Settings → Developer: run the
clock ahead a day, let the demo tutor finish the next lesson, open a unit's checkpoint or map directly.

### Not yet done

- **Never run against the real Claude API from this machine** (no key here). The Anthropic provider is
  covered by request-body and SSE-parsing tests, and every flow is tested end to end with the demo tutor.
- **Only tested in the simulator** with mouse strokes, not with a real Apple Pencil.
- **The hosted tutor** (the Supabase edge function) needs account sign-in, which is not built. Use a key or
  a proxy.
- **No maths recogniser** (Mathpix / MyScript, DESIGN §5.1): handwritten maths is read by the Claude Reader
  from the image.
- **Not built**: sync, building courses on the iPad, the typed-vs-ink experiment (§11),
  and the notebook's "try it first".
