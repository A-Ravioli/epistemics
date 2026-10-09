# Onboarding

*The first five minutes, designed so that the app's argument is made by doing rather than by prose.*

Status: v1, 2026-09-17. Companion documents: [DESIGN.md](DESIGN.md) §3.1 (onboarding a course), §3.2 (a day),
§5.4 (the review gate), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) (the window, the type ramp, the one accent
action), [UX-AUDIT.md](UX-AUDIT.md) (the audit this supersedes for the first-run screens).

---

## 1. What was wrong

The old first run was two unrelated flows bolted together. A new learner met, in this order:

1. `/welcome` — **"Configure your tutor"**: two provider switches and a password field for an Anthropic
   API key.
2. `/today` — a paragraph explaining what the app does, and a button to the Shelf.
3. `/shelf` — four tabs (bundled, built, library, mine) and a wall of pack cards.
4. `/setup` — an eight-field scope interview including *desired retention* and *reviews per day, at most*.
5. `/today` — at last, "Start lesson".

Five screens, three of them forms, before a single question is asked of the learner. The specific faults:

| Fault | Why it matters |
|---|---|
| **The ask comes before the value.** Screen one is a credentials form. | Nobody pastes an API key into an app they have not seen work. The learner either bounces or skips, and skipping silently commits them to a tutor the app itself describes as unable to teach. |
| **The decisions are in the wrong order.** Which model grades you is asked first; what you want to learn is asked third. | The learner arrives with exactly one thing in their head — a subject. Asking anything before that is asking them to park the only thought they came with. |
| **FSRS parameters are asked of someone who has never done a review.** `desiredRetention`, `reviewsPerDay`. | These are tuning knobs for a memory model whose existence has not yet been mentioned. There is no answer a new learner can give that is better than the default, so asking costs attention and returns noise. |
| **The review gate is never mentioned.** | The gate (§5.4) is this app's most distinctive behaviour and its main source of friction: it refuses to teach you anything new until you have cleared what is due. Meeting it for the first time as *"Locked: 14 reviews to go"* reads as a bug or a dark pattern. It has to be a promise the learner accepts, not a wall they discover. |
| **The loop is explained by telling.** `FirstRun` described the three-step loop in a paragraph. | An app whose entire thesis is *being told does not work, retrieving does* taught its own premise by telling. The onboarding contradicted the product in its first sentence. |
| **Onboarding state was one localStorage boolean** (`epistemics:onboarded`). | It does not sync, so a second device re-ran the whole thing; it cannot distinguish "this account has a course" from "this device has a tutor", which are different questions with different answers. |
| **Dead waiting.** The subject path runs interview → outline → build, all blocking, with minutes of `BuildProgressView`. | The one place in the flow with real latency is the one place nothing is asked of the learner. |

## 2. The shape of the fix

**Onboarding is the first retrieval, not a form.** The learner answers a question about what they already
know before the app explains anything, because that is the move the whole product is built on, and one
minute of doing it is worth three screens of describing it.

Four principles, in the order they bind:

1. **Ask for what the learner arrived with, first.** That is a subject. Everything else waits.
2. **Infer rather than ask.** Prior background is inferred from what they write, not self-reported on a
   five-point scale. Scaffolding, review load and the weekly budget are derived (§5). Nothing that can be
   computed from an answer is also asked as a question.
3. **State the contract before it binds.** The review gate is explained, with a number and with its escape
   hatch, on the way in — not at the moment it first blocks a lesson.
4. **Spend the latency on the learner.** The curriculum build overlaps the steps that need no model.

The whole flow is one screen — the focused window with no sidebar and no inspector, as
DESIGN-SYSTEM §6 already grants the first-launch screen — advancing through steps in place.

## 3. The steps

Steps are *derived*, not fixed (§6): a learner who already has a tutor on this device never sees step 3,
and one who only needs a second course never sees it either.

### Step 1 — "What do you want to learn?"

One decision, three ways to make it, as a `ChoiceGroup` whose selected option reveals its own fields:

