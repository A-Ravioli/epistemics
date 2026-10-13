# Epistemics for iPad: design document

*The same structured, Socratic, spaced-retrieval course as the web app, but on an iPad, where every answer
the learner gives is written by hand with Apple Pencil.*

Status: v0.1, 2026-10-09. Built: see the [README](../README.md) for what runs and what is not done yet. Where the build differs from this document, the difference is noted in §13.

This document only covers what is different. The pedagogy, the vocabulary (curriculum, unit, lesson,
concept, item, course), the lesson state machine, the review gate, mastery and the blind grader are all
specified in [`web/docs/DESIGN.md`](../../web/docs/DESIGN.md). Treat that as the parent document: when this
one says nothing about something, the web design applies unchanged.

Companions: [RESEARCH.md](RESEARCH.md) is the evidence on handwriting, drawing and reading ink, and the
mockups are on the design canvas (see the [README](../README.md)).

---

## 1. What it is, and what it is not claiming

**One sentence.** You open a course on the iPad, and every answer you give is ink: free recall on a blank
page, problems worked out on squared paper, a tree diagram drawn to explain a rule, a concept map drawn
from memory, a checkpoint answered on a paper. The tutor reads what you wrote, marks it in blue, and
schedules it.

**The thesis, stated carefully.** We started from the idea that writing by hand makes learning stick. The
evidence ([RESEARCH.md](RESEARCH.md) §1) supports a narrower claim:

- Nobody has tested whether *answering retrieval questions* by hand beats typing them. The well-known
  laptop study (Mueller & Oppenheimer 2014) is about lecture notes, and its direct replications came back
  small or null (Morehead et al. 2019; Urry et al. 2021). The best meta-analysis gives longhand note-taking
  a small edge (g ≈ 0.25).
- What does have strong evidence is **retrieval** itself (the engine the web app is already built on),
  **drawing** what you are trying to remember (the drawing effect), **maps drawn from memory** (as good as
  written free recall), and, for mathematics, **writing notation by hand**, which is about three times
  faster than an equation editor.

So the iPad app is not "the web app, but handwritten, because handwriting is magic". It is the web app's
loop, plus the activities that only ink makes practical: drawing, diagrams, worked mathematics, maps from
memory, and feedback that points at your own work. Handwriting is the interface that opens those
activities up, not the active ingredient. The app never says otherwise. §11 describes how we test the
stronger claim ourselves.

**What stays exactly as on the web.** Retrieval before and after instruction; FSRS-6 spacing; three
spaced, unaided successes before a concept counts as mastered; a hint ladder enforced in code; blind
grading with receipts; reviews before new lessons; one gate override a day.

**What is new.**

| | Web | iPad |
|---|---|---|
| How the learner answers | Types into a composer | Writes and draws on paper with Apple Pencil |
| What the grader sees | The typed text | A confirmed transcription of the ink (§5), never the image alone |
| Feedback | Criterion text in a receipt | The same, plus blue marks placed on the learner's own strokes |
| Mapping a unit | `map` item, answered as a typed list | A real map, drawn from memory on a blank page (§6.6) |
| Drawing | Not possible | `sketch` items: "draw the tree", "sketch the curve" (§7) |
| Checkpoint | A form of questions | A paper, answered in any order, handed in once (§6.5) |
| The record | Transcripts | A notebook of your own pages (§6.8) |
| Course building | Subject, files, or pack | Packs only in v1; courses built on the web are imported as `.epistemics` files (§13.4) |

---

## 2. Three rules the whole app keeps

These rules apply to every screen. Each one rules out a whole class of bad screens.

**1. The Pencil thinks, the finger navigates.** Only Pencil strokes make ink
(`PKCanvasView.drawingPolicy = .pencilOnly`). A finger scrolls, taps buttons and turns pages, and never
leaves a mark. So the writing palm can rest anywhere, and a scroll can never deface an answer. This is also
how the first run teaches the device: *"Write with Apple Pencil. Your finger scrolls and taps; it never
leaves a mark."*

**2. Your ink is graphite, the tutor's is blue.** The learner has one pen, near-black, and no colour picker.
The tutor's marks (a circle around a step, a tick, a numbered criterion, a dashed ghost of a missed idea)
are the only blue on a page. A blue mark therefore always means *the tutor is pointing at your work*, and
the page needs no legend. One consequence: the app's one primary action button is **graphite, not blue**,
unlike the web's blue accent action. Handing in is your move, so it is drawn in your colour.

