import Foundation

// Concept-level layer above per-item FSRS (DESIGN §5.5; mastery.ts).
//
//   retention(c) = mean over items i∈c of R_i(now)
//   mastery(c)   = retention(c) × min(1, successful_sessions(c)/3)
//   available(c) = ∀ p ∈ prereq(c): mastery(p) ≥ 0.7
//   mastered(c)  = mastery(c) ≥ 0.85 && unassisted_pass_rate(c) ≥ 0.8

public let AVAILABILITY_THRESHOLD = 0.7
public let MASTERY_THRESHOLD = 0.85
public let UNASSISTED_PASS_THRESHOLD = 0.8
public let SESSIONS_FOR_FULL_MASTERY = 3
public let MAX_RECENT_MISCONCEPTIONS = 5

/// Mean retrievability over a concept's non-suspended cards. New cards count as 0. Empty → 0.
public func conceptRetention(_ cards: [Card], _ now: EpochMs, _ retrievability: (Card, EpochMs) -> Double) -> Double {
    let active = cards.filter { !$0.suspended }
    if active.isEmpty { return 0 }
    var sum = 0.0
    for c in active { sum += retrievability(c, now) }
    return sum / Double(active.count)
}

public func conceptMastery(_ retention: Double, _ successfulSessions: Int) -> Double {
    let r = jsMin(1, jsMax(0, retention))
    return r * jsMin(1, Double(max(0, successfulSessions)) / Double(SESSIONS_FOR_FULL_MASTERY))
}

/// Ids of direct prerequisites of `conceptId` (prereq edges `from → to` where `to` is the concept).
public func prerequisitesOf(_ conceptId: String, _ edges: [ConceptEdge]) -> [String] {
    edges.filter { $0.kind == .prereq && $0.to == conceptId }.map(\.from)
}

public func isAvailable(_ conceptId: String, _ edges: [ConceptEdge], _ masteryById: [String: Double],
                        threshold: Double = AVAILABILITY_THRESHOLD) -> Bool {
    prerequisitesOf(conceptId, edges).allSatisfy { (masteryById[$0] ?? 0) >= threshold }
}

public func isMastered(_ mastery: Double, _ unassistedPassRate: Double) -> Bool {
    mastery >= MASTERY_THRESHOLD && unassistedPassRate >= UNASSISTED_PASS_THRESHOLD
}

public func unassistedPassRate(_ state: ConceptState) -> Double {
    state.unassistedN == 0 ? 0 : Double(state.unassistedPass) / Double(state.unassistedN)
}

public func assistedPassRate(_ state: ConceptState) -> Double {
    state.assistedN == 0 ? 0 : Double(state.assistedPass) / Double(state.assistedN)
}

/// iPad (docs/AUDIT.md #4): "mastered" is earned only on mixed, out-of-context evidence, as Khan Academy's
/// Mastered is reachable only through mixed assessments. Lesson checks come straight after teaching and
/// are labelled by the lesson, so they gate the lesson but do not count here.
public let MIXED_EVIDENCE_MIN = 2

public func mixedPassRate(_ state: ConceptState) -> Double {
    let n = state.mixedN ?? 0
    return n == 0 ? 0 : Double(state.mixedPass ?? 0) / Double(n)
}

public func isMasteredOnMixedEvidence(_ state: ConceptState) -> Bool {
    (state.mixedN ?? 0) >= MIXED_EVIDENCE_MIN && isMastered(state.mastery, mixedPassRate(state))
}

public struct ConceptReceipt: Sendable, Hashable {
    public var rating: Rating
    public var assisted: Bool
    public var misconceptionTags: [String]
    /// Course-local study day "YYYY-MM-DD" (see `studyDay`).
    public var day: String
    /// Epoch ms of the receipt; sets `updatedAt` when given.
    public var at: EpochMs?
    /// iPad: answered out of context (a review, checkpoint, placement or progress check). Counts towards
    /// `mixedPass`/`mixedN` when unassisted.
    public var mixed: Bool
    public init(rating: Rating, assisted: Bool, misconceptionTags: [String] = [], day: String, at: EpochMs? = nil, mixed: Bool = false) {
        self.rating = rating; self.assisted = assisted; self.misconceptionTags = misconceptionTags; self.day = day; self.at = at
        self.mixed = mixed
    }
}

