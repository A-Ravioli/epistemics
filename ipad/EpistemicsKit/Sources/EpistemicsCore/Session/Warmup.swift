// Warm-up brain dump (web DESIGN §3.2, iPad DESIGN §6.2; warmup.ts): "write everything you remember from
// your last lesson". Grading is done blind by the grader; this module only builds the prompt and maps the
// grader's recalled-concept list to review outcomes.

public let WARMUP_RATING: Rating = .good

/// Free-recall prompt. Deliberately names no concepts (that would be a cue, not recall).
public func buildWarmupPrompt(_ lastLesson: Lesson) -> String {
    // The card supplies the heading, the time box and "order and polish do not matter".
    "Write everything you remember from your last lesson, \"\(lastLesson.title)\": " +
        "key ideas, definitions, examples, anything at all, in your own words. " +
        "Do not look anything up; this is recall, not review."
}

public struct WarmupOutcome: Codable, Sendable, Hashable {
    public struct Reviewed: Codable, Sendable, Hashable {
        public var conceptId: String
        public var rating: Rating
    }
    /// Concepts the learner recalled: each counts as a review with rating Good.
    public var reviewed: [Reviewed]
    /// Concepts of the lesson that were not recalled: queued first in today's review.
    public var queuedFirst: [String]
}

/// Maps the grader's recalled concept ids (restricted to the lesson's concepts) to review outcomes.
public func mapWarmupResult(_ recalledConceptIds: [String], _ lesson: Lesson) -> WarmupOutcome {
    let recalled = Set(recalledConceptIds)
    var out = WarmupOutcome(reviewed: [], queuedFirst: [])
    for c in lesson.concepts {
        if recalled.contains(c.id) { out.reviewed.append(.init(conceptId: c.id, rating: WARMUP_RATING)) } else { out.queuedFirst.append(c.id) }
    }
    return out
}