**3. Controls live under the hand that is not writing.** The tool tray and **Hand in** sit on the left edge
for a right-handed learner and on the right for a left-handed one (asked once, in the first run, and
inferred from where the palm rests after that). The writing palm never lands on a button, and the free
hand hands in without the Pencil leaving the page.

And one rule about turns: **nothing is sent until you hand it in.** There is no auto-submit after a pause,
because a pause is often thinking. A turn ends when the learner taps Hand in. On Apple Pencil Pro, a
squeeze opens the tool tray, as it does everywhere else in iPadOS; it never hands in.

---

## 3. The page

Every session is one scrolling page, read top to bottom, the same rule as the web's "screens are
conversations". What sits on the page:

- **The tutor's turns and the item prompts**, typeset in the serif (New York on device). The serif still
  means *this is the material*.
- **Ink areas**, one under each prompt, where the learner writes. An ink area grows as you write near its
  bottom edge (*"The page grows as you write"*), so there is never a "more space" button. Earlier ink areas
  stay on the page as part of the conversation and are read-only once handed in.
- **Tutor marks**, in blue, anchored to strokes in the ink areas (§5.5).

**The page fits the window** ([UX-AUDIT.md](UX-AUDIT.md) §2). In portrait it is one column, with the tools
and hand-in pinned in the margin on the side of the hand you don't write with. In landscape it opens like a
notebook: the material on the free hand's page, your paper on the writing hand's page, so the question never
scrolls away while you write. In Split View it is one column with the controls along the bottom. The paper
has a fixed logical width and is scaled to fit, never reflowed, so rotating the iPad never moves your ink.

**The paper says what kind of answer is expected.** The app picks the background and the starting size from
the item type, the same way an exam paper's answer space hints at how long an answer should be. The
learner never picks one.

| Paper | Used for | Starting height |
|---|---|---|
| Ruled | `explain`, `discriminate`, teach-back, the lesson summary, dialogue turns | 3 lines, grows |
| Squared | `apply` (worked problems) | ~8 rows, grows |
| Dotted | free recall, `map`, `sketch` | most of a screen |
| Short box | `recall`, `cloze`, `predict` | one line |

**The tool tray** has four tools: pen, eraser, lasso (to move ink when you run out of room), undo. There are
no colours, pen widths, rulers, shapes or highlighters. A full `PKToolPicker` is an invitation to make
notes beautiful instead of doing the retrieval, so the app does not use it.

**Boxing the answer.** On squared paper, the learner may draw a box around the final answer, as on an exam.
The reader (§5) reports a boxed region, so the grader can tell working from the answer. It is a convention,
never required: an unboxed answer is read as the last line.

**When the page above is hidden.** On the web, the lesson hides the concept disclosure during unaided
phases. On the iPad there is a second way to see help: scroll up. So in PRIME, PROBE and CHECK (and in
every review and checkpoint), everything above the current prompt that could hold the answer is folded
away behind a line: *"Earlier on this page is hidden until you hand this in."* The notebook (§6.8) is shut
for the same reason. The rule is the web's: nothing on screen may hold the answer to the question being
asked.

---

## 4. Handing in

Hand in is a pill under the free hand (rule 3). What it carries depends on the session:

| Session | Hand in is | Why |
|---|---|---|
| Lesson dialogue (PROBE, DEVELOP, EXTEND) | One button, **Hand in** | Assisted turns carry no confidence rating |
| Unaided item (PRIME, CHECK, every review) | Three buttons: **Guessing / Fairly sure / Certain** | The confidence rating *is* the hand-in. One tap does both, and confidence can never be skipped |
| Checkpoint | **Hand in the paper**, once, at the end | It is an exam: move between questions freely, hand in once |
| Free recall, map | **Done writing** | Graded as a whole, with no confidence rating |

**"I don't know"** stays available on every unaided item. It costs an Again, exactly as on the web.

---

## 5. Reading the ink

This part has no web counterpart and carries the most risk. A grade is only as good as the reading behind
it, and the published evidence on models grading handwriting is sobering (RESEARCH §3): models misread
symbols, quietly fix the learner's mistakes, insert steps that were not written, and drift towards the
reference answer when they are shown it.

### 5.1 The pipeline

```
strokes ─▶ on-device read ─▶ Reader ─▶ confirm (when it matters) ─▶ Grader (blind) ─▶ marks
 (PKDrawing)   (instant, offline)  (no answer key)   (one tap)          (text only)       (on your strokes)
```

1. **Strokes.** The ink area's `PKDrawing` is kept as-is: every point with its timestamp, force, azimuth
   and altitude. Nothing is rasterised until a reader needs an image.
