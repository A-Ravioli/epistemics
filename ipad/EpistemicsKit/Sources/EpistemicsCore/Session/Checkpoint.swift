// Unit checkpoint (web DESIGN §3.5; checkpoint.ts): composition, a minimal reducer, and the remediation
// mini-lesson plan for concepts that fail it. The iPad presents it as one exam paper (iPad DESIGN §6.5).

// MARK: - Composition

public let CHECKPOINT_DEFAULT_SIZE = 12
public let CHECKPOINT_UNIT_SHARE = 0.7
public let CHECKPOINT_PASS_THRESHOLD = 0.8

/// Item types that are never used in a checkpoint (self-graded or multi-turn).
public let CHECKPOINT_EXCLUDED_TYPES: [ItemType] = [.recall, .cloze, .teachback]

public struct ComposeCheckpointInput {
    public var unit: Unit
    public var previousUnits: [Unit]
    public var conceptMastery: [String: Double]
    public var size: Int?
    /// Uniform random in [0, 1). Injected for determinism.
    public var rng: Rng
    public init(unit: Unit, previousUnits: [Unit], conceptMastery: [String: Double], size: Int? = nil, rng: @escaping Rng) {
        self.unit = unit; self.previousUnits = previousUnits; self.conceptMastery = conceptMastery; self.size = size; self.rng = rng
    }
}

private func unitItems(_ unit: Unit) -> [Item] { unit.lessons.flatMap { $0.concepts.flatMap(\.items) } }
private func eligible(_ item: Item) -> Bool { !CHECKPOINT_EXCLUDED_TYPES.contains(item.type) }

private let UNIT_BLOOM_PREF: [Bloom: Double] = [.apply: 0, .analyze: 0, .understand: 1, .remember: 2]
private let PREV_TYPE_PREF: [ItemType: Double] = [.discriminate: 0, .apply: 0]

/// Fisher-Yates from the end, `j = floor(rng() * (i + 1))`, as the TS.
func jsShuffle<T>(_ arr: [T], _ rng: Rng) -> [T] {
    var a = arr
    var i = a.count - 1
    while i > 0 {
        let j = Int((rng() * Double(i + 1)).rounded(.down))
        a.swapAt(i, j)
        i -= 1
    }
    return a
}

/// Group items by concept, each group sorted by a preference key (lower is better), ties shuffled.
private func groupByConcept(_ items: [Item], _ key: (Item) -> Double, _ rng: Rng) -> JSMap<String, [Item]> {
    var groups = JSMap<String, [Item]>()
    for item in jsShuffle(items, rng) { groups[item.conceptId] = (groups[item.conceptId] ?? []) + [item] }
    for id in groups.keys {
        let indexed = groups[id]!.enumerated().map { (i: $0.element, n: $0.offset) }
        groups[id] = jsSorted(indexed) { a, b in
            let k = key(a.i) - key(b.i)
            return jsTruthy(k) ? k : Double(a.n - b.n)
        }.map(\.i)
    }
    return groups
}

/// Round-robin over concept groups (one item per concept first, then seconds, …) until `n` items.
private func roundRobin(_ groups: JSMap<String, [Item]>, _ conceptOrder: [String], _ n: Int) -> [Item] {
    var out: [Item] = []
    var depth = 0
    var took = true
    while out.count < n && took {
        took = false
        for id in conceptOrder {
            if out.count >= n { break }
            if let g = groups[id], depth < g.count {
                out.append(g[depth])
                took = true
            }
        }
        depth += 1
    }
    return out
}

/// ~70% items from the unit just finished (apply/analyze preferred, one per concept where possible),
/// ~30% from earlier units (discriminate/apply preferred, lowest-mastery concepts first).
public func composeCheckpoint(_ input: ComposeCheckpointInput) -> [Item] {
    let size = max(1, input.size ?? CHECKPOINT_DEFAULT_SIZE)
    let rng = input.rng
    let unitPool = unitItems(input.unit).filter(eligible)
    let prevPool = input.previousUnits.flatMap(unitItems).filter(eligible)

    var unitTarget = prevPool.isEmpty ? size : Int(jsRound(Double(size) * CHECKPOINT_UNIT_SHARE))
    var prevTarget = size - unitTarget

    let unitGroups = groupByConcept(unitPool, { UNIT_BLOOM_PREF[$0.bloom]! }, rng)
    let unitOrder = jsShuffle(unitGroups.keys, rng)
    var fromUnit = roundRobin(unitGroups, unitOrder, unitTarget)

    func mastery(_ id: String) -> Double { input.conceptMastery[id] ?? 0 }
    let prevGroups = groupByConcept(prevPool, { PREV_TYPE_PREF[$0.type] ?? 1 }, rng)
    let prevOrder = jsSorted(jsShuffle(prevGroups.keys, rng)) { mastery($0) - mastery($1) }
    var fromPrev = roundRobin(prevGroups, prevOrder, prevTarget)

    // Fill shortfalls from the other pool.
    if fromUnit.count < unitTarget {
        prevTarget += unitTarget - fromUnit.count
        fromPrev = roundRobin(prevGroups, prevOrder, prevTarget)
    } else if fromPrev.count < prevTarget {
        unitTarget += prevTarget - fromPrev.count
        fromUnit = roundRobin(unitGroups, unitOrder, unitTarget)
    }

    // Interleave so earlier-unit items are spread through the checkpoint.
    return jsShuffle(fromUnit + fromPrev, rng)
}

