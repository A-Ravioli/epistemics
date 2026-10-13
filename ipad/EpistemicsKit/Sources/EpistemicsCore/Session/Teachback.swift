// Teach-back session (web DESIGN §3.6, iPad DESIGN §6.7; teachback.ts): the model plays a curious,
// slightly confused student who has read nothing. Minimal pure reducer.

public let TEACHBACK_MAX_LEARNER_TURNS = 6
public let TEACHBACK_MAX_WORDS = 80
/// The student's wrong belief is posed on this student turn (1-based).
public let TEACHBACK_WRONG_BELIEF_TURN = 3

public enum StudentMove: String, Codable, Sendable, Hashable {
    case clarify
    case wrongBelief = "wrong_belief"
    case example, closing
}

public struct StudentControl: Codable, Sendable, Hashable {
    public var conceptId: String
    public var conceptName: String
    public var move: StudentMove
    public var turn: Int
    public var maxWords: Int
    public var instruction: String
}

public struct TeachbackTurn: Codable, Sendable, Hashable {
    public enum Role: String, Codable, Sendable, Hashable { case student, learner }
    public var role: Role
    public var content: String
}

public struct TeachbackState: Codable, Sendable, Hashable {
    public var sessionId: String
    public var courseId: String
    public var conceptId: String
    public var conceptName: String
    /// The concept's `teachback` item id, or `<conceptId>#teachback` when it has none.
    public var itemId: String
    public var turns: [TeachbackTurn]
    public var learnerTurns: Int
    public var studentQuestionsAsked: Int
    public var wrongBeliefPosed: Bool
    public var exampleAsked: Bool
    public var started: Bool
    public var grading: Bool
    public var done: Bool
}

public enum TeachbackEvent: Sendable, Hashable {
    case start
    case learnerTurn(content: String, done: Bool? = nil)
    case studentTurn(content: String)
    case end
    case grade(grade: GradeResult, rating: Rating)
}

/// `grade_item` / `record_receipt` always carry itemKind "teachback", assisted false (and rubricSource "item").
public enum TeachbackEffect: Sendable, Hashable {
    case callStudent(control: StudentControl)
    case gradeItem(itemId: String, conceptId: String, answer: String)
    case recordReceipt(itemId: String, conceptId: String, answer: String, grade: GradeResult, rating: Rating)
    case teachbackComplete(conceptId: String, itemId: String, score: Double, rating: Rating, learnerTurns: Int)
}

public struct TeachbackStep: Sendable, Hashable {
    public var state: TeachbackState
    public var effects: [TeachbackEffect]
}

public func createTeachbackState(sessionId: String, courseId: String, concept: Concept) -> TeachbackState {
    let item = concept.items.first { $0.type == .teachback }
    return TeachbackState(sessionId: sessionId, courseId: courseId, conceptId: concept.id, conceptName: concept.name,
                          itemId: item?.id ?? "\(concept.id)#teachback", turns: [], learnerTurns: 0, studentQuestionsAsked: 0,
                          wrongBeliefPosed: false, exampleAsked: false, started: false, grading: false, done: false)
}

private let PERSONA =
    "You are a curious, slightly confused student who has read nothing about this topic and knows only its name. " +
    "Never explain the concept yourself, never confirm whether the learner is right, and never look things up. "

public func buildStudentControl(_ state: TeachbackState, _ move: StudentMove) -> StudentControl {
    let turn = state.studentQuestionsAsked + 1
    let name = "\"\(state.conceptName)\""
    let instruction: String
    switch move {
    case .clarify:
        instruction =
            "\(PERSONA)The learner is teaching you \(name). Ask exactly one clarifying question about something they just said " +
            "(or, if this is the first turn, ask them to start explaining \(name) from the beginning). ≤\(TEACHBACK_MAX_WORDS) words."
    case .wrongBelief:
        instruction =
            "\(PERSONA)The learner is teaching you \(name). State exactly one plausible but wrong belief about it, as your own confused " +
            "understanding (\"so that means…?\"), and ask them whether that is right. Do this only once; do not correct yourself. ≤\(TEACHBACK_MAX_WORDS) words."
    case .example:
        instruction =
            "\(PERSONA)The learner is teaching you \(name). Say you still find it abstract and ask them for one concrete example " +
            "and how it works in that example. Ask exactly one question. ≤\(TEACHBACK_MAX_WORDS) words."
    case .closing:
        instruction =
            "\(PERSONA)The learner has finished teaching you \(name). Thank them in one or two sentences and say what you will remember. " +
            "Do not ask a question. ≤\(TEACHBACK_MAX_WORDS) words."
    }
    return StudentControl(conceptId: state.conceptId, conceptName: state.conceptName, move: move, turn: turn,
                          maxWords: TEACHBACK_MAX_WORDS, instruction: instruction)
}

private func nextMove(_ s: TeachbackState) -> StudentMove {
    let turn = s.studentQuestionsAsked + 1
    if !s.wrongBeliefPosed && turn >= TEACHBACK_WRONG_BELIEF_TURN { return .wrongBelief }
    if !s.exampleAsked && s.wrongBeliefPosed && turn >= TEACHBACK_WRONG_BELIEF_TURN + 1 { return .example }
    return .clarify
}

private func studentEffect(_ s: inout TeachbackState, _ move: StudentMove) -> TeachbackEffect {
    let control = buildStudentControl(s, move)
    if move != .closing { s.studentQuestionsAsked += 1 }
    if move == .wrongBelief { s.wrongBeliefPosed = true }
    if move == .example { s.exampleAsked = true }
    return .callStudent(control: control)
}