- **A pack we have written** — the bundled packs, each with what it costs: *"Probability · 2 units, 8
  lessons · ~3.3 h of lessons · 179 review questions"*. One click, no generation, first lesson available
  immediately.
- **A subject I name** — a text field and a level. Generation follows.
- **My own material** — the file picker (PDF, EPUB, DOCX, Markdown), then the subject it teaches.

No account, no key, nothing about models. The learner does the thing they opened the app to do.

### Step 2 — "Before we start: what do you already know about X?"

A free-recall prompt with a minute's worth of space and an explicit permission to write nothing:
*"'Nothing at all' is a real answer, and a useful one."*

This is the pivot of the whole design, and it does four jobs at once:

1. **It is a retrieval.** The learner performs the app's central move before reading a word about it. Free
   recall is also the format with the largest effect size in the literature (Karpicke & Blunt 2011), and it
   is the same mechanic as the daily warm-up brain dump (§3.2), so step 2 is a rehearsal of a thing they
   will do every day.
2. **It produces the `background` string** the old interview asked for as *"Prior background"* — but
   written in the mode of recalling rather than self-assessing, which is both better data and a
   demonstrably harder thing to do than ticking "intermediate".
3. **It lets the app show it was listening.** The reflection is mechanical and instant: the recall text is
   matched against the chosen pack's concept names, and the app answers with what it found —
   *"You already named conditional probability and independence. I will check those early rather than teach
   them from scratch."* No model call: it must work offline, and at this point in the flow no tutor has
   been chosen yet. For a subject-built course there is no concept list yet, so the reflection says what
   the text will be used for instead of pretending to match it.
4. **It earns the placement offer.** When the recall named two of the pack's concepts, or simply ran long
   enough on a subject course, the reflection carries one more question: *"You clearly know some of this
   already. Want to prove it and skip ahead?"* — a five-minute placement quiz against the prerequisite
   graph, or start at the beginning. This is the old interview's unexplained checkbox, moved to the one
   moment where the learner has just given the app a reason to ask and can see why it is asking.

The reflection is where the loop finally gets explained, in two sentences, *after* the learner has done
one — which is the only ordering consistent with the product's own argument.

### Step 3 — "Who is asking the questions?"

Only now, and only on a device that has no tutor yet. Three options, honestly described, with the demo
tutor as an explicit choice rather than the consequence of skipping:

- **Claude** — key in this browser or the OS keychain, or a server proxy. The key never leaves the device.
- **A model on this machine (Ollama)** — free and private, rougher hints and grading.
- **The demo tutor** — deterministic, offline, and *it cannot really teach*: it says the same thing in
  every phase. Picking it says so, and says where to change it.

The stakes are legible here in a way they never were on screen one, because the learner has now written a
paragraph they expect something to read.

### Step 4 — "How much time, and the one rule"

The commitment, and the contract, on the same screen because they are the same subject.

- **Minutes a day** — three buttons: 10 / 20 / 40. This is the only scheduling question asked, and
  everything else is derived from it (§5).
- **A deadline, if there is one** — purpose and exam date, which materially change scheduling (an exam date
  caps intervals so everything falls due before it). Optional, one line.
- **The rule**, stated plainly and with the number the learner just chose:

  > Reviews come first. Each day Epistemics gives back what you are about to forget, and the next lesson
  > stays locked until that is clear — about 20 minutes a day. You can override the gate once a day when
  > life happens; there is no way to switch it off, because switching it off is what makes the other apps
  > not work.

  With *"Why reviews first?"* as a disclosure over the evidence, and the escape hatch stated in the same
  breath as the rule, so the rule reads as a design stance rather than a trap.

For a pack course this step is instant. For a subject or material course, **the outline proposal and unit 1
build run in the background while the learner is on this step** — the latency is spent on a screen that
needs no model.

### Out

The flow ends on the thing it promised, and never on an empty screen:

- **Pack**: enrolled at the last button, and Today opens with "Start lesson" already live.
- **Subject or material**: straight to the outline review, which is a real editorial decision and so stays
  where it belongs, on the Setup screen — but arriving with the outline either already generated or
  generating, and with the interview gone, because it has already been answered. Setup records the
  completion when the course is enrolled.
