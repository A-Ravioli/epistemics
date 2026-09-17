# Epistemics: design document

*A local-first web and desktop app that teaches any subject Socratically with an LLM, structures it into a sequenced curriculum, assesses continuously, and enforces spaced review before new learning.*

Status: v0.1 design, 2026-09-16. Companion documents: [PLAN.md](PLAN.md) (implementation phases) and [research/](research/) (evidence base: learning science, scheduling algorithms, tool landscape, tech stack).

---

## 1. What we are building and why

**One sentence.** You give Epistemics a subject or a textbook; it builds a dependency-ordered curriculum once, then walks you through it one lesson at a time in a Socratic dialogue, makes you retrieve everything you have learned on a spaced schedule before it lets you learn more, and tests you without help at every unit boundary.

**The problem with existing tools.** Flashcard apps (Anki, RemNote) schedule well but do not teach, and their prompts test recall rather than understanding. Course generators (Oboe) teach but never make you remember. Chat tutors (Study Mode, Guided Learning, Learning mode) have no curriculum, no learner model, and no scheduler, and optional tutors go unused (Khanmigo: students messaged in 17% of sessions where they erred). Mastery platforms (Math Academy) have the right loop but are hand-authored for one domain.

**What the evidence says the loop must be** (see [research/01-learning-science.md](research/01-learning-science.md)):

| Principle | Evidence strength | How Epistemics enforces it |
|---|---|---|
| Retrieval before and after instruction | Strong (Rowland 2014 g=0.50; Adesope 2017 g=0.61) | Every concept starts with a pretest attempt and ends with an unaided check; every review is a retrieval, never a re-read |
| Spacing via a memory model, spanning sleep | Strong (Cepeda 2006/2008; FSRS benchmarks) | FSRS-6 per item, desired retention 0.9, reviews queued before lessons |
| Successive relearning to criterion across ≥3 sessions | Strong (Rawson & Dunlosky 2013, d=1.5-4.2) | A concept is "mastered" only after successful retrieval in 3 separate spaced sessions |
| Guardrailed tutoring: hints before answers, no answer before an attempt | Strong (Bastani 2025; Kestin 2025) | Hint ladder enforced in code, not prose; leak detector on tutor output |
| Elaborated corrective feedback | Strong (Wisniewski 2020; Butler 2013) | Every graded answer returns criterion-level feedback plus a re-attempt |
| Self-explanation and "why?" | Strong (Bisra 2018 g=0.55) | Tutor's default follow-up is "explain why"; consolidation step requires the learner to state the principle |
| Worked examples for novices, fading with expertise | Strong (Sweller; Kalyuga) | Scaffolding level chosen from prerequisite mastery; faded worked examples in early lessons |
| Interleaving of confusable concepts once a foothold exists | Strong for problem types (Rohrer 2020 d=0.83) | Review queue mixes concepts; checkpoints pull 30% of items from earlier units; "discriminate" item type |
| Confidence ratings and calibration feedback | Moderate (Sparck 2016; hypercorrection) | Confidence before reveal on every item; calibration dashboard; high-confidence errors get immediate elaborated feedback |
| Learning by teaching (interactive) | Moderate (Kobayashi 2019 g=0.56) | "Teach-back" session type where the model plays a questioning student |
| Unassisted performance is the metric | Strong (Bastani; Anthropic 2026) | Assisted and unassisted scores logged separately; only unassisted counts toward mastery |
| Fixed, reviewable curriculum; adaptive sequencing only | Product evidence (Math Academy, Duolingo) | Curriculum is generated once, versioned, and shelved; the app only chooses what to do next |

Things we deliberately do not build: learning-style profiles, praise-only feedback, highlight/re-read modes, an optional chat sidebar, and a "Feynman technique" feature marketed as evidence-based (the evidence supports self-explanation and interactive teaching, which is what teach-back is).

---

## 2. Core concepts and vocabulary

```
Shelf ──contains──▶ Curriculum (versioned, immutable content package)
                        ├─ Unit ──▶ Lesson ──▶ Concept (knowledge point)
                        │                        ├─ Objective (Bloom-tagged)
                        │                        ├─ Misconception
                        │                        ├─ Example (worked, varied)
                        │                        ├─ SourceSpan (grounding)
                        │                        └─ Item (review prompt + rubric + hidden reference)
                        ├─ PrerequisiteEdge (concept → concept)   forward: gating
                        └─ EncompassingEdge (concept → concept, w) backward: implicit review credit

Course = one learner's enrolment in one Curriculum version
   ├─ CardState (FSRS memory state) per Item
   ├─ ConceptMastery (derived)
   ├─ Session (review | lesson | checkpoint | diagnostic | teachback)
   │     └─ Turn / Attempt / Receipt
   └─ LearnerModel (compact summary injected into prompts)
```

