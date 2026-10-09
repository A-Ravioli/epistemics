# UX audit: the web app as a first-time learner

Date: 2026-09-17. Scope: `apps/web` in demo (mock tutor) mode, walked with Playwright as a first-time learner at 1280, 768 and 390 px wide, light and dark, mouse and keyboard-only. Screenshots before and after live in `apps/web/.ux-audit/` (gitignored; `after/` holds the post-fix pass).

Yardstick: [DESIGN.md](DESIGN.md) §3 (the learner loop) and §10 (UX surface): the tutor is the only path (no free chat); confidence before reveal; the review gate visible and explained; unaided checks obvious; no reference leakage in the lesson view; one clear next action on Today.

Severity: **blocker** (a learner cannot proceed or is misled), **major** (a learner is likely to stall, misunderstand or give up), **minor** (polish, consistency).

## Summary

Top issues fixed:

1. **Enrolling a second course did not make it active** (blocker). `refreshCourses` preferred the in-memory course over the id `enrolInCurriculum` had just stored, so after enrolling, Today, the sidebar and the lesson all belonged to the *previous* course. Fixed in `app-state.tsx` (stored id wins).
2. **No usable mobile layout** (blocker at 390 px). The 208 px sidebar left 182 px for content; header buttons, tabs and the primary "Start lesson" button were pushed off-screen. The sidebar now collapses into a sticky top bar with a menu below `md` (768 px); every card stacks; nothing overflows (covered by an e2e test).
3. **No first-run experience** (major). Opening the app landed on the Shelf with a banner and no explanation. Today now shows a two-sentence explanation, one primary button (Shelf) and the three-step loop; protected screens without a course fall back to it.
4. **Today had no single next action** (major). Every card had a primary button. Today now opens with a "Next up" card holding the only primary button (resume → reviews → lesson → repair → checkpoint → teach-back, in DESIGN §3.2 order); the other cards use secondary buttons or a "Next up" pill.
5. **Lesson phases were jargon** (major). `PRIME → PROBE → DEVELOP …` in caps with cryptic hint pips and a bare "developing" tag. Now plain words ("Try it first", "What do you already know?", "Work it out", "Say it in your own words", "Stretch", "Check, no help"), a one-line description of the current phase, "Hint 1 of 3 · next hint after your next attempt", a labelled scaffolding pill, per-phase placeholders, a dismissible "How a lesson works" explainer and a once-only "Why say how sure you are?" explainer.
6. **Review gate unexplained** (major). "Locked: 3 reviews to go" with no why. Added a "Why reviews first?" disclosure on the locked lesson card, a "Reviews come first" line on the Next-up card, and a plain caption under the debt meter ("cards due beyond today's cap of N; older than 3 days switches on recovery mode").
7. **Keyboard focus lost on Review and Checkpoint** (major for keyboard users). After "Continue" the focus fell to `body`; now it moves to the confidence group, then to the result heading, and every step has a visible key hint (`Space`, `1–3`, `1–4`, `Ctrl+Enter`).
8. **Contrast failures** (major, WCAG AA). `text-ink/50` (3.3:1), `placeholder:text-ink/40` (2.5:1) and `text-ink/60` on mist (4.3:1) failed 4.5:1. Added a `--color-muted` token (≥ 5.9:1 on paper and mist in both themes) and replaced every ink/40–60 use. Pills got dark-mode variants; amber/emerald status text uses the 800/200 shades.
9. **Async states** (major). Screens showed a bare spinner or a dead-end red banner. Every screen now has a skeleton while loading and an `ErrorBanner` with a retry action on failure (Today, Review, Lesson, Checkpoint, Teach-back, Map, Progress, Shelf, Setup), plus a route-level `ErrorBoundary` so one crashing card cannot blank the app.
10. **Disabled buttons without reasons** (minor→major in CHECK). Send was disabled in PRIME/CHECK until a confidence was picked, with only a 10 px hint. The blocker is now stated next to the button ("Pick how sure you are to send"), also on Checkpoint, Diagnostic, Warm-up and the wrap-up summary.

Deferred (not fixed here):