/// The learner's whole explanation, in order, as one text for the blind grader.
public func learnerExplanation(_ state: TeachbackState) -> String {
    state.turns.filter { $0.role == .learner }.map { jsTrim($0.content) }.filter { !$0.isEmpty }.joined(separator: "\n\n")
}

private func beginGrading(_ s: inout TeachbackState, _ effects: inout [TeachbackEffect]) {
    s.grading = true
    effects.append(.gradeItem(itemId: s.itemId, conceptId: s.conceptId, answer: learnerExplanation(s)))
}

public func reduceTeachback(_ state: TeachbackState, _ event: TeachbackEvent) -> TeachbackStep {
    if state.done { return TeachbackStep(state: state, effects: []) }
    var s = state
    var effects: [TeachbackEffect] = []
    switch event {
    case .start:
        if s.started { return TeachbackStep(state: s, effects: []) }
        s.started = true
        effects.append(studentEffect(&s, .clarify))
    case .studentTurn(let content):
        if !s.started || s.grading { return TeachbackStep(state: s, effects: []) }
        s.turns.append(TeachbackTurn(role: .student, content: content))
    case let .learnerTurn(content, done):
        if !s.started || s.grading { return TeachbackStep(state: s, effects: []) }
        s.turns.append(TeachbackTurn(role: .learner, content: content))
        s.learnerTurns += 1
        if done == true || s.learnerTurns >= TEACHBACK_MAX_LEARNER_TURNS {
            effects.append(studentEffect(&s, .closing))
            beginGrading(&s, &effects)
        } else {
            effects.append(studentEffect(&s, nextMove(s)))
        }
    case .end:
        if !s.started || s.grading { return TeachbackStep(state: s, effects: []) }
        if s.learnerTurns == 0 {
            s.done = true
            return TeachbackStep(state: s, effects: [])
        }
        beginGrading(&s, &effects)
    case let .grade(grade, rating):
        if !s.grading { return TeachbackStep(state: s, effects: []) }
        s.done = true
        effects.append(.recordReceipt(itemId: s.itemId, conceptId: s.conceptId, answer: learnerExplanation(s), grade: grade, rating: rating))
        effects.append(.teachbackComplete(conceptId: s.conceptId, itemId: s.itemId, score: grade.score, rating: rating, learnerTurns: s.learnerTurns))
    }
    return TeachbackStep(state: s, effects: effects)
}

// MARK: - Coding (web JSON shape)

extension TeachbackEvent: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let type: String = try c.get("type")
        switch type {
        case "start": self = .start
        case "learner_turn": self = .learnerTurn(content: try c.get("content"), done: try c.opt("done"))
        case "student_turn": self = .studentTurn(content: try c.get("content"))
        case "end": self = .end
        case "grade": self = .grade(grade: try c.get("grade"), rating: try c.get("rating"))
        default: throw UnknownTypeError(type: type)
        }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        switch self {
        case .start: try c.put("type", "start")
        case let .learnerTurn(content, done): try c.put("type", "learner_turn"); try c.put("content", content); try c.putIfPresent("done", done)
        case .studentTurn(let content): try c.put("type", "student_turn"); try c.put("content", content)
        case .end: try c.put("type", "end")
        case let .grade(grade, rating): try c.put("type", "grade"); try c.put("grade", grade); try c.put("rating", rating)
        }
    }
}

extension TeachbackEffect: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let type: String = try c.get("type")
        switch type {
        case "call_student": self = .callStudent(control: try c.get("control"))
        case "grade_item": self = .gradeItem(itemId: try c.get("itemId"), conceptId: try c.get("conceptId"), answer: try c.get("answer"))
        case "record_receipt":
            self = .recordReceipt(itemId: try c.get("itemId"), conceptId: try c.get("conceptId"), answer: try c.get("answer"),
                                  grade: try c.get("grade"), rating: try c.get("rating"))
        case "teachback_complete":
            self = .teachbackComplete(conceptId: try c.get("conceptId"), itemId: try c.get("itemId"), score: try c.get("score"),
                                      rating: try c.get("rating"), learnerTurns: try c.get("learnerTurns"))
        default: throw UnknownTypeError(type: type)
        }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        switch self {
        case .callStudent(let control): try c.put("type", "call_student"); try c.put("control", control)
        case let .gradeItem(itemId, conceptId, answer):
            try c.put("type", "grade_item"); try c.put("itemKind", "teachback"); try c.put("itemId", itemId); try c.put("conceptId", conceptId)
            try c.put("answer", answer); try c.put("assisted", false); try c.put("rubricSource", "item")
        case let .recordReceipt(itemId, conceptId, answer, grade, rating):
            try c.put("type", "record_receipt"); try c.put("itemKind", "teachback"); try c.put("itemId", itemId); try c.put("conceptId", conceptId)
            try c.put("answer", answer); try c.put("grade", grade); try c.put("rating", rating); try c.put("assisted", false)
        case let .teachbackComplete(conceptId, itemId, score, rating, learnerTurns):
            try c.put("type", "teachback_complete"); try c.put("conceptId", conceptId); try c.put("itemId", itemId)
            try c.put("score", score); try c.put("rating", rating); try c.put("learnerTurns", learnerTurns)
        }
    }
}