// MARK: - Reducer

public struct CheckpointItemRef: Codable, Sendable, Hashable {
    public var itemId: String
    public var conceptId: String
}

public struct CheckpointAnswer: Codable, Sendable, Hashable {
    public var answer: String
    public var confidence: Confidence
}

public struct CheckpointGrade: Codable, Sendable, Hashable {
    public var score: Double
    public var rating: Rating
}

public struct CheckpointState: Codable, Sendable, Hashable {
    public var sessionId: String
    public var courseId: String
    public var unitId: String
    public var items: [CheckpointItemRef]
    public var index: Int
    public var answers: [String: CheckpointAnswer]
    public var grades: [String: CheckpointGrade]
    public var started: Bool
    public var done: Bool
}

public enum CheckpointEvent: Sendable, Hashable {
    case start
    case answerSubmitted(itemId: String, answer: String, confidence: Confidence)
    case grade(itemId: String, grade: GradeResult, rating: Rating)
    case finish
}

public struct ConceptCheckpointResult: Codable, Sendable, Hashable {
    public var passed: Bool
    public var score: Double
}

public struct CheckpointResult: Codable, Sendable, Hashable {
    public var perConcept: [String: ConceptCheckpointResult]
    /// Concepts that failed, sorted by id.
    public var reopen: [String]
}

/// `grade_item` always carries itemKind "checkpoint", assisted false, rubricSource "item";
/// `record_receipt` itemKind "checkpoint", assisted false.
public enum CheckpointEffect: Sendable, Hashable {
    case presentItem(itemId: String, conceptId: String, index: Int, total: Int)
    case gradeItem(itemId: String, conceptId: String, answer: String, confidence: Confidence)
    case recordReceipt(itemId: String, conceptId: String, answer: String, confidence: Confidence, grade: GradeResult, rating: Rating)
    case checkpointComplete(CheckpointResult)
}

public struct CheckpointStep: Sendable, Hashable {
    public var state: CheckpointState
    public var effects: [CheckpointEffect]
}

public func createCheckpointState(sessionId: String, courseId: String, unitId: String, items: [Item]) -> CheckpointState {
    CheckpointState(sessionId: sessionId, courseId: courseId, unitId: unitId,
                    items: items.map { CheckpointItemRef(itemId: $0.id, conceptId: $0.conceptId) },
                    index: 0, answers: [:], grades: [:], started: false, done: false)
}

/// Per-concept mean score over the checkpoint's items (ungraded items count as 0).
public func scoreCheckpoint(_ state: CheckpointState) -> CheckpointResult {
    var sums = JSMap<String, (total: Double, n: Int)>()
    for ref in state.items {
        var acc = sums[ref.conceptId] ?? (0, 0)
        acc.total += state.grades[ref.itemId]?.score ?? 0
        acc.n += 1
        sums[ref.conceptId] = acc
    }
    var perConcept: [String: ConceptCheckpointResult] = [:]
    var reopen: [String] = []
    for (conceptId, acc) in jsSorted(sums.entries, { Double(jsCompareCodeUnits($0.0, $1.0)) }) {
        let score = acc.n == 0 ? 0 : acc.total / Double(acc.n)
        let passed = score >= CHECKPOINT_PASS_THRESHOLD
        perConcept[conceptId] = ConceptCheckpointResult(passed: passed, score: score)
        if !passed { reopen.append(conceptId) }
    }
    return CheckpointResult(perConcept: perConcept, reopen: reopen)
}

private func presentEffect(_ s: CheckpointState) -> CheckpointEffect? {
    guard s.index < s.items.count else { return nil }
    let cur = s.items[s.index]
    return .presentItem(itemId: cur.itemId, conceptId: cur.conceptId, index: s.index, total: s.items.count)
}

private func complete(_ s: inout CheckpointState, _ effects: inout [CheckpointEffect]) {
    s.done = true
    effects.append(.checkpointComplete(scoreCheckpoint(s)))
}

