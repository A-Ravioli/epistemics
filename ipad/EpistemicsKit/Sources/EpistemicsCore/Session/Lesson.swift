// Lesson state machine (web DESIGN §3.3, §7.2-7.3, §9.4; lesson.ts).
//
// A pure reducer: `reduceLesson(state, event, lesson) → (state, effects)`. No I/O, no LLM calls, no
// timers. The app executes effects (call the tutor, grade an item, …) and feeds results back as events.
// State is Codable in the web's JSON shape, so a session can be persisted, resumed, or moved between apps.
//
// Pedagogical control lives here; the model only supplies language. The tutor is steered through short
// natural-language control messages (`TutorControl`). The iPad changes nothing here (iPad DESIGN §6.3).

// MARK: - Public types

public enum LessonItemKind: String, Codable, Sendable, Hashable, CaseIterable {
    case pretest, check, consolidate, transfer
}

public enum RubricSource: String, Codable, Sendable, Hashable {
    case scriptPretest = "script.pretest"
    case scriptTransfer = "script.transfer"
    case item
}

public struct TutorControl: Codable, Sendable, Hashable {
    public var phase: LessonPhase
    public var conceptId: String
    public var hintLevel: Int
    public var objectiveIds: [String]
    public var maxWords: Int
    public var instruction: String
    public var allowHintContent: String?
    public init(phase: LessonPhase, conceptId: String, hintLevel: Int, objectiveIds: [String], maxWords: Int, instruction: String,
                allowHintContent: String? = nil) {
        self.phase = phase; self.conceptId = conceptId; self.hintLevel = hintLevel; self.objectiveIds = objectiveIds
        self.maxWords = maxWords; self.instruction = instruction; self.allowHintContent = allowHintContent
    }
}

public struct TranscriptEntry: Codable, Sendable, Hashable {
    public enum Role: String, Codable, Sendable, Hashable { case tutor, learner, system }
    public var role: Role
    public var content: String
    public var phase: LessonPhase
    public var conceptId: String?
    public var hintLevel: Int?
    public init(role: Role, content: String, phase: LessonPhase, conceptId: String? = nil, hintLevel: Int? = nil) {
        self.role = role; self.content = content; self.phase = phase; self.conceptId = conceptId; self.hintLevel = hintLevel
    }
}

public struct ActiveItem: Codable, Sendable, Hashable {
    public var itemId: String
    public var kind: LessonItemKind
    public var assisted: Bool
}

/// An item sent to the grader whose result has not come back yet.
public struct PendingGrade: Codable, Sendable, Hashable {
    public var itemId: String
    public var kind: LessonItemKind
    public var conceptId: String
    public var answer: String
    public var confidence: Confidence?
    public var assisted: Bool
}

public struct PretestRecord: Codable, Sendable, Hashable {
    public var answer: String
    public var confidence: Confidence
}

public struct CheckResult: Codable, Sendable, Hashable {
    public var rating: Rating
    public var score: Double
}

public struct LessonResults: Codable, Sendable, Hashable {
    public var checkResults: [String: CheckResult]
    public var pretestRecord: [String: PretestRecord]
    public var misconceptions: [String: [String]]
    public var summaryText: String?
    public var jol: [String: Double]?
}

/// Per-concept phase sequence. CHECK must be last; WRAP is appended once for the lesson.
public let FULL_PHASE_PLAN: [LessonPhase] = [.prime, .probe, .develop, .consolidate, .extend, .check]
public let REMEDIATION_PHASE_PLAN: [LessonPhase] = [.develop, .consolidate, .check]

public struct LessonState: Codable, Sendable, Hashable {
    public var sessionId: String
    public var courseId: String
    public var lessonId: String
    public var conceptIds: [String]
    public var conceptIndex: Int
    public var phase: LessonPhase
    /// 0...3
    public var hintLevel: Int
    public var attemptsThisPhase: Int
    public var turnsThisPhase: Int
    public var scaffolding: Scaffolding
    public var activeItem: ActiveItem?
    public var pretestRecord: [String: PretestRecord]
    public var checkResults: [String: CheckResult]
    public var remediationCount: [String: Int]
    public var misconceptions: [String: [String]]
    public var transcript: [TranscriptEntry]
    public var summaryText: String?
    public var jolPending: Bool
    public var done: Bool
    // engine bookkeeping
    public var started: Bool
    public var phasePlan: [LessonPhase]
    /// False for remediation mini-lessons (no summary/JOL).
    public var wrap: Bool
    public var workedExampleShown: Bool
    public var guidingIndex: Int
    public var consolidateLoops: Int
    public var pendingGrades: [String: PendingGrade]
    public var lastControl: TutorControl?
    public var regenerations: Int
    public var jol: [String: Double]?