2. **On-device read.** Text goes through PencilKit's own recogniser (`PKStrokeRecognizer`, iPadOS 27),
   which is on-device and gives bounding boxes. That yields an instant draft reading, offline, and the
   word boxes used to place marks (§5.5). Mathematics goes through a stroke-based maths recogniser
   (Mathpix's strokes endpoint, or MyScript on device; decided in Phase 0, §14), because the on-device
   recogniser does not do maths.
3. **Reader** (a new LLM role, Claude with vision). It gets the rendered ink (clean white background,
   upright, cropped to the ink area) plus the on-device drafts, and returns a structured reading:
   ```json
   { "text": "markdown with $LaTeX$", "boxed": "the boxed answer, if any",
     "diagram": { "nodes": [...], "edges": [...], "labels": [...] } | null,
     "crossed_out": ["what was struck through"],
     "uncertain": [{ "span": "5040", "alternatives": ["5048"], "box": [x, y, w, h] }] }
   ```
   **The Reader never sees the item's reference answer, rubric or misconception list.** This is the rule
   that matters most in this section. A reader that knows what the answer should be reads that answer into
   ambiguous handwriting. The Reader is told to transcribe exactly, mistakes included, and to mark doubt
   rather than resolve it.
4. **Confirm.** The learner sees the reading and either accepts it or fixes a misreading (§5.3).
5. **Grade.** The web's blind grader runs unchanged on the confirmed text (plus the diagram's structured
   description, for sketches and maps). It never sees the image, so its job stays the one the grader
   agreement set measures: judging an answer, not deciphering handwriting.
6. **Marks.** Criterion evidence comes back as quotes from the transcription. The app maps each quote back
   to word boxes, and from there to strokes, and draws the blue marks there.

### 5.2 Speculative reading

The Reader adds two to four seconds, the same order as a tutor turn. To hide it: when the Pencil has been
lifted for two seconds, the app reads the ink area in the background. If no stroke has changed by the time
the learner hands in, the reading is already done. If one has, only the changed region is re-read. The
on-device draft is always available immediately, so the observer can start on it while the Reader
finishes.

### 5.3 When the learner confirms

Confirming every reading is safest and slowest. The policy:

| Situation | Confirm? |
|---|---|
| Checkpoint, CHECK, map from memory | **Always.** These decide mastery |
| Review, and the Reader flagged an uncertain span | **Yes**, and only the uncertain spans are offered |
| Review containing maths or a diagram | **Yes** |
| Review, plain short text, no doubt flagged | No. The reading is shown on the receipt with *"That's not what I wrote"* |
| Lesson dialogue turn (assisted) | No. The tutor replies straight away; *"That's not what I wrote"* sits under every turn |

**Confirming means correcting a misreading, never changing the answer.** The learner taps an uncertain
span to choose an alternative (*"5040"* or *"5048"*), or rewrites that one word in ink. There is no
keyboard, because a keyboard would let a learner edit their answer after seeing how it was read. Both the
original reading and the confirmed one are logged on the receipt.

### 5.4 What the grader does not judge

Handwriting quality, neatness, spelling (unless spelling is the objective), and the order things were
written in. A crossed-out first attempt is not an error. The observer may use it as a signal (§9), but the
grader never sees it.

### 5.5 Tutor marks

A mark is a blue stroke drawn by the app, anchored to the learner's ink: a circle around a step, a tick by
a line, a numbered dot tying a receipt criterion to its evidence, a dashed ghost of a missing node.
Marks look hand-drawn (a jittered path, never a perfect ellipse) so that they sit in the same world as the
ink, and they are always drawn on a separate layer above it. A mark never alters a stroke.

Restraint rules, matching the tutor's turn rules:

- **At most one mark per dialogue turn**, with at most one short margin note. The tutor's one question
  stays in its turn, not in the margin.
- **No marks during unaided phases.** A circle is a hint.
- On a receipt, **one numbered mark per rubric criterion** that has evidence, and nothing else.

---

## 6. Sessions

### 6.1 First run

Four steps: **what to learn**, **who marks the answers**, **a placement test**, and **the time and the one
rule**. It departs from the web's onboarding ([ONBOARDING.md](../../web/docs/ONBOARDING.md)) in two ways:

- **The web's "what do you already know?" free recall is replaced by a placement test.** Asking people what
  they know measures confidence, not knowledge. The placement *finds out*, by hand, and skips the lessons
  the learner doesn't need. The first thing anyone does in the app is still retrieve something by hand, so
  it still makes the app's argument and doubles as the Pencil tutorial.
- **Handedness** is asked once, as one line in step 1 (*"Which hand do you write with?"*), because rule 3
  needs it before the first ink area appears.