- A "request a hint" button. DESIGN §3.3 advances the hint ladder only after an observed attempt, so the UI now says exactly that instead of adding an action the state machine would ignore.
- The mock tutor repeats one sentence in every phase; real models do not. Not a UI defect.
- Map: the graph is an SVG that scrolls inside its frame on phones; a zoomed/vertical layout for small screens is a larger piece of work.
- Progress: the bar charts are `div`s with `title` tooltips; a proper chart with axes and keyboard access is deferred.
- Streaming tutor text is announced through an `aria-live="polite"` log; screen readers will re-announce updates as they stream. Chunked announcement (sentence by sentence) is deferred.
- The Review screen's grader "Dispute" runs three samples; there is no way to see the earlier receipt afterwards except on the Map. Deferred.
- Colour-only mastery coding on the Map has a legend and per-node percentages but no pattern fill.

## Screen by screen

### First launch (no course)

*Superseded.* The fixes below were the right ones for the flow as it then stood, but the first run has since
been redesigned end to end — see [ONBOARDING.md](ONBOARDING.md), which supersedes this section and the
first-launch half of the Setup one. What remains true: Today is the home, and a protected screen without a
course falls back to it.

*Before:* `/today` redirected to the Shelf with a banner "Enrol in a course to get started"; sidebar said "No course yet"; four tabs; nothing said what the app does. At 390 px the header buttons and tabs overflowed by ~150 px.

| Friction | Severity | Fix |
|---|---|---|
| No explanation of how the app works | major | `FirstRun` on Today: two sentences, one primary button "Pick a course on the Shelf", a text link to build, and a 1-2-3 loop card |
| Redirect made the Shelf the home; the "Today" nav item did nothing recognisable | major | Today is the home; `RequireCourse` sends other screens to Today's first-run state |
| Shelf banner lost its "no course" state when arriving from the nav | minor | Banner keyed on `courses.length === 0`, and now explains Enrol / Build / Import in one line |
| Horizontal overflow at 390 px | blocker | Responsive shell, wrapping header actions and tabs |

### Shelf

*Before:* Tabs "Bundled / Built by you / Imported & bundled library / My courses"; pack cards with counts only; cards with three buttons in a row; no idea what "Enrol" vs "Build" vs "Import" means.

| Friction | Severity | Fix |
|---|---|---|
| Enrol / build / import undifferentiated | major | Page description, no-course banner explaining the three verbs, button tooltips, per-tab one-line captions |
| No time estimate on packs | minor | "~3.3 h of lessons · 179 review questions" (25 min per lesson) on pack and built cards |
| Cards overflow at 390 px | blocker | Cards stack (`flex-col sm:flex-row`); actions wrap |
| Enrolling did not switch the active course | blocker | `refreshCourses` fix; "My courses" tab explains "Make active" |
| Import errors swallowed (no `catch`) | major | `try/catch` → error banner |
| Loading was a bare spinner | minor | Skeleton cards |

### Setup (interview, outline, build)

*Before:* Fine at desktop; no way back to the Shelf except the nav; fields without hints ("Reviews per day cap", "Target depth"); tabs overflowed at 390 px; build errors in a cramped row.

| Friction | Severity | Fix |
|---|---|---|
| No breadcrumb | minor | `← Shelf` back link and a Stepper (Source → Your goals → Outline → Build; Pack → Your goals for shelf packs) |
| Unexplained fields | major | Hints on purpose, weekly budget, depth, reviews cap, level; diagnostic checkbox now says what it does ("skips lessons on concepts you already know") |
| Errors without retry | major | `ErrorBanner` with retry on interview, outline and build; pack-not-found offers "Back to the Shelf" |
| Button rows overflow | minor | `flex-wrap` |

### Diagnostic

| Friction | Severity | Fix |
|---|---|---|
| "probe 1 · depth 6 of 12" jargon; description mentions "frontier is bracketed" | major | "Placement: what do you already know?", "Question 1 · level 6 of 12", plain description, "I don't know is a fine answer" |
| Disabled Submit with no reason | minor | "Pick a confidence to submit." |
| Focus not on the answer box | minor | Autofocus per question |
| Result copy "seeded as provisionally known; they enter the review stream and must survive it" | minor | "marked as provisionally known. They skip their lessons but still enter the review stream, so they must survive it" |

### Today

*Before:* Review card, lesson card, remediation, checkpoint, teach-back, three stats: every card with a primary button; debt meter "0 / 1" with no caption; lock reason without a why; "No lesson available" empty state; date without a course name; at 390 px the "Start lesson" button was off-screen.