    /// The concept being taught, if any.
    public var currentConceptId: String? { conceptIndex < conceptIds.count ? conceptIds[conceptIndex] : nil }
}

public struct GradeItemEffect: Codable, Sendable, Hashable {
    public var itemKind: LessonItemKind
    public var itemId: String
    public var conceptId: String
    public var answer: String
    public var confidence: Confidence?
    public var assisted: Bool
    public var rubricSource: RubricSource
}

public struct RecordReceiptEffect: Codable, Sendable, Hashable {
    public var itemKind: LessonItemKind
    public var itemId: String
    public var conceptId: String
    public var answer: String
    public var confidence: Confidence?
    public var grade: GradeResult?
    public var rating: Rating
    public var assisted: Bool
}

public enum LessonEvent: Sendable, Hashable {
    case start
    case learnerTurn(content: String, confidence: Confidence? = nil)
    case tutorTurn(content: String)
    case observer(ObserverResult)
    case grade(itemKind: LessonItemKind, itemId: String, grade: GradeResult, rating: Rating)
    case giveUp
    case summarySubmitted(text: String)
    case jolSubmitted(predictions: [String: Double])
    case leakDetected
}

public enum LessonEffect: Sendable, Hashable {
    case callTutor(control: TutorControl)
    case callObserver(learnerTurn: String, conceptId: String, objectiveIds: [String])
    case gradeItem(GradeItemEffect)
    case recordReceipt(RecordReceiptEffect)
    case activateItems(conceptId: String, firstRating: Rating)
    case showMessage(text: String)
    case requestSummary
    case requestJol(conceptIds: [String])
    case scheduleRemediation(conceptId: String)
    case lessonComplete(results: LessonResults)
}

public struct LessonStep: Sendable, Hashable {
    public var state: LessonState
    public var effects: [LessonEffect]
}

public struct CreateLessonStateInput: Sendable, Hashable {
    public var sessionId: String
    public var courseId: String
    public var lesson: Lesson
    public var scaffolding: Scaffolding
    public var learnerMisconceptions: [String: [String]]?
    /// Restrict the per-concept phase sequence (e.g. remediation: DEVELOP → CONSOLIDATE → CHECK).
    public var phases: [LessonPhase]?
    /// Run the WRAP phase (summary + JOL) after the last concept. Default true.
    public var wrap: Bool?
    public init(sessionId: String, courseId: String, lesson: Lesson, scaffolding: Scaffolding,
                learnerMisconceptions: [String: [String]]? = nil, phases: [LessonPhase]? = nil, wrap: Bool? = nil) {
        self.sessionId = sessionId; self.courseId = courseId; self.lesson = lesson; self.scaffolding = scaffolding
        self.learnerMisconceptions = learnerMisconceptions; self.phases = phases; self.wrap = wrap
    }
}

// MARK: - Constants

public let MAX_HINT_LEVEL = 3
public let MAX_PROBE_TURNS = 2
public let MAX_CONSOLIDATE_LOOPS = 2
public let CONSOLIDATE_PASS_SCORE = 0.75
public let CHECK_PASS_RATING: Rating = .good
public let MAX_REMEDIATIONS_PER_CONCEPT = 1
public let MAX_REMEDIATE_ATTEMPTS = 2
public let MAX_LEAK_REGENERATIONS = 2
public let WORDS_NORMAL = 120
public let WORDS_WORKED_EXAMPLE = 220
public let WORDS_SUMMARY_CHECK = 80
public let LETS_FIND_OUT = "Let's find out."

// MARK: - Construction

/// Precondition: the phase plan is non-empty and ends with CHECK (the TS throws).
public func createLessonState(_ input: CreateLessonStateInput) -> LessonState {
    let plan = input.phases ?? FULL_PHASE_PLAN
    precondition(!plan.isEmpty && plan.last == .check, "lesson phase plan must end with CHECK")
    var misconceptions: [String: [String]] = [:]
    for c in input.lesson.concepts { misconceptions[c.id] = input.learnerMisconceptions?[c.id] ?? [] }
    return LessonState(
        sessionId: input.sessionId, courseId: input.courseId, lessonId: input.lesson.id,
        conceptIds: input.lesson.concepts.map(\.id), conceptIndex: 0, phase: plan[0], hintLevel: 0,
        attemptsThisPhase: 0, turnsThisPhase: 0, scaffolding: input.scaffolding, activeItem: nil,
        pretestRecord: [:], checkResults: [:], remediationCount: [:], misconceptions: misconceptions, transcript: [],
        summaryText: nil, jolPending: false, done: false, started: false, phasePlan: plan, wrap: input.wrap ?? true,
        workedExampleShown: false, guidingIndex: 0, consolidateLoops: 0, pendingGrades: [:], lastControl: nil,
        regenerations: 0, jol: nil)
}