- **If the placement was accepted** at step 2, the placement quiz instead of Today; it enrols first either
  way, so declining costs nothing and the offer stands on Today afterwards.

## 4. What is no longer asked

Moved out of the first run entirely, to Settings and to Setup's own interview for later courses, where a
learner who has done a week of reviews can answer them meaningfully:

| Was asked at first run | Now |
|---|---|
| Desired retention (0.8–0.95 slider) | Default 0.9. Settings → Scheduling. |
| Reviews per day, at most | Derived from minutes a day (§5). Settings → Scheduling. |
| Target depth (intro / working / deep) | Defaults to *working*. Setup keeps it for later courses. |
| Prior background (textarea) | Inferred from step 2's recall. |
| Weekly time budget (30–600 min slider) | Derived from minutes a day (§5). |
| "Run a placement quiz first" checkbox | Offered in step 2's reflection, only when the recall earned it. |

## 5. Derivations

From one answer, `minutesPerDay ∈ {10, 20, 40}`:

```
weeklyMinutes  = minutesPerDay × 7
reviewsPerDay  = clamp(round(minutesPerDay × 3), 20, 400)      // ~20 s a card, a full session of nothing but reviews
desiredRetention = 0.9                                          // the default; tuned later or never
```

`reviewsPerDay` is a **cap, not a target**: it is the point past which due cards become debt (§5.4). Setting
it to what the learner could clear if they did nothing else that day is the honest reading of the number, and
it is why it is derived from the time budget rather than asked alongside it.

Scaffolding comes from the recall text through the existing `scaffoldingFromBackground`: something written
means `developing`, nothing written means `novice`, and `advanced` is reachable only through Setup's depth
question on a later course.

## 6. State, resumption and second devices

Two facts, with different scopes, which the old single boolean could not tell apart:

| Fact | Scope | Where it lives |
|---|---|---|
| This learner has been through onboarding and has a course | The account | The `settings` table, key `onboarding`, and therefore synced |
| This device has a tutor configured | The device | The LLM settings plus the device's secret store; mirrored to `localStorage` so the boot redirect stays synchronous |

So a second device that pulls a synced course does not re-run the course choice — it asks only step 3, the
one question whose answer genuinely is device-local, because the API key is. And a learner who clears their
browser storage but keeps their data is asked only for the tutor again.

The draft is written after every step, so a reload mid-flow resumes where it stopped rather than starting
over — including across the curriculum build, which is the longest thing in the flow and the most annoying
to lose.

Every step after the first can be skipped, and skipping is recorded rather than lost: Today's quiet ledger
carries the unfinished business as a line (*"Tutor: the demo stand-in — pick a real one"*), so a skip is
deferral rather than a permanent hole.

## 7. What the flow must never do

1. **Never ask for a key before showing the app work.** Step 3 is the earliest a key may be requested, and
   it is still skippable.
2. **Never explain the loop before the learner has performed one.** Step 2 comes before every sentence
   about retrieval, spacing or gates.
3. **Never surface an FSRS parameter.** Retention, stability, difficulty and intervals are the scheduler's
   business; the learner's business is minutes a day.
4. **Never land on an empty Today.** If the flow completes, a course exists and the next action is live.
5. **Never trap.** No storage, no model, no network: every step degrades to skippable, and
   `isOnboarded()` fails open.

## 8. Checking it

```bash
pnpm --filter @epistemics/web test        # onboarding derivations and the recall match
pnpm --filter @epistemics/web e2e         # e2e/welcome.spec.ts drives all four steps, both paths
```

`e2e/welcome.spec.ts` covers: the pack path end to end (four steps → a Today with a live "Start lesson",
never an empty state); the reflection naming back the concepts the recall matched; the placement offer
appearing only when the recall earns it; the tutor step saving a key, with Settings agreeing afterwards; a
deferred tutor surfacing on Today rather than being lost; resumption after a reload mid-flow; the derived
review cap and scaffolding reaching the enrolled course; and the generated path handing over to the outline
with no second interview.
