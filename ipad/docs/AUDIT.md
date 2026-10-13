# Audit: what an "intelligent Khan Academy" would add

Status: October 9, 2026. Reviews the iPad app as built against Khan Academy (Classic and Reimagined), Khanmigo,
ALEKS, Math Academy, Duolingo, Carnegie Learning's MATHia and Eedi, and against the evidence for each
feature. Recommendations are ranked by **strength of evidence × fit with handwriting × cost**.

**Update, October 10, 2026: #1–#4 are built.** Each has a "Built" note below. #5–#8 are still open.

The short version: the app already has most of the machinery that the evidence supports, and Khan's own
newest result is a warning about the rest. The two-year randomised trial of Khanmigo (Oreopoulos & Low,
NBER w35620, Aug 2026) found the AI tutor added **nothing measurable** over Khan practice without it, because
students asked it for help in only 17% of the sessions where they got something wrong. The lesson for
Epistemics is not "more AI". It is: check the work line by line, make every review a fresh problem,
earn mastery on mixed questions, and put the tutor *at the mistake* instead of behind a button.

---

## 1. What the app already does (keep it)

| Khan / others | Epistemics today | Where |
|---|---|---|
| Course challenge, ALEKS knowledge check | Adaptive placement on the prerequisite graph, by hand | `Session/Placement.swift`, DESIGN §6.1 |
| Skill levels and prerequisites | Mastery = retention × spaced sessions; a concept unlocks at 0.7 prerequisite mastery; "mastered" needs ≥ 0.85 and an 80% unaided pass rate | `Scheduler/Mastery.swift` |
| Mastery Challenges (spaced re-practice) | FSRS-6 reviews every day, gated before new lessons. Khan's version is weaker: 6 questions every 12 hours, maths only | `Scheduler/Queue.swift` |
| Interleaving | Sibling burying gives at most one card per concept per session, and review pages never name the concept | `Queue.swift`, `ReviewView` |
| Unit test | Checkpoint paper: mixed and unaided. A missed concept gets a remediation lesson | `CheckpointView`, `Checkpoint.swift` |
| Math Academy's FIRe | FIRe-lite: passing a concept gives implicit credit to what it encompasses | `Scheduler/Implicit.swift` |
| Eedi's misconception diagnosis | Misconception catalogue per concept; the grader tags errors; lessons are told the learner's recent misconceptions | `GradingService`, `LessonSessionModel` |
| Hints and worked examples | Hint ladder, a worked example first for novices, and productive failure (PRIME) for everyone else | `Session/Lesson.swift` |
| Bastani's guard (a tutor that hints, never answers) | Assisted and unassisted are counted apart, and **only unassisted counts towards mastery**. Progress shows the gap | `ProgressScreen` |

Two of these are better than Khan's version and should stay as they are:

- **Mastery decays.** Khan's Mastered drops only if you fail a later exercise. Here mastery is retention, so
  it falls when you stop reviewing.
- **The tutor can't inflate mastery.** Khan plans to let a bot-assisted redo count towards mastery (KQED,
  Sept 2026). Here it never does.

---

## 2. Recommendations, ranked

### 1. Mark the first wrong line, not just the answer (step-level feedback)

**Evidence: strongest.**
- VanLehn's 2011 review found tutors that check each *step* reach d = 0.76, against 0.31 for tutors that
  check only the final answer. That is about the same as a human tutor (0.79). Going finer than a step adds
  nothing.
- MATHia (Cognitive Tutor) is built on this, and its RAND trial found +0.21 SD in high school in year 2.
- CMU's handwriting algebra tutor found that writing by hand gave the same learning in less time. It fell
  back to checking answers only because recognising each step was too hard to build in 2008. The Claude
  Reader removes that obstacle.

**Today:**
- The grader returns rubric criteria with evidence quotes, a score, misconception tags and feedback.
- Blue marks land on whatever each criterion quotes, so a wrong final answer and a wrong step two look the
  same.

**Change:**
- Add `steps: [{ quote, ok, misconceptionTag?, note }]` and `firstError` to `GradeResult`, for items whose
  references have working (`apply`, `sketch`, and `explain` where there is a chain of reasoning).
- `MarkPlacement` puts one numbered blue mark on the first wrong line.
- The receipt leads with *"Your working goes wrong here: …"* before it shows the answer.
- In lessons, the tutor's one blue mark per turn goes to the first wrong step by default.

**Risk:** a misread line looks like a wrong step. Mark only lines in the confirmed reading, and let *"That's
not what I wrote"* (the existing dispute) clear the mark.