// MARK: - Item ids for script-backed items (the app maps these to receipts)

public func scriptItemId(_ conceptId: String, _ kind: LessonItemKind) -> String { "\(conceptId)#\(kind.rawValue)" }

/// The item graded in CONSOLIDATE: the concept's first `explain` item if any, else the script pretest.
public func consolidateItem(_ concept: Concept) -> (itemId: String, rubricSource: RubricSource) {
    if let explain = concept.items.first(where: { $0.type == .explain }) { return (explain.id, .item) }
    return (scriptItemId(concept.id, .pretest), .scriptPretest)
}

// MARK: - Tutor control

public enum ControlKind: String, Sendable, Hashable {
    case prime, probe, workedExample = "worked_example", develop, consolidate, extend, check, remediate
    case summaryCheck = "summary_check"
}

public struct ControlOptions: Sendable, Hashable {
    public var kind: ControlKind?
    /// Text prepended to the instruction (e.g. feedback to deliver before the next prompt).
    public var preamble: String?
    public init(kind: ControlKind? = nil, preamble: String? = nil) { self.kind = kind; self.preamble = preamble }
}

private func q(_ text: String) -> String { "\"\(jsOneLine(text))\"" }

private func defaultControlKind(_ state: LessonState) -> ControlKind {
    switch state.phase {
    case .prime: return .prime
    case .probe: return .probe
    case .develop: return state.scaffolding == .novice && !state.workedExampleShown ? .workedExample : .develop
    case .consolidate: return .consolidate
    case .extend: return .extend
    case .check: return .check
    case .remediate: return .remediate
    case .wrap, .done: return .summaryCheck
    }
}

private func hintClause(_ state: LessonState, _ concept: Concept) -> (text: String, allow: String?) {
    let h = state.hintLevel
    let hints = concept.script.hints
    if h <= 0 { return ("No hint may be given at this level: ask the question and wait for an attempt.", nil) }
    if h < MAX_HINT_LEVEL {
        let allow = h - 1 < hints.count ? hints[h - 1] : hints[0]
        return ("You may give this hint and nothing beyond it: \(q(allow)).", allow)
    }
    let allow = hints[2]
    return ("Bottom-out hint (level 3): present this partial worked example and ask the learner to complete and explain the final step themselves: \(q(allow)). Never give the full answer.", allow)
}

