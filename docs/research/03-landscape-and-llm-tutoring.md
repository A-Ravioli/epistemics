# Research: landscape of learning tools and LLM tutoring

What to copy, what to avoid. Access note: several primary sources (arxiv.org, justinmath.com, mathacademy.com, nature.com, pnas.org, vendor blogs) were unreachable during research, so some items come from search snippets and secondary summaries; the shakier ones are flagged. GitHub star counts are as of 2026-09-16.

## 1. Products: mechanics worth copying

**Math Academy** (the closest existing analogue to the target app; Justin Skycak's writing)
- Two graphs, not one: a *prerequisite* graph used forward for mastery learning ("knowledge frontier" = topics whose prerequisites are all known) and an *encompassing* graph used backward for spaced repetition credit. Prerequisites are not always implicitly practiced, so a single graph can't do both jobs. The encompassing graph is hand-encoded by a domain expert. [FIRe post](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)
- **FIRe (Fractional Implicit Repetition)**: a repetition on an advanced topic trickles fractional credit down to encompassed subskills (discounted, because those reps are usually "too early" to count fully). Failures propagate too. **Spaced Repetition Compression**: when choosing the next task, prefer lessons/reviews whose implicit reps "knock out" other due reviews, and postpone reviews that would come due soon anyway. Net effect: forward progress and review happen in the same problem.
- Diagnostic: adaptive; courses have 500–1,000 topics, and the question selector picks the topic whose result carries the most information about the knowledge profile. [How our AI works](https://www.mathacademy.com/how-our-ai-works) (from snippets)
- Lesson anatomy (from reviews, e.g. [Oz Nova](https://newsletter.ozwrites.com/p/a-balanced-review-of-math-academy), [OpenEd](https://opened.co/blog/math-academy-review-shoe-tying-method)): intro slides → 3–4 *knowledge points*, each = worked example + 2–3 similar problems. Fail a KP → fail the lesson; the system moves you to other lessons and returns later. Task types: lesson, review, quiz, *multistep* (8–12 scaffolded questions applying several prior skills). XP is awarded per completed task, scaled by performance, and is the daily goal unit. Dissimilar topics are interleaved to reduce interference.
- Lesson for the app: the **content is fixed and hand-authored**; only *sequencing* is adaptive. That is why it never "regenerates".

**Anki / FSRS** — FSRS models each card with Difficulty, Stability, Retrievability; parameters fit per user; default desired retention 90%; ~15–20% fewer reviews than SM-2 for equal retention. Libraries: [fsrs4anki](https://github.com/open-spaced-repetition/fsrs4anki) 4.1k stars, [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 791, [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs) 490, [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) 425. Use ts-fsrs/fsrs-rs directly; don't reinvent the scheduler. FSRS has no notion of prerequisites; FIRe-style credit propagation must sit on top.

**SuperMemo incremental reading** — an article is an element; *extracts* become child elements on the same reading schedule; cloze deletions are made *incrementally*; a global **priority queue** with auto-sort and auto-postpone keeps overload from stalling top-priority material. [Incremental reading](https://help.supermemo.org/wiki/Incremental_reading), [Priority queue](https://help.supermemo.org/wiki/Priority_queue). The priority-with-postponement idea is directly applicable to "review debt" before new learning.

**RemNote** — notes are the source of truth, cards are generated from them; user picks SM-2 or FSRS; sharing is read-only documents, no versioned deck semantics.

**Quantum Country / Orbit (Matuschak, Nielsen)** — prompts interleaved every few hundred words. Readers were randomized to first-interval schedules of 1w/2w/1m/2m; once the median reader recalled an answer after any delay, recall over the following year was ~95%. Half an hour of practice bought ~2-week retention, 1.5 h bought ~9 weeks. [How to write good prompts](https://andymatuschak.org/prompts/), [Orbit repo](https://github.com/andymatuschak/orbit) 1.8k stars (research vehicle, last push Oct 2024). Open problems Matuschak names: prompts test recall, not application; no adaptation to reader background; no intervention when a reader struggles. Those are exactly the gaps an LLM tutor fills.

**Duolingo** — HLR: p = 2^(−Δ/h) ([Settles & Meeder ACL 2016](https://research.duolingo.com/papers/settles.acl16.pdf)). **Birdbrain** jointly estimates learner ability and exercise difficulty (IRT-like); the *course structure is fixed* with a pool of exercises per lesson, and a Session Generator picks which exercises to show. [Birdbrain post](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/). Lesson: fixed curriculum + generated-once item pool + per-session adaptive selection.

**Brilliant** — lesson = one concept, 5–15 min, a sequence of interactive problems each with answer-specific feedback; no spaced repetition, no mastery gating.

**Khanmigo** — GPT-4 plus prompts; the key engineering fix was making it *retrieve the human-written hints/steps/solutions for the exercise before responding* ([Khan blog](https://blog.khanacademy.org/khanmigo-math-computation-and-tutoring-updates/)). Teacher-authored prompt study: "no direct answers" was the most common teacher-added guardrail ([arXiv 2604.16738](https://arxiv.org/pdf/2604.16738)). The sobering 2026 result: Oreopoulos & Low's two-year school experiment: 96% of students tried it, but the median student messaged on a third of practice days and in only 17% of sessions where they made an error ([NBER w35620](https://www.nber.org/papers/w35620)). **Optional chat sidebars don't get used; the tutor has to be *the* path, not a helper.**

**OpenAI Study Mode (Jul 2025)** — entirely a system prompt; extracted copies at [TheBigPromptLibrary](https://github.com/0xeb/TheBigPromptLibrary/blob/main/SystemPrompts/OpenAI/chatgpt_study_mode_07292025.md). Rules: ask goals/level first; build on existing knowledge; guide with questions/hints/small steps; check and reinforce; vary rhythm; keep turns brief, one question per turn; quizzes one question at a time with two attempts before revealing; "DO NOT GIVE ANSWERS OR DO HOMEWORK". Useful baseline, but no learner model, no curriculum, no scheduler.

**Google LearnLM / Gemini Guided Learning** — see section 2. Guided Learning shipped Aug 2025 with quizzes, diagrams and videos inline.

**Anthropic Claude Learning mode** — Socratic style; in Claude Code, learning mode stops and leaves a `#TODO` for the user to write 5–10 lines. Interesting pattern: *partial completion as the assessment*.

**Oboe** — prompt → course (chapters, text, audio, quizzes, flashcards); generation-first, no mastery gating or review enforcement; a shelf of shared courses is implied but not versioned.

**Open source (stars as of today)**
- [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) 39.8k, Apache-2.0: pluggable RAG engines, parsers (MinerU, Docling, Tika), quiz gen, "guided learning / mastery path", three-layer memory. Not explicitly Socratic; no dedicated SR scheduler.
- [nagisanzenin/engram](https://github.com/nagisanzenin/engram) 1.4k, MIT, Claude Code plugin: "architect" builds curriculum by *chains of necessity* (threshold concepts) rather than chapter order; **blind assessor** grades free recall against rubrics with no access to the tutoring dialogue and writes a "receipt"; FSRS-4.5 fitted per user; deterministic Python core for calendar math; reports QWK 0.978 against its gold set. This is the closest architecture to the brief.
- [plastic-labs/tutor-gpt](https://github.com/plastic-labs/tutor-gpt) 931, GPL-3: Socratic tutor that maintains a theory-of-mind model of the student.
- [learningequality/kolibri](https://github.com/learningequality/kolibri) 1.1k: offline platform; content is published as versioned *channels* and imported wholesale.
- [zijinz456/OpenTutor](https://github.com/zijinz456/OpenTutor) 112: upload → notes/quizzes/flashcards/tutor; FSRS extended with KG-aware prioritization.
- [eth-lre/mathtutorbench](https://github.com/eth-lre/mathtutorbench), [umass-ml4ed/dialogue-kt](https://github.com/umass-ml4ed/dialogue-kt) (LAK 2025 dialogue knowledge tracing).

## 2. LLM Socratic tutoring: evidence and patterns

**Bastani et al., PNAS 2025** ([paper](https://www.pnas.org/doi/10.1073/pnas.2422633122)): ~1,000 Turkish high-schoolers, three arms. GPT Base raised practice scores 48%, GPT Tutor 127%. On the unassisted exam GPT Base scored **17% below control**; GPT Tutor was ≈ control. GPT Tutor's prompt: give hints, never the answer, and include *teacher-written common mistakes and feedback*. Takeaway: guardrails remove the harm, but hint-giving alone doesn't produce gains.

**Kestin et al., Sci. Reports Jun 2025** ([paper](https://www.nature.com/articles/s41598-025-97652-6)): 194 Harvard physics students, crossover vs. best-practice active learning. Median learning gains >2x, in less time. Design: prompts *enriched with complete step-by-step solutions* for each problem, lesson split into chunks, active learning, cognitive load management, growth mindset, one step at a time. Caveats: single course, immediate post-test, tutor had the answer key.

**Tutor CoPilot (Wang et al., 2024)** ([arXiv 2410.03017](https://arxiv.org/abs/2410.03017v2)): RCT with ~783 human tutors; students +4 pp topic mastery, +9 pp for lower-rated tutors; more probing questions, less generic praise.

**LearnLM (Dec 2024, [arXiv 2412.16429](https://arxiv.org/abs/2412.16429))**: reframes pedagogy as *pedagogical instruction following*: the system prompt states the desired pedagogy and the model is trained to obey it. Rubric: five principles (inspire active learning, manage cognitive load, deepen metacognition, stimulate curiosity, adapt to the learner) expanded into 29 rubric questions. **Eedi RCT (Dec 2025, [arXiv 2512.23633](https://arxiv.org/abs/2512.23633))**: N=165 UK secondary, human tutor alone +4.5 pp, human+LearnLM +10 pp.

**MathTutorBench (EMNLP 2025, [arXiv 2502.18940](https://arxiv.org/abs/2502.18940))**: 3 skills / 7 tasks (problem solving, Socratic questioning; solution correctness, mistake location, mistake correction; scaffolding generation, pedagogy adherence). Findings: solving ability does not transfer to teaching; simple questioning strategies break down in *longer* dialogs. **PEARL (May 2026, [arXiv 2605.29582](https://arxiv.org/abs/2605.29582))**: RL for Socratic tutors with a student simulator whose latent misconceptions are decoupled from response generation.

**Other 2025–26**: a 2026 endodontics RCT (n=79) found LLM Socratic case analysis ≈ faculty-led CBL (parity not superiority); dialogue knowledge tracing (LLMKT) annotates each tutor/student turn with knowledge components and correctness and beats DKT/AKT ([LAK 2025](https://dl.acm.org/doi/10.1145/3706468.3706501)).

**Prompt patterns with support**
- Give the tutor the *reference solution and known misconceptions* (Kestin, Bastani, Khanmigo). Accuracy comes from grounding, not from the model.
- One question per turn; short turns; check-and-restate after hard parts (Study Mode; LearnLM cognitive-load rubric).
- Hint ladder with a constraint layer *outside* the prompt: orientation → instrumental → worked-example → bottom-out (partial, never the full answer), and release the next level only after an observed attempt ([hint levels](https://arxiv.org/pdf/2404.02213)).
- Diagnose before remediating: classify the error, then target it.
- Separate roles: tutor, grader, planner (engram's blind assessor).

**Failure modes**
- Sycophancy under social pressure: "my notes say I'm right" and "please don't tell me I'm wrong" cause capitulation ([EduFrameTrap 2026](https://arxiv.org/abs/2605.14604)). Treat as a safety metric and test for it.
- Over-help: leaking the full solution early kills productive struggle (Bastani's crutch effect).
- Wrong feedback / hallucinated facts when ungrounded (Khanmigo's fix).
- Long-dialog drift; no persistent learner state (MathTutorBench; [LOOM](https://arxiv.org/html/2511.21037)). Keep mastery state outside the context window and inject a summary each turn.
- Turn length and "teacher voice" bloat.
- Non-use when optional (Khanmigo 17%).

## 3. Curriculum generation from a textbook/syllabus

- **Parsing**: [Docling](https://github.com/docling-project/docling) (66.5k stars, MIT) outputs a hierarchical document with page numbers and heading paths; its HybridChunker walks the tree, one chunk per item under its heading path ([chunking docs](https://docling-project.github.io/docling/concepts/chunking/)). [Marker](https://github.com/datalab-to/marker) (39.8k) has the best multi-column reading order and reads EPUB directly. [Unstructured](https://github.com/Unstructured-IO/unstructured) (15.4k). These are Python; in a browser/Tauri app use pdf.js for extraction and rendering of cited passages, with an optional Docling/Marker sidecar on desktop for hard PDFs.
- **Concept/prerequisite extraction**: [K12-KGraph (2026)](https://arxiv.org/html/2605.09635v1) is the reference pipeline: LLM extraction per section → hierarchical merge → **DAG validation** on prerequisite and taxonomy edges; node types Concept/Skill/Exercise/Section/Chapter. An [evidence-linked curriculum KG](https://link.springer.com/chapter/10.1007/978-3-032-29744-0_32) distinguishes prerequisite skills from outcome skills per module and keeps the source span for each edge.
- Practical recipe: (1) extract candidate concepts per section with source spans; (2) ask for prerequisite edges *with a quoted justification*; (3) topologically sort, break cycles by dropping lowest-confidence edges; (4) keep the textbook's own chapter order as a prior and only reorder when the graph demands it; (5) treat the graph as content to be reviewed and versioned.
- **Grounding**: retrieve per-concept chunks and require sub-sentence citations that can be highlighted in the source; run a cheap post-hoc check that each factual claim is entailed by a cited chunk. Never let the tutor cite from parametric memory when a source is loaded.

## 4. Assessment with LLMs

- Reliability: fine-grained **checklist rubrics beat holistic ones** for LLM–human agreement ([EDM 2025](https://educationaldatamining.org/EDM2025/proceedings/2025.EDM.long-papers.80/index.html)); [Rubric-conditioned grading (Jan 2026)](https://arxiv.org/abs/2601.08843): alignment strong for binary decisions, degrades as rubric granularity rises; **consensus deferral** (sample N times, only auto-grade on supermajority) yields a tunable accuracy/coverage curve. Engram's blind assessor with per-grade receipts reports QWK 0.978.
- Design: grader is a separate call that receives question, reference answer, rubric as boolean criteria, and the student's answer, and returns a JSON schema (`criteria[]: {id, met, evidence_quote}`, `score`, `misconception_tags[]`, `confidence`). It never sees the tutoring dialogue; the tutor never sees the rubric's answer text until the grader says the criterion is met.
- **Confidence-weighted answers**: Gardner-Medwin's certainty-based marking (confidence 1/2/3; wrong answers −0/−2/−6) rewards calibrated metacognition ([CBM](https://tmedwin.net/~ucgbarg/tea/innovass4.pdf)). Feed confidence into the scheduler: high-confidence errors are the misconceptions to attack first.
- Question generation: Bloom-level alignment is still weak; generated distractors were rated 2.5/5 for realism ([math MCQ study](https://arxiv.org/pdf/2405.00864)). Generate a bank per concept with explicit level tags, prefer free-response + rubric over MCQ for apply/analyze, and store the grounding span with each item.
- Leakage: pre-generate questions once, grade with the reference hidden from the tutor, and enforce "two attempts before reveal" as a hard rule in code, not prose.

## 5. Reuse and sharing: the "shelf"

- Anki: notes carry a stable GUID; re-importing an updated .apkg updates notes by GUID and preserves the learner's scheduling ([Packaged decks](https://docs.ankiweb.net/importing/packaged-decks.html)). AnkiHub adds subscription, suggested edits, maintainer approval and push updates. Kolibri publishes content as versioned channels. Math Academy and Duolingo keep the curriculum fixed and only adapt sequencing; Duolingo generates a *pool* per lesson once and selects per session.
- Recommended shelf model: a *Curriculum* is an immutable, content-addressed package (source manifest with hashes, concept graph with prerequisite edges and source spans, lesson scripts, question bank with Bloom tags and rubrics, misconception list). Every item has a stable ID; learner state (FSRS memory state, mastery, receipts) is keyed to item IDs, never embedded in the package. Publishing creates a new version; subscribers get diffs keyed by ID, so scheduling survives updates. "Fork" = copy with a `parent_version`. Generation is triggered only for IDs missing from the shelf; a cache key of (source hash, generator prompt version, model) prevents silent regeneration.

## Bottom line for the app
1. Fixed, reviewable, versioned curriculum + adaptive sequencing (Math Academy, Duolingo), not on-the-fly regeneration (Oboe).
2. Two graphs: prerequisites forward, encompassing backward; FSRS per item with FIRe-style credit propagation; review debt gates new lessons via a priority queue with postponement (SuperMemo).
3. Tutor prompt grounded in reference solutions and misconceptions; hint ladder enforced in code; one question per turn; sycophancy tests in CI.
4. Blind rubric grader with structured output, consensus deferral, confidence-weighted answers; receipts drive the scheduler.
5. Make the tutor the only path through a lesson; optional chat gets 17% uptake.