**Cost:** medium. Grader schema and prompt, `MarkPlacement`, receipt layout, and fixtures in
`SessionFlowTests`.

**Built.** `GradeResult.firstError` (`StepError`: quote, why, misconception tag) is asked for by an iPad-only
addendum, `Prompts/grader-ink.md`, so the web's `grader.md` stays byte-identical. The grader keeps a first
error only if its quote really is in the answer and, under consensus, only if most samples found one.
`MarkPlacement` draws it as a wavy blue underline (`InkMark.Kind.wrongStep`) on receipts in reviews, lessons
and checkpoints, and the observer's per-turn lesson mark now goes to the first wrong line
(`observer-ink.md` 1.1).

### 2. "Fix it" at the mistake: the tutor comes to the error

**Evidence: moderate, and directly on point.**
- Khanmigo's null result came from not being used at the moment of error: 17% of mistake sessions.
- Kestin et al. (Sci Rep 2025, Harvard physics) got 0.63 SD from a tutor that had **the worked solution in
  its prompt** and guided students part by part.
- Bastani et al. (PNAS 2025) found unrestricted GPT-4 *lowered* exam scores by 17%. A guarded tutor that knew
  the solution removed the harm.

**Today:** after a wrong review, the receipt shows feedback and the reference answer. Nobody helps the
learner fix their own working.