/// Builds the control message the app appends as a mid-conversation system message before a tutor call.
public func buildTutorControl(_ state: LessonState, _ lesson: Lesson, _ opts: ControlOptions = ControlOptions()) -> TutorControl {
    let concept = currentConcept(state, lesson)
    let kind = opts.kind ?? defaultControlKind(state)
    let objectiveIds = concept?.objectives.map(\.id) ?? []
    let conceptId = concept?.id ?? state.currentConceptId ?? ""
    let pre = opts.preamble.flatMap { $0.isEmpty ? nil : "\(jsTrim($0)) " } ?? ""
    var maxWords = WORDS_NORMAL
    let instruction: String
    var allowHintContent: String?

    if concept == nil && kind != .summaryCheck {
        return TutorControl(phase: state.phase, conceptId: conceptId, hintLevel: state.hintLevel, objectiveIds: objectiveIds,
                            maxWords: maxWords, instruction: "\(pre)Say nothing.")
    }

    switch kind {
    case .prime:
        let c = concept!
        instruction =
            "\(pre)Phase PRIME. Ask the learner this pretest question verbatim and nothing else: \(q(c.script.pretest.prompt)) " +
            "Do not explain, hint, or add context. Ask them to answer and rate their confidence (1 guess, 2 fairly sure, 3 certain). " +
            "Ask exactly one question. ≤\(maxWords) words."
    case .probe:
        let c = concept!
        instruction =
            "\(pre)Phase PROBE (turn \(min(state.turnsThisPhase + 1, MAX_PROBE_TURNS)) of \(MAX_PROBE_TURNS)). " +
            "Ask exactly one question to elicit what the learner already knows that bears on \(q(c.name)); link to mastered prerequisites by name where relevant. " +
            "Do not explain the concept and do not state the answer. ≤\(maxWords) words."
    case .workedExample:
        let c = concept!
        maxWords = WORDS_WORKED_EXAMPLE
        let steps = c.script.workedExample.steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: " ")
        instruction =
            "\(pre)Phase DEVELOP, worked example first (novice scaffolding), hint level \(state.hintLevel) of \(MAX_HINT_LEVEL). " +
            "Present the worked example steps for \(q(c.script.workedExample.problem)): \(steps) " +
            "Then ask the learner to explain step 1 in their own words. Ask exactly one question. ≤\(maxWords) words."
    case .develop:
        let c = concept!
        let gqs = c.script.guidingQuestions
        let gi = min(state.guidingIndex, max(0, gqs.count - 1))
        let gq = gi < gqs.count ? gqs[gi] : nil
        let hint = hintClause(state, c)
        allowHintContent = hint.allow
        instruction =
            "\(pre)Phase DEVELOP, hint level \(state.hintLevel) of \(MAX_HINT_LEVEL). " +
            (gq.map { "Guiding question \(gi + 1) of \(gqs.count): \(q($0.question)) (a good answer contains: \($0.expected)). " }
                ?? "Guide the learner toward the key idea with one leading question. ") +
            "\(hint.text) Ask exactly one question. ≤\(maxWords) words. Do not state the answer."
    case .consolidate:
        let c = concept!
        instruction =
            "\(pre)Phase CONSOLIDATE. Ask the learner to state the principle of \(q(c.name)) in their own words, in one or two sentences. " +
            "Ask exactly one question. Do not state the principle yourself. ≤\(maxWords) words."
    case .extend:
        let c = concept!
        let hint = hintClause(state, c)
        allowHintContent = hint.allow
        instruction =
            "\(pre)Phase EXTEND, hint level \(state.hintLevel) of \(MAX_HINT_LEVEL). Pose this transfer question verbatim: \(q(c.script.transfer.prompt)) " +
            "\(hint.text) Ask exactly one question. ≤\(maxWords) words. Do not state the answer."
    case .check:
        let c = concept!
        instruction =
            "\(pre)Phase CHECK (unaided). Ask this question verbatim and nothing else: \(q(c.script.pretest.isomorph)) " +
            "Ask the learner to answer and rate their confidence 1-3. Give no hints, no feedback and no commentary; you will stay silent until it is graded. " +
            "Ask exactly one question. ≤\(maxWords) words."
    case .remediate:
        let c = concept!
        let tags = state.misconceptions[c.id] ?? []
        let targeted = c.misconceptions.filter { tags.contains($0.tag) }
        let remedies = targeted.isEmpty
            ? "no tagged misconception; target the key idea of the concept directly"
            : targeted.map { "[\($0.tag)] \($0.description) → \($0.remedy)" }.joined(separator: " | ")
        instruction =
            "\(pre)Phase REMEDIATE. The learner's unaided check on \(q(c.name)) did not pass. Targeted remediation: \(remedies). " +
            "Ask exactly one question that surfaces and repairs the misunderstanding. Do not reveal the check answer. ≤\(maxWords) words."
    case .summaryCheck:
        maxWords = WORDS_SUMMARY_CHECK
        instruction =
            "\(pre)Phase WRAP. The learner wrote this summary of the lesson: \(q(state.summaryText ?? "")) " +
            "Check it for errors briefly: name any incorrect or missing key idea. Do not ask a question. ≤\(maxWords) words."
    }

    return TutorControl(phase: state.phase, conceptId: conceptId, hintLevel: state.hintLevel, objectiveIds: objectiveIds,
                        maxWords: maxWords, instruction: instruction, allowHintContent: allowHintContent)
}

private func strictControl(_ control: TutorControl, _ n: Int) -> TutorControl {
    var out = control
    out.instruction =
        "STRICT REGENERATION \(n) of \(MAX_LEAK_REGENERATIONS): your previous reply leaked the reference answer. " +
        "Do not include any part of the answer, its key terms, or its final result; ask only the question. " +
        control.instruction
    return out
}

// MARK: - Helpers

public func currentConcept(_ state: LessonState, _ lesson: Lesson) -> Concept? {
    guard let id = state.currentConceptId else { return nil }
    return lesson.concepts.first { $0.id == id }
}

private func mergeTags(_ s: inout LessonState, _ conceptId: String, _ tags: [String]) {
    if tags.isEmpty { return }
    let existing = s.misconceptions[conceptId] ?? []
    let merged = Array(tags.filter { !existing.contains($0) }.reversed()) + existing
    s.misconceptions[conceptId] = Array(merged.prefix(10))
}

private func lastLearnerTurn(_ s: LessonState) -> String {
    s.transcript.last { $0.role == .learner }?.content ?? ""
}

