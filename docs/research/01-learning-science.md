# Research: the empirical science of human learning

Evidence summary compiled to inform Epistemics' design. Evidence-strength key: **Strong** = multiple meta-analyses or large RCTs, replicated across materials; **Moderate** = consistent lab evidence, some classroom replication, known moderators; **Weak/Contested** = few direct studies, small samples, or mixed results. Some primary sources were unreachable during research; figures taken from secondary summaries and abstracts are flagged "(via summary)".

---

## 1. Dunlosky et al. (2013), *Psych. Science in the Public Interest* 14(1): rankings of 10 techniques

| Utility | Technique | Why |
|---|---|---|
| **High** | Practice testing | Robust across ages, materials, delays, transfer; cheap |
| **High** | Distributed practice | Robust; large literature (Cepeda 2006) |
| Moderate | Interleaved practice | Strong for math/category learning, less evidence elsewhere at the time |
| Moderate | Elaborative interrogation ("why is this true?") | Works, but depends on prior knowledge; limited materials/delay evidence |
| Moderate | Self-explanation | Works across tasks, but time-costly and few long-delay studies |
| Low | Summarization | Requires training to be effective |
| Low | Highlighting/underlining | No benefit; can hurt inference questions |
| Low | Keyword mnemonic | Narrow (concrete vocabulary), benefits fade |
| Low | Imagery for text | Narrow, inconsistent |
| Low | Rereading | Students' favorite; small, fading benefit vs testing |

**Strength:** Strong (a synthesis of hundreds of studies; ratings still hold in 2026, with interleaving arguably upgraded since).
**Design implication:** Build the core loop from testing + spacing; use interleaving/self-explanation/elaborative interrogation as tutor moves; never present highlighting or rereading as study modes.

## 2. Retrieval practice / testing effect

- Roediger & Karpicke (2006, *Psych. Science*): after 1 week, study-then-test retained 56% vs study-study 42%; repeated testing (STTT) beat repeated study (SSSS) at 1 week despite worse immediate performance. Karpicke & Roediger (2008, *Science*): repeated retrieval to criterion produced ~80% vs ~36% one week later; dropping items once recalled wrecked retention.
- Karpicke & Blunt (2011, *Science*): free-recall retrieval practice beat concept mapping by ~50% on a 1-week delayed test, including inference questions; students predicted the opposite.
- **Rowland (2014, *Psych. Bulletin*)** meta-analysis: g = 0.50 for testing vs restudy; **feedback moderates strongly (g = 0.73 with feedback vs 0.39 without)**; free recall > cued recall > recognition as the practice format; effect grows with retention interval.
- **Adesope, Trevisan & Sundararajan (2017, *RER*)**: 272 effects; g = 0.61 overall; 0.51 vs restudy, 0.93 vs no activity; MC and short-answer formats both work; multiple test sessions and feedback help.
- **Pretesting / errorful generation**: Kornell, Hays & Bjork (2009); Richland, Kornell & Kao (2009): guessing before learning (even wrongly) improves later recall of the tested items; Pan & Carpenter (2023, *Ed. Psych. Review*) review >60 papers and find the effect robust across word pairs, texts, and video lectures, but benefits concentrate on the pretested content (limited spillover). A 2026 AIED retention study (Akgun & Toker) found AI-adaptive pretesting gains persisted only when followed by structured spaced retrieval, not learner-directed AI chat.

**Strength:** Strong (the best-replicated finding in the field).
**Design implication:** Every session should open with a retrieval attempt (including a pretest question on new material) before explanation; prefer free-recall/short-answer prompts graded by the LLM over recognition; always follow with feedback; keep items in rotation after first success.

## 3. Spacing and optimal lag

- Cepeda et al. (2006, *Psych. Bulletin*): 254 studies; spaced > massed at every retention interval, and the optimal gap grows with the retention interval.
- Cepeda et al. (2008, *Psych. Science*): 1,350 participants, gaps up to 3.5 months, tests up to 1 year: optimal gap ≈ 20-40% of a 1-week retention interval, falling to ≈ 5-10% of a 1-year interval (roughly 1 day for a 1-week test; ~3 weeks for a 1-year test). Too-long gaps degrade performance only gradually; too-short gaps are worse.
- **Expanding vs uniform**: Karpicke & Roediger (2007) found expanding helps short-term, equal-interval helps long-term; **Karpicke & Bauernschmidt (2011, *JEP:LMC*)**: what matters is absolute spacing, not expanding vs uniform (spaced retrieval yielded ~200% better long-term retention than massed retrieval). Kornell (2009): one big flashcard stack (spaced) beat four small stacks (massed) and cramming.
- Algorithms: Settles & Meeder (2016, ACL) half-life regression at Duolingo cut prediction error ~45% vs baseline and raised engagement 12%; open-source FSRS benchmarks (open-spaced-repetition, 2023-26, Anki data) show FSRS beats SM-2 on calibration/log-loss. These are engineering evaluations, not learning RCTs.

