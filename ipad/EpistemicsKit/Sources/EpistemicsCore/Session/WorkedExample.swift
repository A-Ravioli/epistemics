import Foundation

// The concept card and the worked example on the lesson page (ipad docs/UX-AUDIT.md §3.2, ipad docs/AUDIT.md
// #6). The lesson reducer is the web's and is unchanged: these decide only how much of the concept's worked
// example the page shows, and how much support a lesson starts with.
//
// Evidence: studying a worked example before solving helps novices (Sweller & Cooper 1985), and fading it,
// one step fewer each time with the learner completing the rest, helps further (Atkinson, Renkl & Merrill
// 2003). As learners gain expertise the support should go (the expertise reversal effect, Kalyuga 2003).

/// iPad: the support a lesson starts with, from how secure the ideas it builds on are, rather than one level
/// for the whole course. A lesson with nothing earlier to build on keeps the course's level (set by placement).
///  - mean mastery of the prerequisites outside the lesson < 0.8: novice (they only just unlocked it)
///  - < 0.92: developing
///  - otherwise: advanced
public func lessonScaffolding(_ lesson: Lesson, _ curriculum: Curriculum, _ masteryById: [String: Double],
                              courseDefault: Scaffolding) -> Scaffolding {
    let own = Set(lesson.concepts.map(\.id))
    var prereqs: [String] = []
    for e in curriculum.edges where e.kind == .prereq && own.contains(e.to) && !own.contains(e.from) && !prereqs.contains(e.from) {
        prereqs.append(e.from)
    }
    guard !prereqs.isEmpty else { return courseDefault }
    let mean = prereqs.map { masteryById[$0] ?? 0 }.reduce(0, +) / Double(prereqs.count)
    if mean < 0.8 { return .novice }
    if mean < 0.92 { return .developing }
    return .advanced
}

/// How one concept's worked example appears on the page.
public struct WorkedExamplePlan: Sendable, Hashable {
    /// Steps shown typeset, from the first.
    public var typesetSteps: Int
    /// Steps after those that the learner completes by hand, then compares with the typeset ones.
    public var learnerSteps: Int
    /// Advanced: the example stays folded until the learner has had a go at the tutor's question.
    public var foldedUntilAttempt: Bool

    public var studyFirst: Bool { learnerSteps == 0 && !foldedUntilAttempt }
    public init(typesetSteps: Int, learnerSteps: Int, foldedUntilAttempt: Bool) {
        self.typesetSteps = typesetSteps; self.learnerSteps = learnerSteps; self.foldedUntilAttempt = foldedUntilAttempt
    }
}

/// Backward fading across a lesson's concepts: for a novice the first concept's example is shown whole to
/// study, and each later one typesets one step fewer; a developing learner starts one step further on. The
/// first step is always typeset, so the learner is never handed a bare problem as an "example". Advanced
/// learners get the whole example as a reference, but only after an attempt.
public func workedExamplePlan(scaffolding: Scaffolding, conceptIndex: Int, stepCount: Int) -> WorkedExamplePlan {
    guard stepCount > 0 else { return WorkedExamplePlan(typesetSteps: 0, learnerSteps: 0, foldedUntilAttempt: false) }
    let fadeable = max(0, stepCount - 1)
    switch scaffolding {
    case .novice:
        let blank = min(max(0, conceptIndex), fadeable)
        return WorkedExamplePlan(typesetSteps: stepCount - blank, learnerSteps: blank, foldedUntilAttempt: false)
    case .developing:
        let blank = min(max(0, conceptIndex) + 1, fadeable)
        return WorkedExamplePlan(typesetSteps: stepCount - blank, learnerSteps: blank, foldedUntilAttempt: false)
    case .advanced:
        return WorkedExamplePlan(typesetSteps: stepCount, learnerSteps: 0, foldedUntilAttempt: true)
    }
}

/// Phases where the concept card and the worked example are on the page. Not in the unaided phases (PRIME,
/// PROBE, CHECK), and not in CONSOLIDATE, where the learner states the principle in their own words and the
/// card would hand them the words.
public func conceptCardAllowed(_ phase: LessonPhase) -> Bool {
    phase == .develop || phase == .extend || phase == .remediate
}