private func tutorEffect(_ s: inout LessonState, _ lesson: Lesson, _ opts: ControlOptions = ControlOptions()) -> LessonEffect {
    let control = buildTutorControl(s, lesson, opts)
    s.lastControl = control
    s.regenerations = 0
    return .callTutor(control: control)
}

private func resetPhaseCounters(_ s: inout LessonState) {
    s.hintLevel = 0
    s.attemptsThisPhase = 0
    s.turnsThisPhase = 0
}

private func completeLesson(_ s: inout LessonState, _ effects: inout [LessonEffect]) {
    s.phase = .done
    s.done = true
    s.jolPending = false
    s.activeItem = nil
    s.lastControl = nil
    let results = LessonResults(checkResults: s.checkResults, pretestRecord: s.pretestRecord, misconceptions: s.misconceptions,
                                summaryText: s.summaryText, jol: s.jol)
    effects.append(.lessonComplete(results: results))
}

private func enterPhase(_ s: inout LessonState, _ lesson: Lesson, _ phase: LessonPhase, _ effects: inout [LessonEffect], _ preamble: String? = nil) {
    let concept = currentConcept(s, lesson)
    s.phase = phase
    resetPhaseCounters(&s)
    s.activeItem = nil
    let pre = (preamble?.isEmpty ?? true) ? nil : preamble
    switch phase {
    case .prime:
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .prime, preamble: pre)))
    case .probe:
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .probe, preamble: pre)))
    case .develop:
        s.guidingIndex = 0
        if s.scaffolding == .novice && !s.workedExampleShown {
            effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .workedExample, preamble: pre)))
            s.workedExampleShown = true
        } else {
            effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .develop, preamble: pre)))
        }
    case .consolidate:
        s.consolidateLoops = 0
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .consolidate, preamble: pre)))
    case .extend:
        if let concept { s.activeItem = ActiveItem(itemId: scriptItemId(concept.id, .transfer), kind: .transfer, assisted: true) }
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .extend, preamble: pre)))
    case .check:
        if let concept { s.activeItem = ActiveItem(itemId: scriptItemId(concept.id, .check), kind: .check, assisted: false) }
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .check, preamble: pre)))
    case .remediate:
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .remediate, preamble: pre)))
    case .wrap:
        s.lastControl = nil
        effects.append(.requestSummary)
    case .done:
        completeLesson(&s, &effects)
    }
}

/// Advance to the next phase in the per-concept plan after `from`.
private func nextPhase(_ s: inout LessonState, _ lesson: Lesson, _ from: LessonPhase, _ effects: inout [LessonEffect], _ preamble: String? = nil) {
    let idx = s.phasePlan.firstIndex(of: from) ?? -1
    guard idx + 1 < s.phasePlan.count else {
        // Plan exhausted without reaching CHECK (cannot happen with a valid plan); be defensive.
        finishConcept(&s, lesson, &effects)
        return
    }
    enterPhase(&s, lesson, s.phasePlan[idx + 1], &effects, preamble)
}

private func enterConcept(_ s: inout LessonState, _ lesson: Lesson, _ effects: inout [LessonEffect]) {
    s.workedExampleShown = false
    s.guidingIndex = 0
    s.consolidateLoops = 0
    s.activeItem = nil
    enterPhase(&s, lesson, s.phasePlan[0], &effects)
}

private func finishConcept(_ s: inout LessonState, _ lesson: Lesson, _ effects: inout [LessonEffect]) {
    s.conceptIndex += 1
    s.activeItem = nil
    if s.conceptIndex < s.conceptIds.count {
        enterConcept(&s, lesson, &effects)
    } else if s.wrap {
        enterPhase(&s, lesson, .wrap, &effects)
    } else {
        completeLesson(&s, &effects)
    }
}

private func failCheck(_ s: inout LessonState, _ lesson: Lesson, _ conceptId: String, _ rating: Rating, _ effects: inout [LessonEffect]) {
    let count = s.remediationCount[conceptId] ?? 0
    if count < MAX_REMEDIATIONS_PER_CONCEPT {
        s.remediationCount[conceptId] = count + 1
        enterPhase(&s, lesson, .remediate, &effects)
    } else {
        effects.append(.activateItems(conceptId: conceptId, firstRating: rating))
        effects.append(.scheduleRemediation(conceptId: conceptId))
        finishConcept(&s, lesson, &effects)
    }
}