- **Curriculum**: content only. No learner state ever lives inside it. Identified by a content hash; every child object has a stable UUID that survives republishing so scheduling state keys to it.
- **Unit**: a chapter-sized block (typically 4-8 lessons). Ends with a **checkpoint**.
- **Lesson**: 20-40 minutes; 3-5 concepts that respect prerequisite order; has a lesson script (pretest, guiding question plan, worked example, transfer question) per concept.
- **Concept**: the atomic unit of mastery and the node in both graphs. Carries objectives at explicit Bloom levels (remember / understand / apply / analyze), a misconception list, varied examples, and source spans.
- **Item**: the atomic unit of scheduling. Belongs to one concept. Types in §6.1. Carries a rubric and a reference answer that the tutor never sees.
- **Prerequisite graph**: used forward. A concept is *available* when every prerequisite has mastery ≥ threshold.
- **Encompassing graph**: used backward. A successful unaided performance on concept B gives fractional credit to concepts B encompasses (Math Academy's FIRe idea).
- **Session**: a bounded activity with a type, a transcript, and receipts. Only session types are exposed to the user; there is no free-form chat.

---

## 3. The learner's loop

### 3.1 Onboarding a course

The first run — the order these are actually asked in, what is inferred rather than asked, and why — is
specified in [ONBOARDING.md](ONBOARDING.md). The steps themselves:

1. **Choose a source**: (a) pick a curriculum from the Shelf; (b) name a subject ("real analysis", "microeconomics for an engineer"); (c) upload material (PDF, EPUB, DOCX, Markdown, a syllabus). (b) and (c) can be combined: a subject plus reference texts.
2. **Scope**: goal ("understand", "pass exam on <date>", "apply at work"), prior background, and time budget. This sets desired retention, the exam-date interval cap, and the initial scaffolding level. In the first run these are not a form: background comes from a free-recall prompt the learner answers before anything is explained, and the review load is derived from one question about minutes a day (ONBOARDING §3, §5). The full interview, including target depth, remains on the Setup screen for later courses.
3. **Curriculum build** (§7) runs in the background, unit by unit, showing progress. Unit 1 is ready in minutes; later units generate ahead of the learner.
4. **Diagnostic** (optional, offered when the recall in step 2 shows real background): adaptive placement over the prerequisite graph (§6.4). Concepts judged known are seeded with a conservative memory state and a "provisional" flag; they still enter the review stream and must survive it.
5. **Review the outline**: the learner can rename, reorder, drop, or merge units and lessons before the version is frozen. Editing after freezing creates a fork (§8).

### 3.2 A day ("Today" screen)

The Today screen is the app's home and the only place new work is launched from. It shows, in order:

1. **Warm-up brain dump** (optional, 2-3 minutes). "Write everything you remember from your last lesson." Graded blind against that lesson's concept list; each concept recalled counts as a review with rating Good; missed concepts are queued first. (Free recall is the retrieval format with the largest effect; Karpicke & Blunt 2011.)
2. **Review queue**: all items due today, interleaved across concepts and units, learning-step items first, then reviews sorted by due date with a random tiebreak, capped at `reviews_per_day`. Progress bar plus a **review-debt meter** (§5.4).
3. **Next lesson**: locked until the review gate (§5.4) passes and prerequisites are mastered. Shows why it is locked ("14 reviews to go, ~9 min").
4. **Checkpoint** when the current unit's last lesson is complete and its concepts have each been retrieved successfully in ≥2 spaced sessions.
5. **Teach-back** suggestions for concepts with mastery in the 0.6-0.85 band.
6. **End-of-session judgment of learning**: "Which of today's concepts will you still be able to explain in a week?" Answered at session end, not right after study (delayed JOLs are far more accurate; Nelson & Dunlosky 1991). Feeds the calibration score.

### 3.3 A lesson (Socratic dialogue)

A lesson is a state machine over its concepts. The LLM does not decide when to move on; the state machine does, using observer and grader signals. This is the single most important design decision: **pedagogical control lives in code, the model supplies language.**

Per concept:

| Phase | What happens | Exit condition |
|---|---|---|
| **PRIME** | The pretest question (from the lesson script) is posed cold. Learner attempts, rates confidence 1-3. No correctness feedback yet, only "let's find out". Errorful generation primes learning (Kornell 2009; Pan & Carpenter 2023). | One attempt recorded (an explicit "I don't know" counts). |
| **PROBE** | Tutor elicits what the learner already knows that bears on this concept, and links to mastered prerequisites by name. One question per turn. | Observer reports prior-knowledge elicited, or 2 turns. |
| **DEVELOP** | Guided discovery toward the objective. The tutor asks a sequence of leading questions; the learner reasons. A **hint ladder** (level 0 → 3) advances only after an observed attempt at the current level. Level 3 ("bottom-out") is a partial worked example with a self-explanation prompt, never the full answer. If the learner's prerequisite mastery is low (novice), DEVELOP starts from a **faded worked example**: the tutor shows a complete example, asks the learner to explain each step, then presents a second example with the last steps removed. | Observer reports the objective's key idea has been stated by the learner, or hint level 3 has been reached and explained. |
| **CONSOLIDATE** | "State the principle in your own words." The statement is graded blind against the concept's understand-level objective. Corrective feedback is criterion-level and explanatory, followed by a re-statement. | Grader reports the objective met. |
| **EXTEND** | One transfer question: a varied surface (different domain or numbers), an edge case, or a contrast with a confusable neighbour concept. Hint ladder applies. | Attempt plus feedback. |
| **CHECK** | **Unaided.** The pretest question again (or an isomorph). Tutor is silent; confidence rating; blind-graded. Records the *unassisted* score. A fail sends the concept to a short remediation loop (targeted at the misconception tag) and schedules it for tomorrow rather than allowing another immediate try. | Graded. |

Lesson wrap-up: the learner writes a 3-5 sentence summary of the lesson (generation, not summarization of text); the tutor checks it for errors; the concept's items are **activated** (enter FSRS Learning state; the CHECK result counts as their first review); the delayed JOL is collected.

Tutor turn constraints (enforced in code, §7.3): at most one question per turn; ≤ 120 words except in worked examples; never contains the reference answer of the active CHECK item (leak detector); never advances a hint level without an attempt; never accepts "I'm right, my notes say so" without evidence (sycophancy tests in CI).

Scaffolding level is chosen per concept from the learner model: `novice` (worked-example first), `developing` (problem first with early hints), `advanced` (problem first, hint ladder starts at level 0 and the tutor withholds hints for two attempts). This implements expertise reversal.

### 3.4 A review

Each due item is presented as a retrieval task appropriate to its type (§6.1). Sequence: prompt → learner answer or self-recall → **confidence (1-3)** → reveal reference or blind grade → feedback → rating. For self-graded types the learner rates Again / Hard / Good / Easy; for LLM-graded types the grade maps to a rating (§6.2) and the learner can dispute it (the dispute is logged; a second grader sample decides).

Confidence adjusts the rating: high-confidence wrong → Again, flagged **hypercorrection**, immediate elaborated feedback and a same-session re-ask; low-confidence right → Hard ("lucky"). Confidence itself is never used to inflate a rating.

Every review appends to the immutable `review_log`, which is the sole input to the FSRS optimizer.

### 3.5 A checkpoint

Unaided, timed loosely, no tutor. 8-15 items: ~70% from the unit just finished (apply and analyze levels preferred), ~30% interleaved from earlier units (discriminate and transfer items preferred). Blind-graded. Per-concept pass threshold 0.8. Failing concepts are reopened: a remediation mini-lesson (DEVELOP + CONSOLIDATE + CHECK only) is inserted before the next unit and the concept's items are rescheduled with rating Again. The checkpoint result is stored as a receipt and counts as one successful spaced retrieval for each passed concept.

### 3.6 Teach-back

The model plays a curious, slightly confused student who has read nothing. The learner explains the concept; the "student" asks clarifying questions, poses a wrong belief once, and asks for an example. A blind grader scores the learner's explanation against the concept's objectives afterwards. Counts as a review (rating from grade) for the concept's `explain` item. Interactive teaching outperforms preparing-to-teach (Kobayashi 2019).

---

## 4. Learner model

Kept in the database, never only in the context window (long dialogues drift without external state; MathTutorBench). A compact rendering (≤ 600 tokens) is injected into every tutor call after the cached curriculum prefix.

```
learner_model {
  goals: { purpose, exam_date?, weekly_minutes }
  scaffolding: novice | developing | advanced        # per course, recomputed weekly
  concept_state[concept_id]: {
    mastery: 0..1,          # see §5.5
    successful_sessions: n, # spaced sessions with ≥1 successful unaided retrieval
    last_misconceptions: [tag, ...],
    unassisted_pass_rate, assisted_pass_rate
  }
  calibration: { brier, overconfidence_bias, hypercorrections_won }
  recent: { last_lesson_summary (learner's words), open_questions[] }
  preferences: { verbosity, examples_domain? }       # e.g. "use examples from chemistry"
}
```

The observer (§7.2) updates `last_misconceptions` and progress after each learner turn. The learner can read and edit the model ("you think I'm shaky on eigenvalues; I'm not") and edits are logged as manual reviews.

---

## 5. Scheduling

Full algorithm notes and formulas: [research/02-spaced-repetition.md](research/02-spaced-repetition.md).

### 5.1 Algorithm

FSRS-6 via `ts-fsrs` (5.x) in the shared TypeScript core; the `fsrs` Rust crate (6.x) on desktop for the optimizer and simulator; both hold the same 21-parameter vector, stored as JSON so an FSRS-7 migration is a data change. Defaults: desired retention 0.90 (0.85-0.95 allowed per course), learning steps `1m 10m`, relearning `10m`, fuzz on, maximum interval 36,500 days or `days_to_exam` when an exam date is set.

Anki mechanics adopted: sibling burying (items of the same concept are not shown twice in one session), fuzz with load balancing, easy days, leech detection at 8 lapses (the item is suspended and flagged for rewrite by the item writer with the learner's error history as input).

### 5.2 What gets scheduled

Items, not concepts. FSRS needs one 4-level rating per review of an atomic prompt with a consistent answer. Free-response items are kept atomic (one concept, one target answer) and graded to a rating; concept-level and checkpoint results are layered above.

### 5.3 Queue construction

```
intraday learning (due now)
→ interday learning
→ reviews: due ≤ today, order (due, random); overdue backlog ordered by retrievability ascending
→ new items only if the review gate passes
```
Limits: `reviews_per_day` (default 120), `new_items_per_day` derived from lesson activation (a lesson activates ~15-30 items). Sibling burying is applied at queue build time.

### 5.4 The review gate

```
debt      = max(0, due_reviews_today − reviews_per_day)
gate_open = due_reviews_remaining_today == 0 && debt_carried_over_days < 3
```
When the gate is closed the lesson card is locked and shows the shortfall in items and minutes (from the simulator's per-item time estimate). When a backlog spans more than three days the app switches to **recovery mode**: it caps the session, orders by lowest retrievability first, hides the lesson entirely, and shows the projected days to clear. The new-item rate is the lever that prevents the abandonment spiral, so recovery mode also halves lesson activation for a week after the debt is cleared.

A learner can override the gate once per day ("I'm about to be in a lecture on this; let me preview"). Overrides are logged and shown on the progress screen. There is no permanent off switch; that is the product.

### 5.5 Concept mastery and gating

```
retention(c)   = mean over items i∈c of R_i(now)                  # FSRS retrievability
mastery(c)     = retention(c) × min(1, successful_sessions(c)/3)  # successive relearning
available(c)   = ∀ p ∈ prereq(c): mastery(p) ≥ 0.7
mastered(c)    = mastery(c) ≥ 0.85 && unassisted_pass_rate(c) ≥ 0.8
```
Only unaided results (CHECK, reviews, checkpoints, teach-back) increment `successful_sessions`. A session counts once per concept, and two sessions must be on different calendar days (day boundary at 04:00 local, the same convention the optimizer uses).

### 5.6 Implicit credit (FIRe-lite)

When a learner passes an unaided item on concept B, every concept A with an encompassing edge `B → A (w)` receives a synthetic partial review on its due-or-nearly-due items: stability is bumped by `w × (S'_good − S)` and the due date re-derived. Rules: `w ≤ 0.5`; only items in Review state with `R < 0.97`; logged with `source = 'implicit'` and excluded from optimizer training. Failures on B do not penalise A automatically; instead the observer's misconception tag decides whether A's item is queued for tomorrow. This keeps forward progress and review overlapping without corrupting the memory model.

### 5.7 Optimizer

After 400 logged reviews per course (and then monthly), fit FSRS parameters in a worker (web: `@open-spaced-repetition/binding` WASI build; desktop: `fsrs` crate through a Tauri command). Keep the fitted parameters only if their log-loss on the last 20% of reviews beats the defaults. Existing cards are not rescheduled on a parameter change.

---

## 6. Assessment

### 6.1 Item types

| Type | Prompt | Grading | Bloom | Notes |
|---|---|---|---|---|
| `recall` | front → back | self-grade after reveal | remember | Classic card; used sparingly |
| `cloze` | sentence with a gap | self-grade | remember/understand | Made from the learner's own consolidation sentences when correct |
| `explain` | "Explain why/how…" | blind LLM grader, rubric | understand | The workhorse item |
| `apply` | a problem with new numbers/context | blind grader, rubric, optional final-answer exact match | apply | Surface features re-rolled by the item writer on each lapse (variability) |
| `discriminate` | "How does X differ from Y? When would you use each?" | blind grader | analyze | Generated for confusable concept pairs found in the graph |
| `map` | "List the concepts that depend on X and say how" | blind grader against edges | analyze | Map-from-memory as a retrieval task |
| `teachback` | multi-turn, see §3.6 | blind grader post hoc | understand/apply | One per concept |
| `predict` | "Before we look: what do you expect to happen if…" | self-grade after reveal | understand | Used in PRIME and as a curiosity primer (Brod 2019) |

Every item stores: concept id, type, Bloom level, prompt, reference answer (hidden from the tutor), rubric as boolean criteria with evidence expectations, grounding source spans, generator version, and a content hash.

### 6.2 Blind grading

The grader is a separate call that receives only: item prompt, reference answer, rubric criteria, the learner's answer, and the misconception list. It never sees the dialogue. It returns structured JSON:

```json
{ "criteria": [{ "id": "c1", "met": true, "evidence": "quoted from answer" }],
  "score": 0.0-1.0, "misconception_tags": ["…"], "feedback": "criterion-level, explanatory",
  "confidence": 0.0-1.0 }
```
Rating map: `score < 0.4 → Again`, `0.4-0.75 → Hard`, `0.75-0.95 → Good`, `≥ 0.95 && confidence ≥ 0.8 → Easy`. When grader confidence is below 0.7, or the score sits within 0.05 of a boundary, two more samples are drawn and the majority decides (**consensus deferral**); if they disagree the learner is asked to self-grade with the rubric shown. Every grade produces a stored **receipt** so the learner can audit and dispute.

Checklist rubrics with 3-6 binary criteria are used everywhere; holistic 1-10 scores are not (LLM–human agreement drops as granularity rises).

### 6.3 Confidence-weighted answers

Confidence is collected before reveal on every item (1 = guess, 2 = fairly sure, 3 = certain). Calibration is reported as a Brier score and an over/underconfidence bias over the last 200 items, per course and per unit. High-confidence errors are surfaced as "worth your attention" on the progress screen and are prioritised in the next review session; hypercorrection makes them the most fixable errors.

### 6.4 Diagnostic placement

Adaptive over the prerequisite DAG: start at concepts of median depth, ask one `apply` or `explain` item per concept, move deeper on pass and shallower on fail, stop when the frontier is bracketed within one level or after 25 items. Known concepts are seeded with stability 21 days, difficulty 5, state Review, flagged provisional; they are surfaced in review at normal pace and demoted on their first Again.

### 6.5 What counts

Two performance streams are logged: **assisted** (anything answered during DEVELOP/EXTEND with hints visible) and **unassisted** (PRIME, CHECK, reviews, checkpoints, teach-back). Only unassisted results affect mastery. The progress screen shows the gap between the two; a widening gap is the app's early warning that the tutor is doing the work (Bastani's crutch effect).

---

## 7. LLM layer

Model reference used: the Anthropic Claude API (see [research/04-tech-stack.md](research/04-tech-stack.md) §4). The layer is provider-agnostic at the interface, with Anthropic as the first implementation and a local Ollama/llama.cpp provider as a second, optional one for offline use at reduced quality.

### 7.1 Roles and models

| Role | Model (default) | Effort | Output | Purpose |
|---|---|---|---|---|
| **Tutor** | `claude-opus-5` | medium (high in DEVELOP for hard concepts) | streamed text | The dialogue voice |
| **Observer** | `claude-haiku-4-5` | low | structured JSON | After each learner turn: attempt made? which objective advanced? misconception tags? stuck? off-topic? |
| **Grader** | `claude-sonnet-5` (Opus for disputes and checkpoints) | medium | structured JSON | Blind rubric grading with receipts |
| **Architect** | `claude-opus-5` | high | structured JSON, via Batches API | Curriculum build (§8) |
| **Item writer** | `claude-sonnet-5` | medium | structured JSON, via Batches | Item banks, rubrics, surface re-rolls, leech rewrites |
| **Student** (teach-back) | `claude-sonnet-5` | low | streamed text | Plays the naive pupil |

Model IDs are configuration, not code. Structured outputs use the SDK's `messages.parse` with a schema (`output_config.format`); free text uses `messages.stream`. Thinking is adaptive by default; `output_config.effort` is the cost knob. Tutor and student turns stream token-by-token into the UI.

### 7.2 Tutor call anatomy

```
system  (cached, 1h TTL)   : frozen tutor charter (pedagogy rules, voice, constraints)
system  (cached, 1h TTL)   : curriculum context for this lesson — concept definitions,
                             objectives, misconceptions, examples, source excerpts with
                             page refs; NO reference answers for CHECK items
messages[0] user (cached)  : learner model summary (§4) + lesson state
messages[1..] (uncached)   : the dialogue; each learner turn is followed by a short
                             role:"system" control message from the state machine:
                             "phase=DEVELOP hint_level=1 objective=O2 remaining_words=120"
```
The control message is appended as a mid-conversation system message so the cached prefix is untouched. The state machine, not the model, decides phase transitions from observer and grader output. When the lesson script's DEVELOP plan runs out, the tutor is told to run CONSOLIDATE.

Grounding: when a source is loaded, the curriculum context contains the concept's source spans and the tutor is instructed to quote and cite (page or heading) rather than recall from memory; the observer flags any factual claim without a nearby span for the learner ("unsourced").

### 7.3 Guardrails enforced in code

- **Hint ladder**: the state machine tracks `hint_level` and only increments it after the observer records an attempt. The tutor is told the current level and what a hint at that level may contain.
- **Leak detector**: before rendering, the tutor output is checked against the active CHECK item's reference answer (normalised string containment plus a Haiku entailment check when the answer is not a short string). A leak triggers a regeneration with a stricter control message; two leaks fall back to a canned hint.
- **Turn shape**: hard cap on words; more than one question mark outside code triggers a regeneration.
- **Sycophancy suite**: a CI test set of dialogues where the learner pushes back wrongly ("my textbook says…", "please just tell me I'm right"); the tutor must hold position with evidence. Tracked as a release metric.
- **Two attempts before reveal**: on any graded item, the reference is shown only after two attempts or an explicit give-up.
- **Cost guard**: per-day token budget per course; the app degrades to Sonnet for the tutor before it stops.

### 7.4 Transport and secrets

The shared TypeScript LLM package talks to the official Anthropic SDK with an injected `fetch`:

- **Desktop (Tauri)**: a Rust command `llm_fetch` receives `{url, method, headers, body}`, checks the host against an allowlist, adds the API key from the OS keychain (`keyring` crate), performs the request with `reqwest`, and streams the bytes back over a Tauri `Channel`. JavaScript wraps the channel as a `ReadableStream` inside a `Response`. The key never enters the webview; CORS never applies.
- **Web**: the same client points its base URL at a thin proxy (`apps/server`, Hono) that injects the key, enforces a per-user budget, and streams SSE through. A "bring your own key" mode for personal deployments keeps the key in the browser's IndexedDB and sends the direct-browser-access header; it is off by default.
- **Local models**: an `LlmProvider` implementation targeting Ollama's chat endpoint with JSON-schema constrained output, reached through the same `llm_fetch` on desktop.

Prompt caching is verified in tests by asserting `cache_read_input_tokens > 0` on the second turn of a lesson.

Every call logs `{role, model, input_tokens, cache_read, cache_write, output_tokens, cost, latency}` to `llm_calls` for the cost dashboard.

---

## 8. Curriculum generation and the Shelf

### 8.1 Pipeline (the Architect)

```
sources ─▶ ingest ─▶ outline ─▶ concepts ─▶ graphs ─▶ lesson scripts ─▶ items ─▶ freeze
            │          │           │           │            │             │
          chunks    user edits   spans     DAG check     per lesson    per concept
```

1. **Ingest** (`packages/ingest`): PDF via pdf.js (text + outline + page numbers), EPUB via zip + OPF/NCX parsing, DOCX via mammoth, Markdown via remark; OCR fallback with tesseract.js for image pages. Output: chunks with heading path, page range, token count, hash. Embeddings (transformers.js, 384-d) stored as blobs for retrieval; FTS5 for lexical search.
2. **Outline**: with sources, the document's own structure is the prior; the Architect proposes units and lessons and may split or merge chapters. Without sources, the Architect produces a canonical outline for the stated scope and level and lists the assumed textbook-style references; the learner confirms scope on the outline screen.
3. **Concepts**: per lesson, extract 3-5 concepts with objectives (Bloom-tagged), misconceptions, 2-3 varied examples, and source spans (quoted, with page). Concepts must be tractable in one dialogue phase; the Architect is told to split anything bigger.
4. **Graphs**: prerequisite edges with a quoted justification and confidence; encompassing edges with weights. Validation in code: DAG check, cycle breaking by dropping the lowest-confidence edge, topological sort with the source chapter order as tie-breaker. Confusable pairs are detected (shared parent, similar embeddings) to seed `discriminate` items.
5. **Lesson scripts**: per concept: pretest question with isomorph, guiding-question plan (3-6 questions with expected learner responses and the misconception each one probes), a faded worked example, a transfer question, and hint-ladder content for levels 1-3. Reference answers are stored on the item, not on the script.
6. **Items**: 6-10 per concept across types and Bloom levels with checklist rubrics and grounding spans. Item quality is self-checked by a second call that tries to answer the item from the rubric alone and flags ambiguity.
7. **Freeze**: the curriculum is content-hashed; every object has a UUID; the version is written to the Shelf. Units beyond the first two are generated lazily, always two units ahead of the learner, so cost and wait are bounded.

Cost control: steps 3-6 run through the Batches API (50% off) except for unit 1; generation is cached by `(source_hash, prompt_version, model)` per artifact, so re-running a build regenerates only what is missing or changed.

### 8.2 The Shelf

The Shelf is the library of curricula available to start from. It holds:

- **Bundled starter packs** shipped in the repo (`content/packs/*.epistemics`): fully generated and reviewed curricula for a handful of subjects (initial set: linear algebra, probability, microeconomics, classical mechanics, introductory statistics, Python fundamentals, plus one humanities subject to test non-technical rubrics).
- **Your curricula**: everything you have built, with versions.
- **Imported packs**: `.epistemics` files from other people.

A pack is a zip: `manifest.json` (id, version, parent version, content hash, generator versions, source licences), `curriculum.json`, `items.json`, optional `sources/` (only when the licence permits) and `assets/`. Learner state is never inside a pack.

Semantics:
- **Enrol** creates a Course bound to a specific curriculum version.
- **Update** to a newer version re-keys by UUID: unchanged items keep their FSRS state, changed items keep their state but are flagged for a confirmation review, new items are activated when their concept is reached, removed items are archived (their review log stays for the optimizer).
- **Fork** copies a version with `parent_version` set; edits (drop a unit, add examples from your field, regenerate one lesson) are local and can be re-merged by UUID.
- **Publish** (later) pushes a version to a shared registry with a suggest-and-approve loop, the AnkiHub pattern.

"Don't regenerate" is enforced by the cache key, by lazy per-unit generation, and by the Shelf-first onboarding flow: the app searches the Shelf (local, then registry) for a matching subject before offering to build.

---

## 9. Architecture

Stack rationale and versions: [research/04-tech-stack.md](research/04-tech-stack.md).

### 9.1 Shape

One React SPA is the entire UI. In the browser it runs against SQLite-in-WASM on OPFS and a thin proxy for the LLM. On desktop the identical build is loaded by Tauri 2 and talks to native SQLite and the OS keychain through a handful of Rust commands. Everything that differs sits behind one `Platform` interface.

```
apps/
  web/        Vite + React 19 SPA (the only frontend build; Tauri loads its dist/)
  desktop/    src-tauri: Rust commands (db, secrets, llm_fetch, fsrs_optimize), capabilities, migrations, updater
  server/     Hono: /api/anthropic passthrough proxy with auth + budget; (later) sync
packages/
  core/       domain logic: scheduler wrapper, review gate, lesson state machine, mastery, graphs. Pure TS, no DOM.
  db/         Drizzle schema + SQL migrations + DbExecutor interface + repositories
  platform/   Platform interface; platform.web.ts / platform.tauri.ts (lazy-loaded when isTauri())
  llm/        LlmProvider interface; Anthropic provider (official SDK); Ollama provider; prompts; schemas; usage logging
  ingest/     PDF/EPUB/DOCX/MD parsers, chunking, OCR fallback, embeddings worker
  ui/         shadcn (Base UI) components, Streamdown chat renderer, Tailwind preset
content/
  packs/      bundled starter curricula (.epistemics)
  prompts/    versioned prompt files (tutor charter, observer, grader, architect, item writer)
evals/        pedagogy, sycophancy, leak, grader-agreement test sets and runners
```

```ts
interface Platform {
  db: DbExecutor;                 // run(sql, params, method) → rows; batch(); migrate()
  secrets: { get(k): Promise<string|null>; set(k, v): Promise<void> };
  llmFetch: typeof fetch;         // injected into the Anthropic client
  files: { pickAndRead(accept): Promise<File[]> };
  workers: { spawn(name): Worker }; // embeddings, optimizer
  updater?: { check(): Promise<UpdateInfo|null> };
}
```

### 9.2 Data layer

Drizzle ORM with the `sqlite-proxy` driver over `DbExecutor`. Desktop executor: `tauri-plugin-sql` initially (zero Rust), replaced by a `rusqlite` command when FTS5/sqlite-vec or custom functions are needed. Web executor: `@sqlite.org/sqlite-wasm` in a dedicated Worker on the `opfs-sahpool` VFS (works in Safari/WKWebView without cross-origin isolation), one owner tab via Web Locks, in-memory fallback for private mode. Migrations are SQL files generated by drizzle-kit and applied by both executors.

Schema is sync-ready from day one: UUIDv7 keys, `updated_at`, soft-delete tombstones, an `outbox` change table. Sync itself is out of scope for v1.

### 9.3 Core tables

```
curricula(id, version, parent_version, title, subject, content_hash, manifest_json, frozen_at)
units(id, curriculum_id, ordinal, title, summary)
lessons(id, unit_id, ordinal, title, script_json)
concepts(id, lesson_id, ordinal, name, definition, objectives_json, misconceptions_json, examples_json)
concept_edges(id, curriculum_id, from_id, to_id, kind: prereq|encompasses, weight, justification, confidence)
sources(id, curriculum_id, title, kind, hash, licence, page_count)
chunks(id, source_id, ordinal, heading_path, page_start, page_end, text, token_count, hash, embedding BLOB)
concept_spans(concept_id, chunk_id, start, end, quote)
items(id, concept_id, type, bloom, prompt, reference_json, rubric_json, spans_json, generator_version, hash)

courses(id, curriculum_id, curriculum_version, goals_json, settings_json, created_at)
cards(id, course_id, item_id, state, due, last_review, stability, difficulty, scheduled_days,
      learning_steps, reps, lapses, suspended, provisional)
review_log(id, card_id, review_time, rating, state_before, elapsed_days, scheduled_days,
           stability, difficulty, duration_ms, confidence, source: review|lesson|checkpoint|implicit|manual)
concept_state(course_id, concept_id, mastery, successful_sessions, last_success_day, misconceptions_json,
              assisted_pass, assisted_n, unassisted_pass, unassisted_n)
sessions(id, course_id, type, started_at, ended_at, summary_json)
turns(id, session_id, ordinal, role, content, phase, hint_level, observer_json, tokens)
receipts(id, session_id, item_id, answer, confidence, grade_json, rating, disputed)
jol(id, session_id, concept_id, predicted_recall, actual_outcome, checked_at)
fsrs_params(course_id, w_json, desired_retention, optimized_at, n_reviews, logloss)
llm_calls(id, session_id, role, model, input_tokens, cache_read, cache_write, output_tokens, cost_usd, latency_ms, created_at)
settings(key, value_json)
```

### 9.4 Session engine

`packages/core/session/` holds the lesson state machine as a pure reducer: `(state, event) → (state, effects)`, where events are learner turns, observer results, grader results and timeouts, and effects are "call tutor with control X", "grade item Y", "activate items", "log review". The UI and the LLM package execute effects. This makes the pedagogy unit-testable with scripted learners and lets the eval suite replay real sessions.

### 9.5 Web vs desktop differences, contained

| Concern | Web | Desktop |
|---|---|---|
| Database | sqlite-wasm on OPFS, worker | native SQLite via Rust |
| API key | proxy server (or BYOK in IndexedDB) | OS keychain, never in JS |
| LLM transport | fetch → proxy | `llm_fetch` command → reqwest → Channel |
| Optimizer | WASI binding in a worker | `fsrs` crate in a command |
| Files | `<input type=file>` | dialog plugin + fs plugin |
| Updates | deploy | updater plugin, signed |
| Routing | browser history | hash history |

Everything else, including the entire UI, the session engine, the scheduler, the prompts, ingestion, and embeddings, is the same code.

---

## 10. UX surface

The visual system — wallpaper and window materials, colour, elevation, the type ramp, and the component rules — is specified in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

Screens (all keyboard-navigable; chat and cards render Markdown with KaTeX and highlighted code):

0. **First run** ([ONBOARDING.md](ONBOARDING.md)): one focused column, four derived steps — what to learn, what you already know, who the tutor is, how much time a day and the review-gate contract. It takes the whole window, and it is the only screen that is a form before it is a conversation.
1. **Today**: warm-up, review queue with debt meter, next lesson (locked/unlocked with reason), checkpoint, teach-back suggestions, streak of *reviews cleared* (not days opened).
2. **Lesson**: one column — the conversation, a line naming the current phase (PRIME → CHECK), and a disclosure holding the concept's definition, objectives, examples and source excerpts with citations. In PRIME, PROBE and CHECK, the phases the learner answers with no help, there is no disclosure to open at all, only a line saying why: nothing on screen may hold the answer to the question being asked. A "give up" button costs the item a rating of Again.
3. **Review**: one item at a time; confidence buttons before reveal; rating buttons after; receipt drawer for LLM-graded items with dispute.
4. **Checkpoint**: distraction-free, no side panel, progress only.
5. **Course map**: the prerequisite graph coloured by mastery, with retention forecast per unit; click to see items and receipts. Doubles as the map-from-memory exercise when items are hidden.
6. **Shelf**: bundled, mine, imported; enrol, fork, update, export.
7. **Course setup**: source picker, scope interview, outline editor, build progress, diagnostic.
8. **Progress**: unassisted vs assisted trend, calibration (Brier, bias), high-confidence errors list, review-debt history, forecast of daily load, cost this month.
9. **Settings**: provider and keys, models per role, desired retention, daily limits, easy days, data export/import (full SQLite backup).

---

## 11. Metrics that define success

Product metrics are chosen to be hard to game by the tutor doing the work:

- **Unassisted CHECK pass rate** per lesson (target ≥ 0.75 on first attempt after DEVELOP).
- **Predicted vs actual retention**: FSRS log-loss on reviews (calibrated scheduler) and 7/30-day recall on `explain` items.
- **Assisted–unassisted gap** (should be small and shrinking).
- **Review debt**: days with carried debt per month (target < 4).
- **Calibration**: Brier score trend.
- **Time and cost per mastered concept.**
- **Tutor quality** (offline evals): pedagogy rubric adherence, leak rate, sycophancy resistance, grader agreement with a human-labelled set (target QWK ≥ 0.85).

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Curriculum generation quality varies by subject; prerequisite edges wrong | Source chapter order as prior; edge justifications; outline editor; per-unit lazy build so errors are caught early; bundled packs are human-reviewed |
| Tutor gives answers or drifts over long dialogues | State machine owns control; leak detector; turn caps; learner model injected each turn; eval suite in CI |
| Grader unreliable on open answers | Checklist rubrics, consensus deferral, receipts and disputes, Opus for checkpoints, human-labelled agreement set |
| Cost | Caching (1h TTL during lessons), Haiku observer, Batches for generation, lazy units, per-day budget with degradation |
| Review-gate friction drives abandonment | Debt meter with time estimate, recovery mode, one override per day, halved activation after recovery |
| Browser storage limits and Safari OPFS quirks | `opfs-sahpool` VFS, single owner tab, export/backup, desktop as the primary target for large corpora |
| Model and API drift | Model IDs and prompts are versioned config; prompt files in `content/prompts` with changelogs; eval suite reruns on model change |
| Copyrighted sources in shared packs | Packs carry licences; sources are excluded from packs unless permitted; spans are short quotes |

---

## 13. Non-goals for v1

Multi-device sync, accounts and multi-user, mobile builds, a public pack registry, voice, collaborative study, and any gamification beyond the reviews-cleared streak. The schema and the Platform interface are designed so none of these require a rewrite.

---

## 14. Open questions

1. Should `apply` items with numeric answers use a sandboxed evaluator (math.js / Pyodide) for exact matching before the LLM grader? Likely yes for STEM packs; defer until the grader agreement set shows where it fails.
2. How aggressive should implicit credit weights be? Start at 0.3 and measure whether encompassed items' actual recall diverges from FSRS prediction.
3. Whether to let the learner add their own notes as extra source spans (SuperMemo-style incremental reading) in v1 or v2.
