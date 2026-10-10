import Foundation

// Progress checks and item variants (ipad docs/AUDIT.md #3, #4).
//
// A progress check is a short, mixed, unaided test over what the learner has already learned or placed out
// of: the iPad's version of ALEKS's Progress Knowledge Check and Khan's Mastery Challenge. Nothing on the
// page says which idea is being tested, so a pass is evidence of knowing when to use it, not only how. A
// miss demotes the concept. Its answers are mixed evidence and count towards "mastered".

public let PROGRESS_CHECK_SIZE = 6
/// Due after this many lessons finished since the last check…
public let PROGRESS_CHECK_EVERY_LESSONS = 4
/// …or this many days since the last check (or since enrolment)…
public let PROGRESS_CHECK_EVERY_DAYS = 14
/// …or sooner when placement left concepts that nothing has confirmed yet.
public let PROGRESS_CHECK_PROVISIONAL_DAYS = 7
/// Below this many learned concepts there is nothing to mix.
public let PROGRESS_CHECK_MIN_CONCEPTS = 3
/// At most this many questions from one lesson, so the check spans the course.
public let PROGRESS_CHECK_MAX_PER_LESSON = 2

public struct ProgressCheckCandidate: Sendable, Hashable {
    public var conceptId: String
    /// The item to ask (an activated card's item).
    public var itemId: String
    /// Placed out of and not yet confirmed by an out-of-context pass.
    public var provisional: Bool
    public var mastery: Double
    /// Out-of-context answers so far (`ConceptState.mixedN`).
    public var mixedN: Int
    public init(conceptId: String, itemId: String, provisional: Bool, mastery: Double, mixedN: Int) {
        self.conceptId = conceptId; self.itemId = itemId; self.provisional = provisional; self.mastery = mastery; self.mixedN = mixedN
    }
}

public struct ProgressCheckQuestion: Sendable, Hashable {
    public var conceptId: String
    public var itemId: String
    public init(conceptId: String, itemId: String) { self.conceptId = conceptId; self.itemId = itemId }
}

public func progressCheckDue(lessonsSinceLast: Int, daysSinceLast: Int, eligibleConcepts: Int, hasProvisional: Bool) -> Bool {
    guard eligibleConcepts >= PROGRESS_CHECK_MIN_CONCEPTS else { return false }
    if lessonsSinceLast >= PROGRESS_CHECK_EVERY_LESSONS { return true }
    return daysSinceLast >= (hasProvisional ? PROGRESS_CHECK_PROVISIONAL_DAYS : PROGRESS_CHECK_EVERY_DAYS)
}

/// The questions for a check, in the order to ask them. Pure and deterministic.
///  - Priority: provisional concepts first (nothing has confirmed them), then the least out-of-context
///    evidence, then the lowest mastery, then course order.
///  - At most `PROGRESS_CHECK_MAX_PER_LESSON` per lesson unless there is not enough else to ask.
///  - Interleaved: no two consecutive questions from the same lesson where that can be avoided, because
///    choosing the method is part of what is being checked.
public func selectProgressCheck(_ curriculum: Curriculum, _ candidates: [ProgressCheckCandidate],
                                size: Int = PROGRESS_CHECK_SIZE) -> [ProgressCheckQuestion] {
    var courseOrder: [String: Int] = [:]
    var lessonOf: [String: String] = [:]
    for (i, lesson) in curriculum.allLessons.enumerated() {
        for (j, c) in lesson.concepts.enumerated() {
            courseOrder[c.id] = i * 100 + j
            lessonOf[c.id] = lesson.id
        }
    }
    var seen = Set<String>()
    let ranked = candidates
        .filter { seen.insert($0.conceptId).inserted && courseOrder[$0.conceptId] != nil }
        .sorted { a, b in
            if a.provisional != b.provisional { return a.provisional }
            if a.mixedN != b.mixedN { return a.mixedN < b.mixedN }
            if a.mastery != b.mastery { return a.mastery < b.mastery }
            return courseOrder[a.conceptId]! < courseOrder[b.conceptId]!
        }

    // Pick, capping each lesson, then top up from the overflow if the cap left the check short.
    var picked: [ProgressCheckCandidate] = []
    var overflow: [ProgressCheckCandidate] = []
    var perLesson: [String: Int] = [:]
    for c in ranked where picked.count < size {
        let lesson = lessonOf[c.conceptId]!
        if perLesson[lesson, default: 0] < PROGRESS_CHECK_MAX_PER_LESSON {
            picked.append(c)
            perLesson[lesson, default: 0] += 1
        } else {
            overflow.append(c)
        }
    }
    for c in overflow where picked.count < size { picked.append(c) }

    // Interleave: next comes the lesson with the most questions left that is not the last one asked (ties to
    // the higher-ranked question). Taking the fullest lesson first is what avoids a same-lesson pair at the end.
    var remaining = picked
    var ordered: [ProgressCheckCandidate] = []
    while !remaining.isEmpty {
        let last = ordered.last.map { lessonOf[$0.conceptId]! }
        var left: [String: Int] = [:]
        for c in remaining { left[lessonOf[c.conceptId]!, default: 0] += 1 }
        let eligible = remaining.indices.filter { lessonOf[remaining[$0].conceptId]! != last }
        let pool = eligible.isEmpty ? Array(remaining.indices) : eligible
        // `pool` is in rank order, so the first index with the most left wins ties.
        let most = pool.map { left[lessonOf[remaining[$0].conceptId]!]! }.max()!
        let index = pool.first { left[lessonOf[remaining[$0].conceptId]!]! == most }!
        ordered.append(remaining.remove(at: index))
    }
    return ordered.map { ProgressCheckQuestion(conceptId: $0.conceptId, itemId: $0.itemId) }
}

// MARK: - Variants

public struct VariantUse: Sendable, Hashable {
    /// nil: the item itself.
    public var variantId: String?
    public var at: EpochMs
    public init(variantId: String?, at: EpochMs) { self.variantId = variantId; self.at = at }
}

/// Which version of an item to serve next (docs/AUDIT.md #3): the first never served, in order (the item
/// itself, then its variants), else the one served longest ago. The item counts as one of its versions, so a
/// pack without variants always serves the item.
public func nextVariant(_ item: Item, history: [VariantUse]) -> String? {
    let versions: [String?] = [nil] + (item.variants ?? []).map { Optional($0.id) }
    var lastUse: [String: EpochMs] = [:]
    for use in history {
        let key = use.variantId ?? ""
        lastUse[key] = max(lastUse[key] ?? .min, use.at)
    }
    var best: String?? = nil
    var bestAt = EpochMs.max
    for v in versions {
        guard let at = lastUse[v ?? ""] else { return v }
        if at < bestAt { best = v; bestAt = at }
    }
    return best ?? nil
}