**Change:** after an Again or Hard on a worked item, the receipt opens with the first-error mark (#1) and
*"Fix it from here"*, before the answer is revealed.
- The learner rewrites from that line, under their own ink.
- If they're stuck, the lesson tutor runs 2–4 Socratic turns grounded in the item's reference, worked
  example and misconception catalogue. It never gives the answer.
- The fix is logged **assisted**, so it never counts towards mastery.
- The card stays in its learning step, and the real test is a fresh variant the next day (#3).

**Cost:** medium. Reuses `Tutor` (EpistemicsLLM), the observer's marks and the lesson turn UI.

**Built.** `Screens/Review/FixIt.swift`. The review receipt hides the answer, criteria and earlier attempt,
says *"Your working goes wrong here: …"*, and offers **Fix it from here** or **Show me the answer**.
- The rewrite goes on fresh paper. The grader sees the working up to the wrong line plus the rewrite.
- **I'm stuck** gives up to three tutor questions, grounded in the worked solution, leak-checked, and falling
  back to the pack's hint ladder.
- The fix is an assisted receipt, never touches the card, and never shows as "your previous attempt".
- Once the answer is shown, the rewrite is closed.
- Settings → Developer has a debug-only switch that makes the demo grader mark a wrong answer's first line,
  so the flow can be seen without an API key.

### 3. A fresh problem every review (item variants)

**Evidence: a measurement problem more than a study.** Khan, ALEKS and Math Academy all draw each skill's
questions from a pool, so passing means the skill rather than remembering *that question*.

**Today:** a card is one fixed prompt.
- By the third review a learner can remember the answer to *"A password consists of 3 letters…"* without
  being able to count.
- FSRS then schedules recall of an answer, and mastery overstates the skill.
- The receipt's "You answered this 12 days ago" makes the repetition visible.
- The pack already carries one isomorph per concept (`script.pretest.isomorph`), so the idea is there.

**Change:**
- Add `variants: [{ prompt, reference }]` to `Item`, generated when the pack is built (web generator) and
  verified two ways:
  - two independent model solutions must agree;
  - for numeric answers, a computed check.
- The card stays per item, because the item is the skill.
- The queue serves the least recently used variant, and the receipt compares with the previous attempt *at
  the skill*, not the same prompt.
- Hand-authored packs without variants behave as now.

**Cost:** medium, mostly on the web side (generator and validator). The iPad side is a field and a picker.
It also supplies the extra questions that #2, #4 and #5 need.

**Built.**
- **Data model:** `Item.variants` (`ItemVariant`: id `<itemId>~v<n>`, prompt, reference, rubric), on both
  the web and the iPad.
- **Web generator:** a new architect stage writes two isomorphs per `apply` item. Each is kept only if it
  passes the structural checks and an independent solve, by a second model call that never sees the
  reference, matches its exact answer.
- **Bundled pack:** 116 variants, two for each of its 58 `apply` items, each exact answer recomputed by a
  separate Python checker.
- **Serving:** reviews, checkpoints and progress checks serve the item, then each variant, then whichever
  was seen longest ago (`nextVariant`). The receipt records which (`Receipt.variantId`) and says *"You did
  one like this"* when the previous attempt was a different version.
- **Updates:** a bundled pack whose `contentHash` changed is re-installed, so existing courses get the
  variants.

### 4. Earn "mastered" on mixed questions, and re-check periodically

**Evidence: good.**
- Khan's Mastered is reachable *only* through mixed assessments (unit test, course challenge).
- ALEKS reassesses after about 20 topics and can push topics back.
- Pelánek & Řihák (2017) found that, for mastery decisions, **which data you count and the threshold matter
  more than the model**.

**Today:**
- The unaided pass rate behind `isMastered` counts lesson CHECK answers. Those come straight after teaching
  and are labelled by the lesson.
- Placed-out concepts are only checked when their reviews come due.

**Change:**
- Count only reviews, checkpoints, placement and progress checks towards `unassistedPassRate` for mastery.
  Lesson checks still gate the lesson.
- Add a **progress check** every 4 lessons, or 2 weeks: about 6 mixed, unaided questions over learned and
  placed-out concepts, chosen by the placement engine.
  - A miss demotes the concept, so it is shown again in the queue, and its dependents lock if it falls under
    0.7.
  - It is the iPad's version of Khan's Mastery Challenge and ALEKS's Progress Knowledge Check, and it reuses
    `Placement.swift` almost as is.

**Cost:** small to medium.

**Built.**
- **Mixed evidence:** `ConceptState.mixedPass/mixedN` count unaided answers from reviews, checkpoints,
  placement and progress checks. "Mastered" (`isMasteredOnMixedEvidence`) needs at least two of them and an
  80% pass rate on them.
- **Progress checks:** `Session/ProgressCheck.swift`, `Services/ProgressCheckService.swift` and
  `Screens/Sessions/ProgressCheckView.swift`.
  - **When:** after 4 lessons or 14 days, or 7 days while placed-out concepts are unconfirmed.
  - **What:** 6 questions, prioritising provisional concepts, then the least out-of-context evidence, then
    the lowest mastery, at most 2 per lesson, interleaved so no two in a row come from one lesson.
  - **Passing** counts as a review and as mixed evidence.
  - **A wrong answer demotes:** spaced successes fall to 1, so dependents lock. A placed-out concept is
    un-placed, so its lesson is taught; a taught one gets a remediation lesson.
  - **A right guess** is not a pass, but it does not demote either.
  - Today offers it after reviews, with "Not today".

### 5. When a lesson's check fails, find the broken prerequisite

**Evidence: good for mastery learning in general** (Kulik et al., about 0.5 SD on local tests). Math Academy
is the model: each wrong answer adds required questions, and repeated failure sends the learner back to the
prerequisite most implicated, not the same lesson.

**Today:**
- CHECK is one isomorph question.
- Failing it schedules remediation of **the same concept**. If the real gap is a prerequisite, the learner
  is taught the same thing again.

**Change:**
- CHECK asks 2 questions, plus 1 per miss, up to 4.
- After 2 misses, run a *downward* placement over the concept's prerequisites: the same engine, limited to
  ancestors, 1–3 questions.
- Remediate the deepest prerequisite that fails, then come back.

**Cost:** medium. Needs #3 for enough questions per concept.

### 6. Scaffolding per lesson, with faded examples

**Evidence: mixed but clear in shape.**
- Productive failure (Sinha & Kapur 2021) gives g = 0.36 for conceptual knowledge, *when followed by
  consolidation*.
- It reverses for younger learners and for procedural skill in novices, where worked examples win
  (Sweller).

**Today:** the placement now sets scaffolding from evidence, but **for the whole course**. A learner who
knows counting well and has never seen Bayes gets the same scaffolding for both.

**Change:**
- Set the lesson's scaffolding when it starts, from its prerequisites' mastery: novice under 0.7, advanced
  above 0.9.
- For novices, **fade** the worked example on paper. The first steps are typeset, and the learner writes the
  rest by hand: one step fewer each time.

**Cost:** small. `LessonSessionModel.start` plus one DEVELOP sub-step in the reducer.

**Built, October 11, 2026, without changing the reducer** (it is the web's, with conformance tests).
- **`lessonScaffolding`** sets a lesson's support from the mean mastery of the ideas it builds on:
  - novice below 0.8;
  - developing below 0.92;
  - advanced above that;
  - the course's level for a lesson with nothing before it.

  Remediation lessons always start as novice, with the worked example first.
- **`workedExamplePlan` fades the example across a lesson's concepts.**
  - **A novice** studies the first concept's example whole, and each later concept typesets one step fewer.
    The learner writes the remaining steps by hand on the concept card, then compares them with the
    example's, prompted to say what theirs missed.
  - **A developing learner** starts one step further on.
  - **An advanced learner's example** stays folded until they've had a go at the tutor's question.
  - The first step is always typeset.

  See `EpistemicsCore/Session/WorkedExample.swift` and `Screens/Lesson/ConceptCard.swift`.

### 7. Name the misconception, and act on it

**Evidence: small** (Eedi g ≈ 0.10–0.17, vendor-reported). It is cheap, though, because the tags already
exist.

**Change:**
- When a tag repeats on a receipt, say so: *"Same slip as Tuesday: treating P(A|B) as P(B|A)."*
- Show the top repeating tags in Progress beside "Worth your attention".
- Let remediation pick a variant (#3) that targets the tag.

**Cost:** small.

### 8. Smaller things

- **Borderline placement.** A pass graded Hard, or answered "Guessing" but correct, becomes *conditionally
  known*, like Math Academy's "conditionally completed". Seed stability at 7 days instead of 21 so it is
  checked sooner. Small.
- **Plain mastery words.** The course map says *"64% · 2 of 3 spaced successes"*. Khan's *Familiar,
  Proficient, Mastered* are easier to read. Dashboards don't improve achievement (Kaliisa et al. 2024, 38
  studies), so this is legibility only. Small.
- **A finish date.** Math Academy's projected completion date at the current pace is a cheap,
  non-gamified reason to keep the daily minutes. Khan's own data says dosage is what separates outcomes,
  and only 9% of students reach it. Small.
- **Mix problem types in reviews.** Reviews already mix concepts. Rohrer et al. 2020 (d = 0.83) is about
  mixing problem *types* that need a choice of strategy. Order reviews so that consecutive cards come from
  different units where possible, and use the `discriminate` items the pack already has. Small.

---

## 3. What not to build

- **Points, gems, leaderboards, live class games.** Engagement lifts are 0.5–3% and come from the vendors
  themselves, with no learning outcome. The daily gate and the streak line are enough.
- **A fancier learner model** (BKT, deep knowledge tracing). On data this size, logistic regression or a
  tuned rule matches them (Gervet et al. 2020). Thresholds and the evidence counted (#4) matter more.
- **A chat box for the tutor.** Khanmigo shows students don't open it. The tutor belongs in the receipt at
  the mistake (#2) and in the lesson, nowhere else.
- **Counting assisted redos towards mastery.** This is what Khan is moving towards, and it is the thing the
  unassisted line exists to prevent.

---

## 4. Suggested order

1. ~~**#1 + #2 together:** the first-wrong-line mark and "Fix it from here".~~ Built.
2. ~~**#3 variants**, because #4 and #5 need them.~~ Built.
3. ~~**#4 mixed mastery and progress checks.**~~ Built.
4. **#5 prerequisite diagnosis when a check fails.** Next: variants now give each concept enough questions.
5. ~~**#6** scaffolding per lesson with faded examples.~~ Built. **#7 and #8** remain as small follow-ups.

Not yet tried against a real model: whether Claude finds the *first* wrong line reliably on handwritten
working, and how often a misread line gets marked. Both should be measured on real ink before #1 is trusted;
the dispute button is the escape hatch meanwhile.

---

## Sources

- Khan Academy Help Center: mastery levels; course mastery % (Aug 2026); Mastery Challenges. Khan blog: Khan
  Academy Reimagined (Oct 2025, launched July 2026); Khanmigo maths accuracy updates (2025); efficacy
  (2022–23, vendor and correlational).
- Oreopoulos & Low, *NBER w35620* (Aug 2026), the Khanmigo randomised trial. Coverage in Hechinger, KQED and
  FutureEd, Sept 2026.
- Bastani et al., *PNAS* 2025. Kestin et al., *Scientific Reports* 2025. Google LearnLM + Eedi, arXiv
  2512.23633.
- VanLehn, *Educational Psychologist* 2011. Kulik & Fletcher, *RER* 2016. Pane et al., RAND 2014 (MATHia).
  Anthony, Yang & Koedinger, the CMU handwriting algebra tutor.
- ALEKS: Fang et al. 2019; Sun et al. 2021. Math Academy: *How our AI works* and Justin Skycak on FIRe (no
  independent efficacy study).
- Pelánek & Řihák 2017; Gervet et al., *JEDM* 2020.
- Rohrer et al. 2020 (interleaving); Sinha & Kapur, *RER* 2021 (productive failure); Sailer & Homner 2020
  (gamification); Kaliisa et al. 2024 (dashboards).
- Eedi: EEF trial; company-reported randomised trial.
