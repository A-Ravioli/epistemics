# EpistemicsCore public API

A faithful Swift port of `web/packages/core` (plus ts-fsrs 5.4.2 and the web's onboarding derivations), with
the iPad additions. Everything is pure and value-typed (`Sendable`); time is `EpochMs` (`Int`, epoch ms) and
every function takes `now` explicitly. Names mirror the TS so the two codebases read alike. Parity with the
TypeScript is proven by `Tests/EpistemicsCoreTests/Conformance` against fixtures from
`node ipad/Tools/export-conformance.mjs`.

Note: Foundation also has a `Unit` type; write `EpistemicsCore.Unit` where both are imported.

Types the core builds on (content, `Card`, `Rating`, `Confidence`, `ReviewLogEntry`, `ConceptState`,
`GradeResult`, `ObserverResult`, `LessonPhase`, `CourseSettings`, …) are in `Types.swift`.

## Time (`Time.swift`)
| API | |
|---|---|
| `struct DayConfig(timezone:dayStartHour:)`, `CourseSettings.dayConfig` | Course-local day settings (IANA zone; unknown zones fall back to UTC). |
| `studyDay(_ at: EpochMs, _ cfg: DayConfig) -> String` | "YYYY-MM-DD" of the study day containing `at` (day starts at `dayStartHour`, default 04:00). |
| `studyDayStart(_ at:, _ cfg:) -> EpochMs` | Start of that study day. |
| `tzOffsetMinutes(_ at:, _ timezone:) -> Double` | Minutes east of UTC at `at`. |
| `daysBetween(_ a:, _ b:) -> Int`, `dayMs` / `DAY_MS` | Rounded whole days; 86,400,000. |

## Ids (`Ids.swift`)
`uuidv7(_ now: EpochMs = now) -> String` · `stableId(_ namespace:, _ key:) -> String` · `sha256(_ text:) -> String` (hex) ·
`canonicalJson(_ value: JSONValue) -> String` and `canonicalJson<T: Encodable>(_:) throws -> String` (sorted keys, JS number formatting).

## Scheduler (`Scheduler/`)
| API | |
|---|---|
| `struct SchedulerParams(w:desiredRetention:maximumIntervalDays:enableFuzz:)` | `w` 17/19/21 entries (migrated); fuzz defaults on; cap defaults 36,500 days. |
| `Scheduler(_ params)` / `createScheduler(_:)` | FSRS-6 with learning steps 1m 10m, relearning 10m. `.params: FSRSParameters`, `.engine: FSRS`. |
| `scheduler.newCard(_ courseId, _ itemId, _ conceptId, _ now, id: String? = nil) -> Card` | New card (UUIDv7 id by default). |
| `scheduler.previewRatings(_ card, _ now, _ ctx = ReviewContext()) -> [Rating: RatingOutcome]` | All four outcomes, uncommitted. |
| `scheduler.applyRating(_ card, _ rating, _ now, _ ctx: ReviewContext) -> RatingOutcome` | `RatingOutcome { card: Card; log: ReviewLogEntry }`; the log gets a UUIDv7 id. Clears `provisional`; exam cap is hard. |
| `scheduler.retrievability(_ card, _ now) -> Double` | P(recall); 0 for New. |
| `scheduler.seedKnownCard(_ card, _ now, stabilityDays: Double = 21) -> Card` | Diagnostic seeding: Review, D 5, provisional. |
| `scheduler.intervalForStability(_ s) -> Int` | Un-fuzzed, capped interval. |
| `struct ReviewContext(source:assisted:confidence:durationMs:)` | Defaults: `.review`, unassisted. |
| `daysToExam(_ now, _ examDate) -> Int`, `isLeech(_ card, threshold: = 8) -> Bool` | Exam cap helper; leech rule. |
| `toFsrsCard(_:)`, `fromFsrsCard(_:_:)` | Card ↔ `FSRSCard`. |
| `FSRS`, `FSRSParameters`, `FSRSParameterProps`, `generatorParameters`, `migrateParameters`, `clipParameters`, `forgettingCurve`, `computeDecayFactor`, `dateDiffInDays`, `createEmptyCard`, `Alea(seed:)` | The ts-fsrs port, for raw formulas. |
| `DEFAULT_FSRS_W`, `DEFAULT_LEARNING_STEPS`, `DEFAULT_RELEARNING_STEPS`, `DEFAULT_MAXIMUM_INTERVAL_DAYS`, `LEECH_LAPSES`, `MIN_REVIEWS_FOR_OPTIMIZE`, `shouldOptimize(_ n, _ lastOptimizedAt, _ now)` | Parameters and optimizer policy. |
| `isCorrect(_ rating)`, `ratingFromGrade(_ score, _ graderConfidence) -> Rating`, `needsConsensus(_ score, _ conf, margin:)`, `adjustRatingForConfidence(_ rating, _ confidence, _ correct) -> (rating, hypercorrection)` | Grade → rating (§6.2), confidence (§3.4). |
| `buildQueue(_ input: BuildQueueInput) -> Queue` | Daily queue: learning → reviews → new (gated), debt, recovery mode, sibling burying. `BuildQueueInput(cards:now:settings:itemsByCard:retrievability:recentlyShownConceptIds:rng:reviewsDoneToday:newDoneToday:learnAheadMs:debtCarriedOverDays:)`; `Queue { learning, reviews, newCards, buried, debt, dueToday, gateOpen, recoveryMode, overdueDays, daysToClear, all }`. |
| `QueueItemInfo(conceptId:type:)` | Item metadata per card id. |
| `estimateMinutes(_ queue, secondsPerItem: = 25)`, `estimateMinutes(count:secondsPerItem:)` | Web's flat estimate. |
| `conceptRetention`, `conceptMastery(_ retention, _ sessions)`, `prerequisitesOf`, `isAvailable(_ id, _ edges, _ mastery, threshold:)`, `isMastered`, `unassistedPassRate`, `assistedPassRate` | Concept layer (§5.5). |
| `updateConceptStateAfterReceipt(_ state, _ receipt: ConceptReceipt) -> ConceptState` | Fold a receipt (does not recompute mastery). |
| `topologicalOrder(_ ids, _ edges) throws -> [String]` | Throws `PrerequisiteCycleError`. |
| `nextAvailableLesson(_ curriculum, _ mastery, _ completed, threshold:) -> Lesson?` | First unlocked, uncompleted lesson. |
| `implicitCredit(_ input: ImplicitCreditInput) -> [RatingOutcome]`, `encompassedBy(_ id, _ edges)` | FIRe-lite (§5.6); logs have source `.implicit`. |
| `brierScore(_ pairs: [CalibrationPair]) -> CalibrationSummary`, `calibrationBins(_:) -> [CalibrationBin]`, `CONFIDENCE_PROBABILITY`, `Confidence.probability` | Calibration (§6.3). |
| `simulateLoad(_ cards, _ days, _ settings, _ scheduler, _ opts: SimulateOptions) -> [SimulatedDay]` | Deterministic load simulator. |
| `typealias Rng = () -> Double`, `mulberry32(_ seed: Int)`, `seededRng(_ seed: = 42)`, `lcgRng(_:)` | Seeded uniform [0, 1) sources. |

## Sessions (`Session/`) — pure reducers; states and events/effects are `Codable` in the web's JSON shape
| API | |
|---|---|
| `createLessonState(_ input: CreateLessonStateInput) -> LessonState` | `CreateLessonStateInput(sessionId:courseId:lesson:scaffolding:learnerMisconceptions:phases:wrap:)`; plan must end with CHECK. |
| `reduceLesson(_ state, _ event: LessonEvent, _ lesson) -> LessonStep` | `LessonStep { state, effects: [LessonEffect] }`. |
| `LessonEvent` | `.start`, `.learnerTurn(content:confidence:)`, `.tutorTurn(content:)`, `.observer(ObserverResult)`, `.grade(itemKind:itemId:grade:rating:)`, `.giveUp`, `.summarySubmitted(text:)`, `.jolSubmitted(predictions:)`, `.leakDetected`. |
| `LessonEffect` | `.callTutor(control: TutorControl)`, `.callObserver(learnerTurn:conceptId:objectiveIds:)`, `.gradeItem(GradeItemEffect)`, `.recordReceipt(RecordReceiptEffect)`, `.activateItems(conceptId:firstRating:)`, `.showMessage(text:)`, `.requestSummary`, `.requestJol(conceptIds:)`, `.scheduleRemediation(conceptId:)`, `.lessonComplete(results: LessonResults)`. |
| `buildTutorControl(_ state, _ lesson, _ opts: ControlOptions) -> TutorControl` | The control message for a tutor call. |
| `currentConcept(_ state, _ lesson)`, `scriptItemId(_ conceptId, _ kind)`, `consolidateItem(_ concept)`, `LessonState.currentConceptId` | Helpers. Script items are `"<conceptId>#pretest|check|transfer"`. |
| Constants | `FULL_PHASE_PLAN`, `REMEDIATION_PHASE_PLAN`, `MAX_HINT_LEVEL`, `MAX_PROBE_TURNS`, `MAX_CONSOLIDATE_LOOPS`, `CONSOLIDATE_PASS_SCORE`, `CHECK_PASS_RATING`, `MAX_REMEDIATIONS_PER_CONCEPT`, `MAX_LEAK_REGENERATIONS`, `WORDS_*`, `LETS_FIND_OUT`. |
| `composeCheckpoint(_ input: ComposeCheckpointInput) -> [Item]` | ~70 % unit / ~30 % earlier units; `ComposeCheckpointInput(unit:previousUnits:conceptMastery:size:rng:)`. |
| `createCheckpointState(sessionId:courseId:unitId:items:)`, `reduceCheckpoint(_ state, _ event: CheckpointEvent) -> CheckpointStep`, `scoreCheckpoint(_:) -> CheckpointResult` | Events `.start/.answerSubmitted/.grade/.finish`; effects `.presentItem/.gradeItem/.recordReceipt/.checkpointComplete`. Pass ≥ 0.8. |
| `composeRemediation(_ concept, sessionId:courseId:scaffolding:learnerMisconceptions:) -> RemediationPlan` | DEVELOP → CONSOLIDATE → CHECK mini-lesson (`lesson`, `state`). |
| `createDiagnostic(_ curriculum)`, `nextProbe(_:) -> DiagnosticProbe?`, `recordResult(_:_ conceptId:_ passed:)`, `diagnosticResult(_:)`, `conceptDepths(_:)` | Adaptive placement (§6.4). |
| `createTeachbackState(sessionId:courseId:concept:)`, `reduceTeachback(_:_ event:) -> TeachbackStep`, `buildStudentControl(_:_ move:)`, `learnerExplanation(_:)` | Teach-back (events `.start/.learnerTurn(content:done:)/.studentTurn/.end/.grade`). |
| `summarizeLearnerModel(_ input: SummarizeLearnerModelInput) -> LearnerModelSummary`, `renderLearnerModel(_ summary, _ focusConceptIds) -> String` | Prompt-ready learner model. |
| `buildWarmupPrompt(_ lesson) -> String`, `mapWarmupResult(_ recalledIds, _ lesson) -> WarmupOutcome` | Warm-up brain dump. |

## Onboarding (`Onboarding.swift`)
| API | |
|---|---|
| `schedulingFor(_ minutesPerDay: Int, reviewsPerMinute: = IPAD_REVIEWS_PER_MINUTE) -> SchedulingDerivation` | iPad: `reviewsPerDay = clamp(round(min × 2), 20, 400)`; pass `WEB_REVIEWS_PER_MINUTE` (3) for the web's rule. |
| `goalsFor(_ draft: OnboardingDraft, timeZone:, reviewsPerMinute:) -> CourseGoals` | Recall → background; exam date at local noon. |
| `conceptsNamed(_ curriculum, _ recall, limit: = 4) -> [String]` | Offline matcher for the first-run reflection (concept names). |
| `shouldOfferPlacement(_ recall, _ named) -> Bool`, `scaffoldingFromBackground(_ background, _ depth: BackgroundDepth) -> Scaffolding`, `stepsFor(needsCourse:needsTutor:)`, `defaultCourseSettings(timezone:)` | Derivations. |

## iPad additions
| API | |
|---|---|
| `inkLayout(for item: Item) -> InkLayout`, `Item.inkLayout`, `defaultInkLayout(for: ItemType)`, `defaultLines(for: Paper)` | Paper and starting lines from the type, honouring `item.ink` (§3, §7). `InkLayout { paper, lines, columns }`; presets `.dialogue`, `.freeRecall`, `.map`. |
| `DEFAULT_SECONDS_BY_TYPE`, `secondsByHand(_ type, _ table)`, `estimateMinutesByHand(_ queue, itemsByCard:, secondsByType:) -> Int` | Time by hand (§8); pass measured per-type seconds once known. |
| `gradeMap(nodes: [String], edges: [DrawnEdge], unit:, curriculumEdges:) -> MapGrade`, `matchMapNode(_ label, _ concepts) -> Concept?` | Map from memory (§6.6): `placed`, `missing`, `nodeMatches`, `unmatchedNodes`, `correctEdges`, `extraEdges`, `missingEdges` (undirected `ConceptPair`s), `summary`. |