private func gradeEffect(_ s: inout LessonState, _ pending: PendingGrade, _ rubricSource: RubricSource) -> LessonEffect {
    s.pendingGrades[pending.itemId] = pending
    return .gradeItem(GradeItemEffect(itemKind: pending.kind, itemId: pending.itemId, conceptId: pending.conceptId,
                                      answer: pending.answer, confidence: pending.confidence, assisted: pending.assisted,
                                      rubricSource: rubricSource))
}

private func receiptEffect(_ pending: PendingGrade, _ rating: Rating, _ grade: GradeResult? = nil) -> LessonEffect {
    .recordReceipt(RecordReceiptEffect(itemKind: pending.kind, itemId: pending.itemId, conceptId: pending.conceptId,
                                       answer: pending.answer, confidence: pending.confidence, grade: grade, rating: rating,
                                       assisted: pending.assisted))
}

// MARK: - Reducer

public func reduceLesson(_ state: LessonState, _ event: LessonEvent, _ lesson: Lesson) -> LessonStep {
    if state.done { return LessonStep(state: state, effects: []) }
    var s = state
    var effects: [LessonEffect] = []
    let keep: Bool
    switch event {
    case .start: keep = onStart(&s, lesson, &effects)
    case .tutorTurn(let content): keep = onTutorTurn(&s, content)
    case .learnerTurn(let content, let confidence): keep = onLearnerTurn(&s, lesson, content, confidence, &effects)
    case .observer(let r): keep = onObserver(&s, lesson, r, &effects)
    case let .grade(itemKind, itemId, grade, rating): keep = onGrade(&s, lesson, itemKind, itemId, grade, rating, &effects)
    case .giveUp: keep = onGiveUp(&s, lesson, &effects)
    case .summarySubmitted(let text): keep = onSummary(&s, lesson, text, &effects)
    case .jolSubmitted(let predictions): keep = onJol(&s, predictions, &effects)
    case .leakDetected: keep = onLeak(&s, lesson, &effects)
    }
    // An ignored event returns the (unchanged) state with no effects, as the TS does.
    return LessonStep(state: s, effects: keep ? effects : [])
}

private func onStart(_ s: inout LessonState, _ lesson: Lesson, _ effects: inout [LessonEffect]) -> Bool {
    if s.started { return false }
    s.started = true
    if s.conceptIds.isEmpty {
        completeLesson(&s, &effects)
        return true
    }
    enterConcept(&s, lesson, &effects)
    return true
}

private func onTutorTurn(_ s: inout LessonState, _ content: String) -> Bool {
    s.transcript.append(TranscriptEntry(role: .tutor, content: content, phase: s.phase, conceptId: s.currentConceptId, hintLevel: s.hintLevel))
    s.regenerations = 0
    return true
}

private func onLearnerTurn(_ s: inout LessonState, _ lesson: Lesson, _ content: String, _ confidence: Confidence?, _ effects: inout [LessonEffect]) -> Bool {
    guard let concept = currentConcept(s, lesson), s.started else { return false }
    let phase = s.phase
    if phase == .wrap || phase == .done { return false }

    s.transcript.append(TranscriptEntry(role: .learner, content: content, phase: phase, conceptId: concept.id, hintLevel: s.hintLevel))
    s.turnsThisPhase += 1

    switch phase {
    case .prime:
        let conf = confidence ?? .guess
        s.pretestRecord[concept.id] = PretestRecord(answer: content, confidence: conf)
        let pending = PendingGrade(itemId: scriptItemId(concept.id, .pretest), kind: .pretest, conceptId: concept.id,
                                   answer: content, confidence: conf, assisted: false)
        s.activeItem = ActiveItem(itemId: pending.itemId, kind: .pretest, assisted: false)
        effects.append(gradeEffect(&s, pending, .scriptPretest))
        // No correctness feedback after the pretest (errorful generation): move on regardless of the grade.
        effects.append(.showMessage(text: LETS_FIND_OUT))
        nextPhase(&s, lesson, .prime, &effects)
    case .probe, .develop, .extend, .remediate:
        effects.append(.callObserver(learnerTurn: content, conceptId: concept.id, objectiveIds: concept.objectives.map(\.id)))
    case .consolidate:
        let target = consolidateItem(concept)
        let pending = PendingGrade(itemId: target.itemId, kind: .consolidate, conceptId: concept.id, answer: content,
                                   confidence: confidence, assisted: true)
        s.activeItem = ActiveItem(itemId: target.itemId, kind: .consolidate, assisted: true)
        effects.append(gradeEffect(&s, pending, target.rubricSource))
    case .check:
        let itemId = scriptItemId(concept.id, .check)
        let pending = PendingGrade(itemId: itemId, kind: .check, conceptId: concept.id, answer: content,
                                   confidence: confidence ?? .guess, assisted: false)
        s.activeItem = ActiveItem(itemId: itemId, kind: .check, assisted: false)
        // Tutor stays silent: no call_tutor until graded.
        effects.append(gradeEffect(&s, pending, .scriptPretest))
    case .wrap, .done:
        return false
    }
    return true
}