**Strength:** Strong for spacing; Moderate for exact scheduling (schedule shape matters less than "long enough gaps with retrieval").
**Design implication:** Use a memory-model scheduler (FSRS/HLR-style) targeting recall probability ~0.8-0.9 at review; let the user's target date drive gap length (gap ≈ 10-20% of time-to-goal); don't fetishize expanding intervals.

## 4. Interleaving

- Rohrer & Taylor (2007): interleaved math practice tripled test scores (63% vs 20%, d = 1.34). Rohrer, Dedrick, Hartwig & Cheung (2020, *J. Ed. Psych.*): 787 students, 54 classes, one-month delayed test: 61% vs 37%, **d = 0.83**.
- **Brunmair & Richter (2019, *Psych. Bulletin*)** meta: 59 studies, g = 0.42 overall; large for visual/category materials (paintings g = 0.67), small for math (g = 0.34), null for expository text, and **blocking was better for word/vocabulary learning (g = -0.39)**. Interleaving helps when categories are confusable (discriminative contrast); blocking helps when learners must first extract a within-category structure or materials are dissimilar (Carvalho & Goldstone 2014). Sana & Yan (2022, *Psych. Science*) show interleaved *retrieval* works in science classrooms.

**Strength:** Strong for problem-type discrimination (math, categories); Moderate/contested for text and vocabulary.
**Design implication:** Mix review items across topics within a session, and mix problem types once a learner has a first foothold; block briefly for brand-new procedures or simple vocabulary; explain to users that interleaving feels worse (Kornell & Bjork 2008).

## 5. Desirable difficulties, generation, productive failure, worked examples

- Bjork (1994; Bjork & Bjork 2011): conditions that slow acquisition (spacing, interleaving, testing, generation) improve retention/transfer; learners misjudge them.
- **Productive failure**: Kapur (2008). **Sinha & Kapur (2021, *RER*)** meta: 53 studies, 166 comparisons; problem-solving-first (PS-I) vs instruction-first g = 0.36 [0.20, 0.51] on conceptual understanding/transfer, up to d ≈ 0.58 with high design fidelity, no cost to procedural knowledge; **reversed for grades 2-5 and for domain-general skills** (I-PS better).
- **Worked-example effect & expertise reversal** (Sweller 1988; Kalyuga, Ayres, Chandler & Sweller 2003): novices learn more from studying worked examples than solving problems; as expertise grows the effect reverses, and guidance becomes redundant load. Fading worked steps (Renkl & Atkinson 2003) bridges the two. A 2025 meta-analysis framed expertise reversal as a well-confirmed aptitude-treatment interaction (via summary).
- The two literatures conflict on "struggle first vs example first"; reconciliation: brief, bounded struggle on a well-designed problem that activates prior knowledge, then consolidating instruction with examples; pure unguided discovery is bad for novices (Kirschner, Sweller & Clark 2006).

**Strength:** Strong for worked-example/expertise-reversal; Moderate for productive failure.
**Design implication:** Track estimated mastery per concept; for novices, give a short "try first" prompt then a worked example with self-explanation prompts; fade to problem-solving as mastery rises; never let a novice flounder unguided for long.

## 6. Elaborative interrogation and self-explanation

- Chi, Bassok et al. (1989, *Cog. Science*): good problem solvers spontaneously self-explain worked examples and monitor comprehension failures; poor solvers reread and copy. Chi, de Leeuw, Chiu & LaVancher (1994): prompting 8th graders to self-explain each line yielded larger pre-post gains and correct mental models of the circulatory system (n = 14, small).
- **Bisra et al. (2018, *Ed. Psych. Review*)** meta: 69 effects, 64 reports, **g = 0.55**; works across problem solving, worked examples, and text; benefits hold without extensive training.
- Elaborative interrogation: reliable in lab (Pressley, Woloshyn), but gains shrink for learners lacking prior knowledge to draw on (Dunlosky 2013, "moderate").