| Friction | Severity | Fix |
|---|---|---|
| No single next action | major | "Next up" card with the only primary button; ordered per DESIGN §3.2; a "done" state when nothing is due |
| Gate not explained | major | "Why reviews first?" disclosure (memory schedule, override once a day, no off switch); lock reason kept (`lock-reason`) |
| Debt meter opaque ("0 / 1") | major | Max is the course's daily cap; caption explains debt and recovery mode; "Done today" captioned |
| Stats without captions | minor | "days in a row with every review cleared", "of 8 in this course", "questions in your review rotation" |
| Override button unlabelled consequence | minor | Kept, with error banner on failure; explainer mentions logging |
| Checkpoint "Not yet" with a bare reason | minor | "Not yet: N concepts still need a second spaced retrieval. It opens once every concept …" |
| Loading spinner, dead-end error | major | Skeleton + `ErrorBanner` with retry |
| Overflow at 390 px | blocker | Stacked cards, full-width primary button on phones |

### Lesson

*Before:* Title, `PRIME → PROBE → DEVELOP → CONSOLIDATE → EXTEND → CHECK` pills, three unlabelled hint pips, "developing" tag, one-line phase help in 12 px grey; chat log; confidence buttons with "Confidence before you find out:"; textarea placeholder "Your answer (Ctrl/Cmd+Enter to send)"; disabled Send with an 11 px "Confidence is required."; side panel (hidden below `lg`) with Bloom pills stretched into ovals; no back link.

| Friction | Severity | Fix |
|---|---|---|
| Phase jargon | major | Plain-word labels + description; phase codes kept in `data-phase` and tooltips |
| Hint level unreadable | major | "Hint 1 of 3 · next hint after your next attempt" / "last hint given" / "No hints in this phase" |
| Scaffolding tag unexplained | minor | "Problem first, early hints" etc. with tooltip |
| No "how a lesson works" | major | Dismissible `Explainer` (localStorage) the first time a lesson opens |
| Confidence never explained | major | Once-only explainer under the confidence buttons (shared key with Review) |
| Placeholder same in every phase | minor | Per-phase placeholders; disabled placeholder states the reason ("The tutor is writing…", "Grading blind…") |
| Disabled Send without reason | major | Inline blocker text and tooltip |
| Streaming not obvious | minor | "writing…" indicator inside the bubble; chat log is an `aria-live` log |
| Side panel lost below 1024 px | major | "About this concept" disclosure above the chat on small screens |
| Bloom pills stretched | minor | `Pill` is `self-start shrink-0` |
| No breadcrumb | minor | `← Today` link; done screen has one too |
| Tutor error banner had a Retry but no title | minor | `ErrorBanner` "The tutor call failed" |
| Wrap-up JOL copy "judgment of learning" | minor | "How well will it stick?" with a plain explanation; summary length reason shown |
| Reference leakage | — | Verified none: the side panel shows definition, objectives, examples and source spans only; item and script references never render |

### Review

*Before:* "1 of 1", pills `learning` / `explain`, a tiny "Stop" link; "Continue to confidence" → "How confident are you?" → "Show answer" / "Grade my answer" → rating buttons with "1m/6m/2d/4d" previews; receipt "score 0.90 · grader confidence 0.90"; keys line at the bottom; focus fell to `body` after Continue.

| Friction | Severity | Fix |
|---|---|---|
| Flow not readable at a glance | major | Stepper "1 Answer → 2 Confidence → 3 Reveal & rate / Blind grade" |
| Focus lost for keyboard users | major | Focus moves to the confidence group, then to the result heading; `Ctrl+Enter` continues from the textarea |
| Key hints hidden | minor | `Kbd` badges on Show answer / Grade / Accept and in the footer |
| Previews terse | minor | "next in 2 d"; rating buttons carry an `aria-label` with meaning and interval, and a sub-label ("Right, with effort") when no preview |
| Receipt jargon | major | "2 of 2 criteria met · score 90% · grader confidence high", "from your answer: …", "Pattern noticed: …", "confident miss" pill |
| Dispute button unexplained | minor | Tooltip: two more grades, majority decides, logged |
| Item type as a slug | minor | "Fill the gap", "Tell apart", "Map from memory" … |
| Grading error left the learner stuck | major | `ErrorBanner` with "Try again" re-grades; rating save errors surface |
| Finished state | minor | Says why the gate is open; back link |
| Loading / load error | major | Skeleton; `ErrorBanner` with retry that re-creates the session |
| Confidence before reveal | — | Unchanged and verified: the reference never renders before a confidence is chosen |