/// Fold one receipt into a concept's state. Pure.
///  - pass counters split by assisted/unassisted (DESIGN §6.5); success = rating ≥ Good.
///  - `successfulSessions` increments at most once per distinct study day, unassisted successes only.
///  - `misconceptions` keeps the 5 most recent tags, most recent first, de-duplicated.
///  - `mastery` is NOT recomputed here (it needs retrievability); call `conceptMastery` afterwards.
public func updateConceptStateAfterReceipt(_ state: ConceptState, _ receipt: ConceptReceipt) -> ConceptState {
    let success = receipt.rating.rawValue >= 3
    var next = state
    if receipt.assisted {
        next.assistedN += 1
        if success { next.assistedPass += 1 }
    } else {
        next.unassistedN += 1
        if success { next.unassistedPass += 1 }
        if success && jsCompareCodeUnits(receipt.day, state.lastSuccessDay ?? "") > 0 {
            next.successfulSessions += 1
            next.lastSuccessDay = receipt.day
        }
        if receipt.mixed {
            next.mixedN = (state.mixedN ?? 0) + 1
            next.mixedPass = (state.mixedPass ?? 0) + (success ? 1 : 0)
        }
    }
    if !receipt.misconceptionTags.isEmpty {
        var fresh: [String] = []
        for t in receipt.misconceptionTags where !fresh.contains(t) { fresh.append(t) }
        let kept = state.misconceptions.filter { !fresh.contains($0) }
        next.misconceptions = Array((fresh + kept).prefix(MAX_RECENT_MISCONCEPTIONS))
    }
    if let at = receipt.at { next.updatedAt = max(state.updatedAt, at) }
    return next
}

public struct PrerequisiteCycleError: Error, Sendable, Hashable, CustomStringConvertible {
    public var concepts: [String]
    public var description: String { "Prerequisite cycle detected among concepts: \(concepts.joined(separator: ", "))" }
}

/// Kahn topological order over prerequisite edges restricted to `concepts`. Deterministic: among the
/// concepts whose prerequisites are all placed, the earliest in input order goes next.
/// Throws when the prerequisite graph has a cycle, naming the concepts involved.
public func topologicalOrder(_ concepts: [String], _ edges: [ConceptEdge]) throws -> [String] {
    let ids = Set(concepts)
    var index: [String: Int] = [:]
    var indeg = JSMap<String, Int>()
    var out: [String: [String]] = [:]
    for (i, c) in concepts.enumerated() {
        if index[c] == nil { index[c] = i }
        indeg[c] = 0
        out[c] = []
    }
    for e in edges {
        // A self-loop is left in: its node never reaches in-degree 0 and is reported as a cycle.
        if e.kind != .prereq || !ids.contains(e.from) || !ids.contains(e.to) { continue }
        out[e.from]!.append(e.to)
        indeg[e.to] = (indeg[e.to] ?? 0) + 1
    }
    var ready = JSMap<String, Bool>()
    for (c, n) in indeg.entries where n == 0 { ready[c] = true }
    var order: [String] = []
    var done = Set<String>()
    while ready.count > 0 {
        var pick: String?
        for cand in ready.keys where pick == nil || index[cand]! < index[pick!]! { pick = cand }
        let c = pick!
        ready[c] = nil
        done.insert(c)
        order.append(c)
        for d in out[c]! {
            let n = indeg[d]! - 1
            indeg[d] = n
            if n == 0 { ready[d] = true }
        }
    }
    if order.count != ids.count {
        throw PrerequisiteCycleError(concepts: concepts.filter { !done.contains($0) })
    }
    return order
}

/// First lesson (units then lessons by ordinal) that is not completed and whose concepts are all
/// available. Prerequisites inside the same lesson are ignored: a lesson teaches its own concepts in order.
public func nextAvailableLesson(_ curriculum: Curriculum, _ masteryById: [String: Double], _ completedLessonIds: Set<String>,
                                threshold: Double = AVAILABILITY_THRESHOLD) -> Lesson? {
    let units = jsSorted(curriculum.units) { Double($0.ordinal - $1.ordinal) }
    for unit in units {
        let lessons = jsSorted(unit.lessons) { Double($0.ordinal - $1.ordinal) }
        for lesson in lessons {
            if completedLessonIds.contains(lesson.id) { continue }
            let own = Set(lesson.concepts.map(\.id))
            let external = curriculum.edges.filter { !(own.contains($0.from) && own.contains($0.to)) }
            if lesson.concepts.allSatisfy({ isAvailable($0.id, external, masteryById, threshold: threshold) }) { return lesson }
        }
    }
    return nil
}