public func reduceCheckpoint(_ state: CheckpointState, _ event: CheckpointEvent) -> CheckpointStep {
    if state.done { return CheckpointStep(state: state, effects: []) }
    var s = state
    var effects: [CheckpointEffect] = []
    switch event {
    case .start:
        if s.started { return CheckpointStep(state: s, effects: []) }
        s.started = true
        if let p = presentEffect(s) { effects.append(p) } else { complete(&s, &effects) }
    case let .answerSubmitted(itemId, answer, confidence):
        guard s.started, s.index < s.items.count, s.items[s.index].itemId == itemId, s.answers[itemId] == nil else {
            return CheckpointStep(state: s, effects: [])
        }
        let cur = s.items[s.index]
        s.answers[itemId] = CheckpointAnswer(answer: answer, confidence: confidence)
        effects.append(.gradeItem(itemId: cur.itemId, conceptId: cur.conceptId, answer: answer, confidence: confidence))
    case let .grade(itemId, grade, rating):
        guard let entry = s.items.first(where: { $0.itemId == itemId }), let answer = s.answers[itemId], s.grades[itemId] == nil else {
            return CheckpointStep(state: s, effects: [])
        }
        s.grades[itemId] = CheckpointGrade(score: grade.score, rating: rating)
        effects.append(.recordReceipt(itemId: entry.itemId, conceptId: entry.conceptId, answer: answer.answer,
                                      confidence: answer.confidence, grade: grade, rating: rating))
        if s.index < s.items.count && s.items[s.index].itemId == itemId { s.index += 1 }
        if let p = presentEffect(s) {
            effects.append(p)
        } else if s.grades.count >= s.items.count {
            complete(&s, &effects)
        }
    case .finish:
        complete(&s, &effects)
    }
    return CheckpointStep(state: s, effects: effects)
}

// MARK: - Remediation mini-lesson

public struct RemediationPlan: Sendable, Hashable {
    /// Synthetic single-concept lesson to pass to `reduceLesson`.
    public var lesson: Lesson
    /// Lesson state restricted to DEVELOP → CONSOLIDATE → CHECK, no summary/JOL.
    public var state: LessonState
}

public func composeRemediation(_ concept: Concept, sessionId: String, courseId: String, scaffolding: Scaffolding? = nil,
                               learnerMisconceptions: [String]? = nil) -> RemediationPlan {
    let lesson = Lesson(id: "remediation:\(concept.id)", ordinal: 0, title: "Remediation: \(concept.name)", summary: nil, concepts: [concept])
    let state = createLessonState(CreateLessonStateInput(
        sessionId: sessionId, courseId: courseId, lesson: lesson, scaffolding: scaffolding ?? .developing,
        learnerMisconceptions: learnerMisconceptions.map { [concept.id: $0] }, phases: REMEDIATION_PHASE_PLAN, wrap: false))
    return RemediationPlan(lesson: lesson, state: state)
}

// MARK: - Coding (web JSON shape)

extension CheckpointEvent: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let type: String = try c.get("type")
        switch type {
        case "start": self = .start
        case "answer_submitted": self = .answerSubmitted(itemId: try c.get("itemId"), answer: try c.get("answer"), confidence: try c.get("confidence"))
        case "grade": self = .grade(itemId: try c.get("itemId"), grade: try c.get("grade"), rating: try c.get("rating"))
        case "finish": self = .finish
        default: throw UnknownTypeError(type: type)
        }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        switch self {
        case .start: try c.put("type", "start")
        case let .answerSubmitted(itemId, answer, confidence):
            try c.put("type", "answer_submitted"); try c.put("itemId", itemId); try c.put("answer", answer); try c.put("confidence", confidence)
        case let .grade(itemId, grade, rating):
            try c.put("type", "grade"); try c.put("itemId", itemId); try c.put("grade", grade); try c.put("rating", rating)
        case .finish: try c.put("type", "finish")
        }
    }
}

extension CheckpointEffect: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let type: String = try c.get("type")
        switch type {
        case "present_item":
            self = .presentItem(itemId: try c.get("itemId"), conceptId: try c.get("conceptId"), index: try c.get("index"), total: try c.get("total"))
        case "grade_item":
            self = .gradeItem(itemId: try c.get("itemId"), conceptId: try c.get("conceptId"), answer: try c.get("answer"), confidence: try c.get("confidence"))
        case "record_receipt":
            self = .recordReceipt(itemId: try c.get("itemId"), conceptId: try c.get("conceptId"), answer: try c.get("answer"),
                                  confidence: try c.get("confidence"), grade: try c.get("grade"), rating: try c.get("rating"))
        case "checkpoint_complete": self = .checkpointComplete(try CheckpointResult(from: decoder))
        default: throw UnknownTypeError(type: type)
        }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        switch self {
        case let .presentItem(itemId, conceptId, index, total):
            try c.put("type", "present_item"); try c.put("itemId", itemId); try c.put("conceptId", conceptId)
            try c.put("index", index); try c.put("total", total)
        case let .gradeItem(itemId, conceptId, answer, confidence):
            try c.put("type", "grade_item"); try c.put("itemKind", "checkpoint"); try c.put("itemId", itemId)
            try c.put("conceptId", conceptId); try c.put("answer", answer); try c.put("confidence", confidence)
            try c.put("assisted", false); try c.put("rubricSource", "item")
        case let .recordReceipt(itemId, conceptId, answer, confidence, grade, rating):
            try c.put("type", "record_receipt"); try c.put("itemKind", "checkpoint"); try c.put("itemId", itemId)
            try c.put("conceptId", conceptId); try c.put("answer", answer); try c.put("confidence", confidence)
            try c.put("grade", grade); try c.put("rating", rating); try c.put("assisted", false)
        case .checkpointComplete(let r):
            try c.put("type", "checkpoint_complete"); try r.encode(to: encoder)
        }
    }
}