**Strength:** Strong for self-explanation; Moderate for elaborative interrogation.
**Design implication:** The tutor's default follow-up after any answer should be "why?" / "explain this step in your own words"; the LLM evaluates the explanation rather than accepting a bare answer.

## 7. Feedback

- Hattie & Timperley (2007, *RER*): feedback is among the strongest influences (Hattie's synthesis d ≈ 0.79 average), but highly variable; Kluger & DeNisi (1996): ~one-third of feedback interventions reduce performance. **Wisniewski, Zierer & Hattie (2020)**: 435 studies, d = 0.48; **high-information feedback (task + process + self-regulation) far outperforms praise or grades**.
- Timing: Kulik & Kulik (1988): delayed feedback wins in lab acquisition studies, immediate wins in applied classroom quizzes. Butler, Karpicke & Roediger (2007): delayed feedback beat immediate on MC learning at a 1-week test; Butler, Godbole & Marsh (2013): explanation feedback (why the answer is correct) beats correct-answer-only feedback for transfer. But **ManyClasses 1 (Fyfe et al. 2021)**: 38 college classes, 2,081 students, immediate vs 1-5-day delay: effect 0.002 (null). Kandemir et al. (2026, *Ed. Psych. Review*) meta of 51 CAL studies re-examines the question (treat timing as a second-order variable).
- Rowland 2014: feedback nearly doubles the testing effect.

**Strength:** Strong that elaborated corrective feedback matters; Moderate/contested on timing.
**Design implication:** Always give corrective feedback with an explanation and a follow-up retrieval attempt; timing can be immediate by default; consider a brief delay only for MC/high-confidence errors; avoid praise-only responses.

## 8. Metacognition and calibration

- Fluency illusions: Koriat & Bjork (2005, 2006) foresight bias; Bjork, Dunlosky & Kornell (2013, *Ann. Rev. Psych.*): learners rate massed/rereading as more effective than spacing/testing. Kornell & Bjork (2008): most students judged blocking better even after interleaving helped them.
- **Nelson & Dunlosky (1991)**: delayed judgments of learning are far more accurate than immediate ones (gamma correlations ~0.9 vs ~0.4) because delayed JOLs reflect retrievability. Kruger & Dunning (1999): bottom-quartile performers rated themselves ~62nd percentile; poor calibration co-occurs with low skill (partly a statistical artifact; magnitude contested, direction robust).
- **Confidence-weighted testing**: Sparck, Bjork & Bjork (2016, *CR:PI*): confidence-weighted MC practice improved transfer to related questions vs standard MC. Hypercorrection effect (Butterfield & Metcalfe 2001): high-confidence errors are *more* likely to be corrected after feedback. Metcalfe's Region of Proximal Learning: study time is best spent on items just beyond current reach.
- Caution: a large-scale L@S 2025 RCT of generic metacognitive reflection prompts in a learning platform found **no benefit**; prompts must be tied to retrieval, not free-floating.

**Strength:** Strong for illusions and delayed-JOL; Moderate for confidence-weighting benefits.
**Design implication:** Collect a confidence rating before revealing the answer (feeds the scheduler and calibration score); surface calibration to the user; prioritize high-confidence errors for immediate elaborated feedback; make JOLs delayed (ask "will you remember this?" at end of session, not right after study).

## 9. Bloom's 2 sigma, mastery learning, tutoring, dialogue systems

- Bloom (1984): mastery learning + 1:1 tutoring = +2 SD, based on small dissertation studies; later syntheses do not reproduce it. Kulik, Kulik & Bangert-Drowns (1990, *RER*): mastery learning across 108 studies ≈ +0.5 SD (larger for weaker students, larger with higher mastery thresholds). Cohen, Kulik & Kulik (1982): human tutoring ≈ 0.40. **VanLehn (2011, *Ed. Psychologist*)**: human tutoring d = 0.79; step-based ITS d = 0.76; answer-based CAI ≈ 0.31; substep granularity adds nothing. Kulik & Fletcher (2016): ITS median 0.66 across 50 evaluations.
- **AutoTutor** (Graesser; Nye, Graesser & Hu 2014): dialogue tutoring using expectation-and-misconception-tailored questioning produced ≈ 0.8 SD vs reading equivalent text; on par with human tutors. Graesser notes that real human tutors rarely do "bona fide Socratic" tutoring; the effective ingredients are prompting the student to construct explanations, hints/pumps before answers, and immediate targeted feedback.
- Direct "Socratic vs didactic" head-to-head RCTs are sparse and small; the best modern proxies are the LLM guardrail contrasts in Section 11.

**Strength:** Strong for mastery learning and step-level tutoring; the 2-sigma number itself is an overestimate.
**Design implication:** Gate progression on demonstrated mastery (e.g., 2-3 spaced successful retrievals), tutor at the step level (hint → pump → explain), and expect ~0.5-0.8 SD, not 2.

## 10. Knowledge organization, dual coding, concrete examples, Feynman, learning by teaching

- Concept mapping: Schroeder et al. (2018, *Ed. Psych. Review*) meta, 142 effects: g = 0.58 (constructing maps g = 0.72 > studying maps g = 0.43); but retrieval practice beats concept mapping head-to-head (Karpicke & Blunt 2011; replication 2015). Best use: mapping *from memory* (a retrieval task).
- Dual coding (Paivio 1971; Mayer's multimedia principle): strong lab evidence for words+pictures over words alone; classroom evidence thinner (Weinstein, Madan & Sumeracki 2018 rate it "less direct"). Concrete examples: helpful, especially multiple varied examples for abstract concepts (Rawson, Thomas & Jacoby 2015); learners transfer better from several examples than one.
- **Feynman technique: no rigorous RCTs.** Only small quasi-experimental studies with weak designs. Its plausible mechanism is self-explanation + teaching expectancy, which are well supported; market it as those.
- **Learning by teaching**: Fiorella & Mayer (2013): expecting to teach helped immediate but not delayed test; actually explaining aloud helped delayed. **Kobayashi (2019)** meta, 28 studies: preparing-to-teach g = 0.35; teaching after preparing g = 0.56; larger when teaching is interactive (questions from the "student"). Protégé effect with teachable agents (Chase, Chin, Oppezzo & Schwartz 2009).
- Learning styles (VAK): Pashler, McDaniel, Rohrer & Bjork (2008): no credible evidence for the meshing hypothesis; Rogowsky et al. (2015) direct test null. Do not build learner-style profiles.

**Strength:** Moderate for maps/dual coding/concrete examples; Moderate for learning-by-teaching; Weak for Feynman-as-such; learning styles is a myth.
**Design implication:** Offer a "teach it to the AI student" mode where the LLM plays a naive, questioning pupil (interactive teaching > monologue); use map-from-memory as a retrieval variant; always pair abstract definitions with 2-3 varied concrete examples; no learning-style personalization.

## 11. Sleep, motivation, curiosity, and LLM tutor evidence (2022-2026)

- Sleep: Rasch & Born (2013, *Physiol. Rev.*): active systems consolidation during slow-wave sleep; meta-analyses (271 samples) show a moderate sleep-vs-wake benefit for episodic memory. Cramming fails because massed study yields fast forgetting (Cepeda), fluency illusions inflate confidence, and there is no sleep-dependent consolidation between exposures.
- Curiosity: Kang et al. (2009, *Psych. Science*) and Gruber, Gelman & Ranganath (2014, *Neuron*): high curiosity before an answer enhances memory for it and for incidental material; Brod et al. (2019, *npj Sci. Learn.*): generating a prediction stimulates curiosity and learning (prediction error). Goal-setting: Locke & Latham (specific, challenging goals); implementation intentions d ≈ 0.65 (Gollwitzer & Sheeran 2006).
- **LLM tutors**:
  - **Bastani et al. (2025, *PNAS*; SSRN 2024)**: ~1,000 Turkish high-schoolers; GPT Base raised practice performance 48% but lowered unassisted exam scores **17%**; GPT Tutor (teacher-designed hints, no answers) raised practice 127% and eliminated the harm (no gain either).
  - **Kestin et al. (2025, *Scientific Reports*)**: Harvard physics, n = 194, crossover RCT; AI tutor built with expert scaffolds, no-answer-giving, cognitive-load management: median learning gains more than double active-learning class, in less time, higher engagement (via summary). Caveats: two lessons, immediate post-tests, elite sample, expert-authored prompts.
  - **De Simone et al. (2025, World Bank)**: Nigeria, 6-week after-school GPT-4 English tutoring with guardrail prompts and teacher supervision: +0.31 SD composite, +0.23 SD English.
  - **Tutor CoPilot (Wang, Demszky et al. 2024/25)**: 1,000+ students, 700 tutors; LLM coaching human tutors: +4 pp mastery, +9 pp for weaker tutors; increased probing questions.
  - **LearnLM/Eedi UK RCT (DeepMind, Nov 2025; arXiv 2512.23633)**: 165 students; supervised LearnLM ≥ human tutors (66.2% vs 60.7% novel-problem success); tutors approved 76% of drafts unchanged; exploratory.
  - **Anthropic (Feb 2026)**: 52 developers learning a Python library; AI-assisted group scored **17% lower** on a comprehension quiz; those who used AI for conceptual questions scored ≥65% vs <40% for code-delegators.
  - **Rismanchian et al. (2026, ALEKS panel, 3.2M interactions, not peer-reviewed)**: post-ChatGPT, time on AI-susceptible problems fell ~27-31% and proctored retention odds fell ~25% ("cognitive surrender").
  - Brcic & Frljic (2026, "The Effortless Trap", arXiv): synthesizes these into a placement frame (Prime, Probe, Point, Attach, Strengthen, Test): AI belongs after the first unaided attempt and before a final unaided check.
  - Meta-analyses of "ChatGPT in education" (g ≈ 0.57-0.87; one in *HSSC* retracted 2025) are dominated by short, low-quality quasi-experiments measuring assisted performance; discount them.

**Strength:** Strong and consistent pattern: unrestricted answer-giving harms unaided learning; hint-first/Socratic guardrails remove the harm and, with expert design, can beat classrooms.
**Design implication:** Hard-code "no direct answers before an attempt"; require an unaided attempt (prime/probe) and an unaided check (test) around any AI help; log assisted vs unassisted performance separately and show the gap to the user; schedule reviews to span sleep.

## 12. Other strongly-evidenced features

- **Successive relearning** (Rawson, Dunlosky & Sciartelli 2013, *Ed. Psych. Review*; Rawson et al. 2018): retrieve to criterion (1 correct) in each of 3+ spaced sessions; d = 1.5-4.2 vs single-session criterion learning; 4-month retention up to 49%; Janes et al. (2020) improved a real biopsychology exam. This is the single most direct blueprint for "SRS + mastery."
- **Free-recall "brain dumps"**: free recall is the format with the largest testing effect (Rowland 2014); Karpicke & Blunt 2011 used it. Implement session-opening "write everything you remember" graded by the LLM against a concept list.
- **Prequestions** (Pan & Carpenter 2023): ask a question before a reading/video; benefits the prequestioned content and increases attention.
- **Error-driven learning** (Metcalfe 2017, *Ann. Rev. Psych.*): errors followed by corrective feedback improve learning; hypercorrection means confident errors are valuable, not embarrassing.
- **Variability of practice**: Schmidt (1975) schema theory and contextual-interference effects (Shea & Morgan 1979) in motor learning; in cognitive domains, varied examples/surface features improve transfer (Paas & Van Merriënboer 1994). Moderate evidence; vary problem surface features across reviews rather than repeating identical cards.

## Design synthesis (priority order by evidence strength)

1. Retrieval-first loop with elaborated feedback (Strong).
2. Successive relearning schedule via memory-model spacing spanning sleep (Strong).
3. Guardrailed Socratic tutor: hint → pump → worked example, fading with mastery; no answers before attempt; unaided checks (Strong, 2024-26 RCTs).
4. Self-explanation and "teach the AI pupil" prompts (Strong/Moderate).
5. Interleaving of confusable concepts once a foothold exists (Strong in math/categories).
6. Confidence ratings + calibration feedback + hypercorrection targeting (Moderate).
7. Pretests/prequestions and curiosity-priming predictions (Moderate).
8. Avoid: learning-style profiles, praise-only feedback, rereading/highlighting modes, unrestricted chat during practice, and marketing "Feynman technique" as evidence-based beyond self-explanation.

## References (abbreviated)

Adesope, Trevisan & Sundararajan (2017) *RER* 87:659. Bastani et al. (2025) *PNAS* 122(26). Bisra et al. (2018) *Ed Psych Rev* 30:703. Bjork & Bjork (2011) in *Psychology and the Real World*. Bjork, Dunlosky & Kornell (2013) *Ann Rev Psych* 64. Bloom (1984) *Ed Researcher* 13(6). Brcic & Frljic (2026) arXiv:2606.26181. Brod et al. (2019) *npj Sci Learn* 4:17. Brunmair & Richter (2019) *Psych Bull* 145:1029. Butler, Karpicke & Roediger (2007) *JEP:Applied* 13:273. Butler, Godbole & Marsh (2013) *J Ed Psych* 105:290. Butterfield & Metcalfe (2001) *JEP:LMC* 27:1491. Cepeda et al. (2006) *Psych Bull* 132:354. Cepeda et al. (2008) *Psych Sci* 19:1095. Chase et al. (2009) *J Sci Ed Tech* 18:334. Chi et al. (1989) *Cog Sci* 13:145. Chi et al. (1994) *Cog Sci* 18:439. Cohen, Kulik & Kulik (1982) *AERJ* 19:237. De Simone et al. (2025) World Bank PRWP 11125. Dunlosky et al. (2013) *PSPI* 14:4. Fiorella & Mayer (2013) *Contemp Ed Psych* 38:281. Fyfe et al. (2021) *AMPPS* 4(3). Gruber, Gelman & Ranganath (2014) *Neuron* 84:486. Hattie & Timperley (2007) *RER* 77:81. Kalyuga et al. (2003) *Ed Psychologist* 38:23. Kandemir et al. (2026) *Ed Psych Rev*. Kang et al. (2009) *Psych Sci* 20:963. Kapur (2008) *Cognition & Instruction* 26:379. Karpicke & Bauernschmidt (2011) *JEP:LMC* 37:1250. Karpicke & Blunt (2011) *Science* 331:772. Karpicke & Roediger (2008) *Science* 319:966. Kestin et al. (2025) *Sci Rep* 15:17458. Kirschner, Sweller & Clark (2006) *Ed Psychologist* 41:75. Kobayashi (2019) *Jpn Psych Res* 61:192. Koriat & Bjork (2005) *JEP:LMC* 31:187. Kornell (2009) *Appl Cog Psych* 23:1297. Kornell & Bjork (2008) *Psych Sci* 19:585. Kornell, Hays & Bjork (2009) *JEP:LMC* 35:989. Kruger & Dunning (1999) *JPSP* 77:1121. Kulik & Kulik (1988) *RER* 58:79. Kulik, Kulik & Bangert-Drowns (1990) *RER* 60:265. Kulik & Fletcher (2016) *RER* 86:42. Metcalfe (2017) *Ann Rev Psych* 68:465. Nelson & Dunlosky (1991) *Psych Sci* 2:267. Nye, Graesser & Hu (2014) *IJAIED* 24:427. Pan & Carpenter (2023) *Ed Psych Rev* 35:97. Pashler et al. (2008) *PSPI* 9:105. Rasch & Born (2013) *Physiol Rev* 93:681. Rawson, Dunlosky & Sciartelli (2013) *Ed Psych Rev* 25:523. Rawson et al. (2018) *JEP:Applied* 24:57. Richland, Kornell & Kao (2009) *JEP:Applied* 15:243. Rismanchian et al. (2026) arXiv:2605.21629. Roediger & Karpicke (2006) *Psych Sci* 17:249. Rohrer & Taylor (2007) *Instr Sci* 35:481. Rohrer et al. (2020) *J Ed Psych* 112:40. Rowland (2014) *Psych Bull* 140:1432. Schroeder et al. (2018) *Ed Psych Rev* 30:431. Settles & Meeder (2016) ACL. Sinha & Kapur (2021) *RER* 91:761. Sparck, Bjork & Bjork (2016) *CR:PI* 1:3. Sweller (1988) *Cog Sci* 12:257. VanLehn (2011) *Ed Psychologist* 46:197. Wang, Demszky et al. (2024) Tutor CoPilot, EdWorkingPaper 24-1054. Weinstein, Madan & Sumeracki (2018) *CR:PI* 3:2. Wisniewski, Zierer & Hattie (2020) *Front Psych* 10:3087. DeepMind LearnLM UK RCT (2025) arXiv:2512.23633. Anthropic (2026) "How AI assistance impacts the formation of coding skills."