private func onObserver(_ s: inout LessonState, _ lesson: Lesson, _ r: ObserverResult, _ effects: inout [LessonEffect]) -> Bool {
    guard let concept = currentConcept(s, lesson) else { return false }
    let phase = s.phase
    if phase != .probe && phase != .develop && phase != .extend && phase != .remediate { return false }
    mergeTags(&s, concept.id, r.misconceptionTags)

    switch phase {
    case .probe:
        if r.priorKnowledgeElicited || s.turnsThisPhase >= MAX_PROBE_TURNS {
            nextPhase(&s, lesson, .probe, &effects)
        } else {
            effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .probe)))
        }
    case .develop:
        if r.keyIdeaStated {
            nextPhase(&s, lesson, .develop, &effects)
            return true
        }
        if r.attemptMade {
            s.attemptsThisPhase += 1
            if s.hintLevel >= MAX_HINT_LEVEL {
                // Bottom-out hint has been given and explained (one more attempt): move on.
                nextPhase(&s, lesson, .develop, &effects)
                return true
            }
            s.guidingIndex = min(s.guidingIndex + 1, max(0, concept.script.guidingQuestions.count - 1))
            let withhold = s.scaffolding == .advanced && s.hintLevel == 0 && s.attemptsThisPhase < 2
            if !withhold { s.hintLevel = min(MAX_HINT_LEVEL, s.hintLevel + 1) }
            effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .develop)))
            return true
        }
        // No attempt (question, off-topic, "idk"): re-ask at the same hint level; never advance without an attempt.
        let preamble = r.offTopic
            ? "The learner went off topic; bring them back briefly."
            : "The learner did not make an attempt; briefly encourage one, then re-ask."
        effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .develop, preamble: preamble)))
    case .extend:
        if r.attemptMade {
            s.attemptsThisPhase += 1
            let pending = PendingGrade(itemId: scriptItemId(concept.id, .transfer), kind: .transfer, conceptId: concept.id,
                                       answer: lastLearnerTurn(s), confidence: nil, assisted: true)
            s.activeItem = ActiveItem(itemId: pending.itemId, kind: .transfer, assisted: true)
            effects.append(gradeEffect(&s, pending, .scriptTransfer))
        } else {
            effects.append(tutorEffect(&s, lesson, ControlOptions(
                kind: .extend, preamble: "The learner did not make an attempt; briefly encourage one, then re-pose the question.")))
        }
    case .remediate:
        if r.attemptMade { s.attemptsThisPhase += 1 }
        if r.keyIdeaStated || s.attemptsThisPhase >= MAX_REMEDIATE_ATTEMPTS {
            enterPhase(&s, lesson, .check, &effects, "Say briefly that you'll check again, then:")
        } else {
            effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .remediate)))
        }
    default:
        return false
    }
    return true
}

private func onGrade(_ s: inout LessonState, _ lesson: Lesson, _ itemKind: LessonItemKind, _ itemId: String, _ grade: GradeResult,
                     _ rating: Rating, _ effects: inout [LessonEffect]) -> Bool {
    guard let pending = s.pendingGrades[itemId], pending.kind == itemKind else { return false }
    // Note the TS mutates before the later guards, so a grade that is then ignored still clears the
    // pending entry and merges its tags into the returned state (with no effects).
    s.pendingGrades[itemId] = nil
    mergeTags(&s, pending.conceptId, grade.misconceptionTags)

    if pending.kind == .pretest {
        // Recorded whenever it arrives; the lesson has already moved on.
        effects.append(receiptEffect(pending, rating, grade))
        return true
    }

    guard let concept = currentConcept(s, lesson), concept.id == pending.conceptId else { return false }

    switch pending.kind {
    case .consolidate:
        if s.phase != .consolidate { return false }
        effects.append(receiptEffect(pending, rating, grade))
        if grade.score >= CONSOLIDATE_PASS_SCORE || s.consolidateLoops >= MAX_CONSOLIDATE_LOOPS {
            s.activeItem = nil
            nextPhase(&s, lesson, .consolidate, &effects, "Briefly affirm the learner's statement of the principle (one sentence), then:")
        } else {
            s.consolidateLoops += 1
            effects.append(tutorEffect(&s, lesson, ControlOptions(
                kind: .consolidate,
                preamble: "The learner's statement was graded and fell short. Grader feedback: \(grade.feedback) Give brief criterion-level corrective feedback in your own words without stating the full principle, then:")))
        }
    case .transfer:
        if s.phase != .extend { return false }
        effects.append(receiptEffect(pending, rating, grade))
        s.activeItem = nil
        nextPhase(&s, lesson, .extend, &effects,
                  "Give brief feedback on the learner's transfer attempt based on this grader feedback, without stating the reference answer: \(grade.feedback) Then:")
    case .check:
        if s.phase != .check { return false }
        s.checkResults[concept.id] = CheckResult(rating: rating, score: grade.score)
        effects.append(receiptEffect(pending, rating, grade))
        effects.append(.showMessage(text: grade.feedback))
        s.activeItem = nil
        if rating >= CHECK_PASS_RATING {
            effects.append(.activateItems(conceptId: concept.id, firstRating: rating))
            finishConcept(&s, lesson, &effects)
        } else {
            failCheck(&s, lesson, concept.id, rating, &effects)
        }
    case .pretest:
        return false
    }
    return true
}