**The placement** (`EpistemicsCore/Session/Placement.swift`) is a knowledge-space test in the style of
ALEKS, run on the course's prerequisite graph:

- A correct answer settles the concept **and all its prerequisites** as known. A wrong answer or *"I don't
  know"* settles the concept **and everything built on it** as not known yet.
- Each question goes to the unsettled concept whose answer, either way, settles the most concepts in the
  worst case. On a chain that is a binary search; on a branching graph each branch is placed on its own.
- It stops when every concept is settled or after 12 questions. Whatever is still unsettled counts as not
  known: under-placing costs a lesson, over-placing costs a learner who is lost.
- It is quiet, because it measures rather than teaches: no blue marks, no answers shown, no tutor. Answers
  are read, confirmed under the review policy, and graded blind like any other. A pass needs a
  confidence-adjusted rating of Good or better, so a lucky guess is not knowing.
- What it finds: each known concept's cards are seeded as provisional reviews (stability 21 days), so
  placing out of something does not excuse it from being remembered: it has to hold up in reviews, and if
  it doesn't, it is scheduled again like anything else. Lessons whose concepts are all known are skipped.
  Scaffolding is set from the share known, from evidence rather than self-report.
- *"I'm new to this, start at the beginning"* skips it. Today keeps offering the placement until the
  first lesson is finished.

Choosing the tutor comes **before** the placement, because something has to read and mark it. This breaks
the web's rule of never asking for a key before showing the app working; the placement is that showing.
Later, step 2 should default to the account's hosted tutor (the Supabase edge function the web already
has, §13.3), because pasting an API key on an iPad is miserable. Bring-your-own-key stays available, stored
in the Keychain. A device that already has a tutor skips step 2.

### 6.2 Today

Same content and order as the web's Today, as one column. The warm-up is the headline because it is the
handwritten activity with the best evidence: *"Start with a blank page. Write down everything you remember
from Tuesday's lesson."* Then the quiet lines: reviews due with a time estimate *by hand* (§8), the next
lesson and whether it is locked, a map from memory if one is due, and reviews cleared in a row.