### Checkpoint

| Friction | Severity | Fix |
|---|---|---|
| Header "Checkpoint: unit · 1 of 2" only | minor | Eyebrow "Checkpoint · no tutor, no hints", "Question 1 of 2" |
| Disabled Submit without reason | major | Blocker text; "Finish early" tooltip warns unanswered = misses |
| Focus on `body` | minor | Autofocus on each question |
| Result: "threshold 80%" and "remediation queued" | minor | Plain sentence about what passing and missing mean |
| Compose error dead-end | major | `ErrorBanner` with retry and a back link |

### Teach-back

| Friction | Severity | Fix |
|---|---|---|
| "turn 1 of 6" and role of the learner unclear | minor | "You are the teacher…", "Turn 1 of 6", student bubbles labelled "Student" |
| Three buttons (Stop and grade / Send as final / Send) unexplained | minor | Tooltips; `Ctrl+Enter` hint |
| No back link, spinner-only loading | minor | `← Today`, skeleton, error with retry |

### Course map

| Friction | Severity | Fix |
|---|---|---|
| Legend overflowed at 390 px | major | Wrapping legend with thresholds ("developing (60-85%)") and an arrow key |
| Nodes not keyboard-reachable | major | `tabIndex`, Enter/Space select, `aria-pressed`; scroll frame focusable |
| Detail pills cryptic ("2 successful sessions", "R 0.83") | minor | "2 of 3 spaced recalls", "83% likely recalled", tooltips explaining mastery |
| "Click a concept" prompt ignored keyboard | minor | Mentions Tab + Enter |

### Progress

| Friction | Severity | Fix |
|---|---|---|
| Numbers without captions ("Unassisted pass · what counts", "Brier 0.029 (0 perfect, 0.25 chance)") | major | Plain captions on every tile and section; calibration in a sentence ("you tend to know more than you think") |
| Trend grid overflowed at 390 px | major | Single column below `sm` |
| Meter printed "100 % / 100" | minor | `showMax={false}` |
| Cost table overflowed | minor | Scroll container |

### Settings

| Friction | Severity | Fix |
|---|---|---|
| Groups: "Tutor model / Course / Appearance / Data" | minor | "Tutor / Scheduling / Appearance / Data" with a one-line description each; role models behind a disclosure with what each role does |
| Fields without explanation (retention, caps, transport) | major | Hints on every field |
| Theme buttons overflowed at 390 px | minor | `flex-wrap`, capitalised, `aria-pressed` |
| Errors swallowed in export/import/forget key | major | `try/catch` → error banner; success flash |

### Shell, theme, accessibility

| Friction | Severity | Fix |
|---|---|---|
| Sidebar only; no mobile nav | blocker | `AppNav`: sidebar from `md`, sticky top bar + menu below; the mock-tutor notice becomes a "Demo" pill |
| No skip link, no `main` landmark focus | minor | "Skip to content" link, `main#main` |
| Focus rings only on buttons | major | `:focus-visible` outline in `@layer base` for links, tabs, SVG nodes; utilities still override |
| Reduced motion ignored | minor | `prefers-reduced-motion` kills animations and transitions |
| Icon buttons (↑ ↓ ✕, Disclosure +/−) | — | Already had `aria-label`s; `IconButton` primitive added for future use; decorative glyphs are `aria-hidden` |
| Contrast | major | `--color-muted` (light 6.3:1 on paper, 5.9:1 on mist; dark 7.8:1 / 7.1:1); status text at 800/200 shades; pills with dark variants |
| Render error blanked the app | major | `ErrorBoundary` per route with "Try again" / "Reload" |

## Verification

- `pnpm --filter @epistemics/web typecheck`, `test` (12), `build`: green.
- `pnpm --filter @epistemics/web e2e`: the original seven flows plus `first-run.spec.ts` (first-run state leads to the Shelf; Today has no horizontal overflow at 390 px and the top-bar menu navigates).
- Screenshot walk (scratch Playwright spec, not committed): first launch, Shelf → enrol → Setup → Today, subject build, a full lesson, a review session, checkpoint, map, progress, settings, teach-back, diagnostic, at 390/768/1280 and in dark mode; keyboard tab order on lesson and review.