private func onGiveUp(_ s: inout LessonState, _ lesson: Lesson, _ effects: inout [LessonEffect]) -> Bool {
    guard let concept = currentConcept(s, lesson), s.started else { return false }
    switch s.phase {
    case .prime:
        // An explicit "I don't know" counts as the pretest attempt.
        return onLearnerTurn(&s, lesson, "I don't know.", .guess, &effects)
    case .probe:
        nextPhase(&s, lesson, .probe, &effects)
    case .develop:
        // Reveal nothing; move to CONSOLIDATE.
        nextPhase(&s, lesson, .develop, &effects, "The learner gave up on the guided questions. Do not reveal the answer.")
    case .extend:
        let pending = PendingGrade(itemId: scriptItemId(concept.id, .transfer), kind: .transfer, conceptId: concept.id, answer: "",
                                   confidence: nil, assisted: true)
        s.pendingGrades[pending.itemId] = nil
        effects.append(receiptEffect(pending, .again))
        s.activeItem = nil
        nextPhase(&s, lesson, .extend, &effects, "The learner skipped the transfer question. Do not reveal its answer.")
    case .check:
        let itemId = scriptItemId(concept.id, .check)
        s.pendingGrades[itemId] = nil
        s.checkResults[concept.id] = CheckResult(rating: .again, score: 0)
        effects.append(receiptEffect(PendingGrade(itemId: itemId, kind: .check, conceptId: concept.id, answer: "",
                                                  confidence: .guess, assisted: false), .again))
        s.activeItem = nil
        failCheck(&s, lesson, concept.id, .again, &effects)
    case .remediate:
        enterPhase(&s, lesson, .check, &effects, "The learner asked to stop the remediation. Do not reveal the answer. Then:")
    case .consolidate, .wrap, .done:
        return false
    }
    return true
}

private func onSummary(_ s: inout LessonState, _ lesson: Lesson, _ text: String, _ effects: inout [LessonEffect]) -> Bool {
    if s.phase != .wrap || s.jolPending { return false }
    s.summaryText = text
    s.transcript.append(TranscriptEntry(role: .learner, content: text, phase: .wrap))
    s.jolPending = true
    effects.append(tutorEffect(&s, lesson, ControlOptions(kind: .summaryCheck)))
    effects.append(.requestJol(conceptIds: s.conceptIds))
    return true
}

private func onJol(_ s: inout LessonState, _ predictions: [String: Double], _ effects: inout [LessonEffect]) -> Bool {
    if s.phase != .wrap || !s.jolPending { return false }
    var jol: [String: Double] = [:]
    for id in s.conceptIds {
        if let p = predictions[id], p.isFinite { jol[id] = jsMax(0, jsMin(1, p)) }
    }
    s.jol = jol
    completeLesson(&s, &effects)
    return true
}

private func onLeak(_ s: inout LessonState, _ lesson: Lesson, _ effects: inout [LessonEffect]) -> Bool {
    guard let control = s.lastControl else { return false }
    s.regenerations += 1
    if s.regenerations >= MAX_LEAK_REGENERATIONS {
        s.regenerations = 0
        let hints = currentConcept(s, lesson)?.script.hints
        let canned = hints.map { h in s.hintLevel > 0 ? (s.hintLevel - 1 < h.count ? h[s.hintLevel - 1] : h[0]) : h[0] } ?? ""
        effects.append(.showMessage(text: canned))
        return true
    }
    effects.append(.callTutor(control: strictControl(control, s.regenerations)))
    return true
}