After reviews, Today may offer a **progress check**: six mixed questions from everything learned or placed
out of, unaided and unlabelled. Passes are the only evidence that earns "mastered"; a wrong answer sends the
concept back (a placed-out concept's lesson returns, a taught one gets a remediation lesson). Details and
reasons in [AUDIT.md](AUDIT.md) #4.

### 6.3 A lesson

The state machine is unchanged. What ink changes in each phase:

| Phase | On the page |
|---|---|
| PRIME | Prompt, a short box or squared paper, confidence hand-in. Page above folded away |
| PROBE | Ruled paper. *"What do you already know that bears on this?"* |
| DEVELOP | Dialogue turns on ruled or squared paper. The tutor may ask for a drawing (*"Draw every outfit as a tree"*) when an objective says "with a diagram". One blue mark per turn |
| CONSOLIDATE | *"State the principle in your own words"*, ruled, graded blind, re-statement below the first |
| EXTEND | Transfer question, with the paper chosen by the question |
| CHECK | Unaided. Page above folded away, no marks, confidence hand-in, confirmed reading |
| Wrap | A 3–5 sentence summary, handwritten, then the delayed judgement of learning |

**The concept card.** While help is allowed (DEVELOP, EXTEND, remediation), the concept card and the
concept's worked example are on the page:
- **landscape:** on the left page, above the dialogue;
- **portrait:** a pull-down above it.

It is never a modal sheet, and it's put away while the learner answers alone or restates the idea in their
own words.

The worked example fades: a novice studies the first one whole, and each later concept leaves one more step
for the learner to write by hand and then compare. A lesson's support level comes from how secure its
prerequisites are ([AUDIT.md](AUDIT.md) #6, [UX-AUDIT.md](UX-AUDIT.md) §6).

The tutor's charter gains one rule: **when a concept's objective names a representation (a tree, a graph, a
diagram, a table), the tutor asks the learner to draw it rather than describe it.** The probability pack
already has such objectives, for example *"Explain, with a tree diagram, why the numbers of options at
successive stages multiply."*

### 6.4 A review

One item per page: the prompt, an ink area whose paper and size come from the item type, and the
confidence hand-in. After grading, the receipt sits on the same page: your ink with numbered blue marks,
the criteria beside it, the rating, and **"You answered this 12 days ago"**, a thumbnail of your previous
attempt at the same item with that attempt's marks. Seeing the earlier attempt only *after* answering is
the point. It is feedback about change over time, which typing has nowhere to put, and it never shows the
answer before the retrieval.

Self-graded types (`recall`, `cloze`, `predict`) put the reference beside your ink after hand-in, and you
rate Again / Hard / Good / Easy with a finger tap.

**The first wrong line.** When the working has a wrong step, the grader names the first one. It gets a wavy
blue underline on your ink and one sentence on what is wrong, never the fix. A wrong answer then offers
**Fix it from here** *before* the answer is shown: you rewrite from that line on fresh paper, and *I'm stuck*
brings up to three tutor questions about that line. The fix is practice with help: it is logged as
assisted and never changes the schedule or mastery. **Show me the answer** is always there, and closes the
fix. ([AUDIT.md](AUDIT.md) #1–#2.)

**A fresh problem each time.** Items can carry variants: the same skill with new numbers and a new context.
Reviews serve the item, then each variant, then the one seen longest ago, so passing means the skill rather
than remembering one question. The earlier attempt shown on the receipt says *"You did one like this"* when
it was a different version. ([AUDIT.md](AUDIT.md) #3.)

### 6.5 A checkpoint

A real exam paper: white sheet, numbered questions in the serif, an answer space sized to each question,
a column of question numbers on the free-hand side to jump around, and one **Hand in the paper** at the
top. No tutor and no marks until it is handed in. After that, the paper comes back marked, question by
question. The 70/30 composition and the pass threshold are the web's.

### 6.6 Map from memory (new session type)

The web has `map` items answered as text. The iPad makes the map a session of its own, because drawing a
concept map from memory is as effective as written free recall (Blunt & Karpicke 2014) and is miserable to
type.

- **When:** offered once per unit after its second lesson and again before the checkpoint, scheduled like
  an item (it *is* the unit's `map` item).
- **Prompt:** *"Draw every idea from this unit, and how they connect."* The unit title and nothing else.
  Dotted paper, a whole screen, pan and zoom with fingers.
- **Grading:** the Reader returns `diagram.nodes` and `edges`. Nodes are matched to the unit's concepts
  (names, plus the on-device match the first run already uses), and edges are compared with the
  prerequisite graph, ignoring direction for v1.
- **Feedback:** *"You placed 6 of 7 ideas and 4 of 7 links."* Correct links get blue ticks. A link that is
  not in the graph gets a blue *"?"*, never a cross, because a learner's link can be real even when the
  curriculum does not draw it. Missing concepts appear as dashed blue ghosts, with dashed links to where
  they belong. Each missed concept's items move to the front of tomorrow's queue.
- **Only the retrieval counts.** The research is clear that the benefit is retrieving, not the map's
  shape (Mayrhofer et al. 2023). So there is no score for layout, and no "tidy your map" step.

### 6.7 Teach-back

The naive student's questions arrive as typeset turns. The learner answers on a whiteboard-sized page and
may draw. The student may ask *"can you draw that?"* once per session. The grading is the web's, run on
the confirmed reading.

The evidence says explaining out loud may beat explaining in writing (RESEARCH §4). That is the one place
where a later version should offer **voice** as well as ink; §10 covers it.

### 6.8 The notebook

Every page you have written, by course, unit and lesson: the record of your work. It is deliberately a
*record*, not a study mode, because re-reading is the weak strategy the whole app is built against:

- It is shut whenever a retrieval is in progress (§3).
- Opening a lesson's pages offers *"Try it first"*: the lesson's CHECK questions, unaided, before the
  pages open. Turning that down is allowed and logged.
- There is no highlighter, no search across your ink (in v1) and no export to PDF.

---

## 7. Item types on paper

| Type | Paper | How it is read | How it is graded | Note |
|---|---|---|---|---|
| `recall` | Short box | On-device | Self, against the reference shown beside it | |
| `cloze` | A short box inside the sentence | On-device | Self | |
| `explain` | Ruled | Reader | Blind grader | The workhorse, as on the web |
| `apply` | Squared | Reader + maths recogniser | Blind grader, plus exact match on the boxed answer | Working is visible, so feedback can point at the step that went wrong, not just the answer |
| `discriminate` | Ruled, two columns headed by the two concepts | Reader | Blind grader | |
| `predict` | Short box, or dotted when the prediction is a curve | On-device or Reader | Self | *"Sketch what you expect the histogram to look like"* |
| `map` | Dotted, whole screen | Reader (diagram) | Graph comparison (§6.6) | Now its own session |
| `teachback` | Ruled, whiteboard size | Reader | Blind grader | |
| **`sketch`** (new) | Dotted | Reader (diagram, with a structured description) | Blind grader on the description, plus structural checks | *"Draw the tree for 2 shirts × 3 trousers and mark the leaves"* |

**`sketch`** is the one new item type. Its reference holds a structural description, not an image (for
example `{ "kind": "tree", "levels": [2, 3], "leaves": 6 }`), with a rubric of checkable criteria
(*"two first-level branches"*, *"each splits three ways"*, *"six leaves marked"*). The Reader describes the
learner's drawing in the same vocabulary, and the grader compares descriptions. Grading drawings is where
models are least reliable (RESEARCH §3), so `sketch` items always go through confirmation, and the
grader's consensus deferral (web DESIGN §6.2) uses a lower confidence bar for them.

**Pack format.** Packs stay the web's `.epistemics.json`. Two optional additions, both ignored by the web
app:

- `item.ink`: `{ "paper": "ruled" | "squared" | "dotted" | "short", "lines": n }` overrides the default
  from the type.
- `type: "sketch"` with `reference.structure`.

The web app can show a `sketch` item as an `explain` item (*"describe the tree you would draw"*), so one
pack can serve both apps.

---

## 8. Throughput and scheduling

Handwriting is slower than typing for prose, and the size of the testing effect grows with the number of
retrievals. If ink halves the number of reviews someone does in their twenty minutes, it can easily cost
more than any benefit of writing by hand. The app manages this directly:

- **Time estimates are measured, not assumed.** The per-item time estimate the review gate and Today use
  (*"about 15 minutes by hand"*) is learned per item type from this learner's own hand-in times, starting
  from conservative defaults (recall 20 s, explain 60 s, apply 90 s, sketch 90 s).
- **The review cap is derived for ink.** The web derives `reviewsPerDay = minutesPerDay × 3` (about 20 s a
  card). The iPad starts at `× 2` and recalibrates from measured time after the first week.
- **Reviews lean short.** The item writer (when generating, and in the iPad's choice among a concept's
  items) prefers short-answer forms for `remember`-level review, and saves long ink (`explain`, `sketch`)
  for the review slots where understanding is the thing being tested. Sibling burying already stops two
  long items from one concept landing in one session.
- **Short answers stay handwritten.** Writing "5040" is fast. The cost is in prose, which is exactly where
  the queue economises.

---

## 9. What the ink tells the tutor

Ink carries process information that typed text loses: how long a learner hesitated before starting, what
they wrote and crossed out, where they paused, what they drew first. The observer gets a compact summary
per turn (time to first stroke, total writing time, the crossed-out text, whether a diagram was drawn).

Use it sparingly, and only for teaching decisions:

- A crossed-out "add" replaced by "multiply" is evidence that a misconception has just been corrected. The
  observer can tag it, and the tutor can ask about it (*"What made you change that?"*).
- Long hesitation before an unaided answer can lower the effective confidence the learner reported, but
  only as a signal in the learner model, never as a grade.
- **None of this is ever shown to the learner as a metric,** and none of it affects a rating. Nothing about
  how someone writes is graded, only what they wrote.

---

## 10. Accessibility, and the typed fallback

Some people cannot write comfortably by hand: dysgraphia (estimates vary widely, roughly 7–15% of
school-age children), tremor, arthritis, injury. A handwriting-only app would shut them out on the strength
of an effect that is not even established. So:

- **Settings → Answering → "I'd rather not write by hand"** switches text answers to typing (or
  dictation), with the same composer as the web. Drawing items stay drawn, become described in words, or
  are skipped, by the learner's choice. This is a setting, not a per-question escape: the app does not
  offer a keyboard on any single question, because then nobody would write.
- The modality of every answer is logged on its receipt (`ink` / `typed` / `dictated`), which also feeds
  §11.
- Left-handed layout (rule 3), Dynamic Type for all typeset text, VoiceOver labels for every control.
  Ink areas announce their reading (*"Your answer, read as: …"*).
- **Voice for explanations** is the most promising later addition: oral explaining has evidence of its
  own. It is out of scope for v1 and listed in §15.

---

## 11. Testing our own premise

No study has tested whether answering retrieval prompts by hand produces better delayed retention than
typing them. This app is unusually well placed to find out, so it should:

- **Within-learner, opt-in.** For learners who agree, a random 20% of review items are answered by
  typing (an on-screen keyboard appears for those items only, and says why). The rest are ink.
- **The outcome** is the unassisted result the next time *that item* comes due, which FSRS already
  predicts. Compare observed recall against predicted recall for the two modalities, by item type.
- **Also log** time per item, so we can see whether any retention gain from ink survives the throughput
  cost (§8).
- **Decision rule, written down before looking:** if ink shows no retention benefit after about 2,000
  paired reviews, the iPad app stops requiring ink for plain-text items. It keeps ink where ink is the
  point (maths, sketches, maps), and says so plainly.

---

## 12. Visual system

The iPad version of [DESIGN-SYSTEM.md](../../web/docs/DESIGN-SYSTEM.md): same principles, different material.

**The page is paper.** There is no wallpaper and no floating window. The screen is the sheet: a warm
off-white (`paper` #FAFAF7) with a slightly darker sidebar (`paper-2` #F0F0EA). A checkpoint is the one
place a white sheet sits on a grey ground (`desk` #ECECE6), because it is a separate document you hand
in.

| Token | Light | Use |
|---|---|---|
| `paper` | #FAFAF7 | Every page |
| `paper-2` | #F0F0EA | Sidebar |
| `sheet` | #FFFFFF | Ink areas, the checkpoint paper |
| `graphite` | #1D1D1F (ink #2A2A2C) | Text, the learner's ink, the primary action |
| `tutor` | #0071e3 | Tutor marks and margin notes, and links. Nothing else |
| `muted` | #6E6E73 | Secondary lines |
| `rule` | 7% black | Ruled, squared and dotted paper |

Dark mode inverts paper and graphite but keeps ink legible as written. Strokes are stored as drawn and
rendered with PencilKit's dynamic ink colours, so black ink becomes light in dark mode and the tutor's blue
lightens to #4DA2FF, as on the web.

**Type.** SF Pro for chrome. **New York** (the system serif) for anything the learner is learning: tutor
turns, prompts, margin notes (italic). The mockups use Newsreader and Caveat as web stand-ins for New York
and for real handwriting.

**The rules carried over from the web:** nothing is drawn that space can do instead; one primary action per
screen (graphite, §2); status goes in the sentence, not a chip; secondary detail is a muted line.

**Added for ink:**

1. No chrome inside an ink area: no toolbar, no border, nothing the palm can hit.
2. Controls are at least 44 pt, on the free-hand side.
3. Blue belongs to the tutor (§2). Status colours are used only as text, never on the page.

---

## 13. Architecture

### 13.1 Shape

A native SwiftUI app. No code is shared with the web monorepo. The **pack format, the prompts and the
behaviour** are shared, and so is a set of **conformance fixtures**: JSON scenarios exported from
`web/packages/core`'s tests that the Swift port must pass, so the two apps schedule and gate identically.

```
ipad/
  Epistemics.xcodeproj
  App/              SwiftUI app, scenes, navigation (NavigationSplitView)
  Packages/
    EpistemicsCore/ Swift port of web/packages/core: FSRS-6, queue, review gate, mastery,
                    lesson state machine (a pure reducer, as on the web)
    Ink/            PKCanvasView wrapper, paper backgrounds, tool tray, growable ink areas,
                    mark layer, stroke ↔ word-box mapping
    Reading/        on-device recognition, maths recogniser client, Reader role, confirm model
    LLM/            Anthropic Messages API over URLSession (streaming, structured output, caching),
                    roles, prompt loading, usage ledger
    Store/          SQLite (the system library, no GRDB); the web's tables, each row's record kept as JSON (§13.2)
  Resources/
    packs/          bundled .epistemics.json (copied from web/content/packs at build time)
    prompts/        web/content/prompts + reader.md, plus ink amendments to tutor-charter.md
  Fixtures/         conformance scenarios exported from the TS core tests
```

**Minimum OS: iPadOS 27**, for `PKStrokeRecognizer` (on-device handwriting recognition; `search(_:)` returns
stroke ids and bounds, which is what places the marks). Confirmed in the iPadOS 27 SDK.

**As built.** The folders differ slightly from the sketch above: the app target holds `App`, `Design`, `Ink`,
`Reading`, `Store`, `Services` and `Screens`, and the package `EpistemicsKit` holds `EpistemicsCore` (the core
port) and `EpistemicsLLM` (the LLM port plus the Reader). Storage uses the system SQLite directly rather than
GRDB, keeping the dependency count at zero. No maths recogniser is integrated yet: the Claude Reader reads
maths from the image, with the on-device draft as a hint. The hosted tutor (§13.3) waits on account sign-in.

### 13.2 Data

The web schema ([DESIGN.md §9.3](../../web/docs/DESIGN.md)) unchanged, so that sync (§14, Phase 4) is a
transport problem, not a migration. Two tables added:

```
ink(id, course_id, owner_kind: turn|receipt|recall|map|summary, owner_id,
    drawing BLOB,            -- PKDrawing.dataRepresentation(), the source of truth
    bounds_json, paper, stroke_count, writing_ms, first_stroke_ms, created_at, updated_at, deleted_at)
reading(id, ink_id, source: ondevice|math|reader, model, text, boxed, diagram_json,
        crossed_out_json, uncertain_json, word_boxes_json,
        confirmed_text, confirmed_at, created_at)
```

`receipts.answer` stores the confirmed text, so a receipt is readable anywhere, including on the web.
`receipts` gains `ink_id` and `modality`. Ink blobs are the bulk of storage: about 10–50 KB per answer.

### 13.3 The LLM layer

The roles are the web's, plus one:

| Role | Model (default) | Input | Note |
|---|---|---|---|
| **Reader** (new) | Claude Sonnet, with vision | Rendered ink + on-device drafts. **No reference, rubric or misconceptions** | Structured output (§5.1). Opus for checkpoints |
| Tutor | as web | Transcripts, plus the image when a turn contains a drawing | Charter gains the "ask for the drawing" rule and the one-mark rule |
| Observer | as web | Transcript + the ink summary (§9) | |
| Grader | as web | Confirmed text + diagram description. **Never the image** | |
| Student | as web | Transcripts | |

Transport defaults to the **existing Supabase edge function** (`web/supabase/functions`), which already
holds the key server-side and enforces a daily budget per user. The iPad signs in and never holds a key.
Bring-your-own-key goes in the Keychain. Apple's on-device Foundation Models are worth using for cheap,
private jobs (classifying what kind of answer an ink area holds, tagging, wording a canned hint), but not
for reading or grading.

### 13.4 Courses

iPad v1 runs **packs**: the bundled ones, and `.epistemics` files imported through the Files app, which
includes every course built from a subject or uploaded material in the web or desktop app. Porting the
Architect pipeline (ingest, outline, graphs, item writing) to the iPad is deferred. It is the largest
piece of the web codebase, and building a course is a desk activity anyway.

---

## 14. Plan

| Phase | Builds | Exit criterion |
|---|---|---|
| **0. Ink spike** | One screen: write an answer, hand in, see the reading. A labelled set of ~300 handwritten answers from the probability pack (text, maths, trees), written by several people | Reading accuracy measured per content type. Choose the maths recogniser. Target: ≤ 2% character error on text, ≤ 5% on maths, before any grade is trusted |
| **1. Reviews** | Store, Core port passing the fixtures, pack loading, the review page, confirm, receipt with marks, Today | A week of real reviews on the probability pack, with grader agreement on ink answers within 0.05 QWK of typed answers |
| **2. Lessons** | Lesson page, state machine, tutor and observer, page folding in unaided phases, wrap-up | The web's pedagogy evals pass with ink transcripts as input |
| **3. Ink-only sessions** | Map from memory, `sketch` items, checkpoint paper, teach-back, notebook | |
| **4. Sync and the experiment** | Supabase sync of the shared schema plus ink; the §11 experiment | |

Phase 0 comes first and can stop the project. If ink cannot be read accurately enough, the grading built
on top of it means nothing.

---

## 15. What the iPad app must never do

1. **Never show the Reader the answer.** Transcription happens with no answer key in context.
2. **Never grade handwriting.** Neatness, speed and crossings-out are never part of a rating.
3. **Never let confirmation change the answer.** Confirming fixes a misreading. It is not a second attempt.
4. **Never put help on screen during a retrieval,** including by scrolling up or opening the notebook.
5. **Never auto-submit.** A pause is thinking.
6. **Never turn ink into type behind the learner's back** (no Scribble-style conversion). Their page stays
   their page.
7. **Never claim handwriting is why it works.** Retrieval and spacing are why it works. Handwriting is
   what makes drawing, notation and maps possible.

## 16. Open questions

1. **Maths recognition:** Mathpix strokes (cloud, cheap, strong) or MyScript (on device, licensed per
   device)? Phase 0 decides on accuracy first, then on cost and offline use.
2. **Where marks come from:** should the tutor choose them (a tool call in its turn) or the observer (which
   already sees every turn)? Leaning towards the observer, so the tutor's prompt stays about language.
3. **`sketch` grading:** is a structural description enough for trees and Venn diagrams but not for
   sketched curves? Probably curves need sampled points and a tolerance, which is a separate grader.
4. **Voice:** oral explaining has its own evidence. Add it to teach-back first?
5. **One account, two apps:** when both sync, should a course started on the iPad be continuable on the web
   (typing), or should a course remember its modality? Leaning towards continuable, with modality logged
   per answer, which §11 needs anyway.
