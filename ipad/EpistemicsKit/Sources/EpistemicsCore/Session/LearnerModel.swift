// Learner model summary (web DESIGN §4; learnerModel.ts): a compact, deterministic rendering injected into
// every tutor call after the cached curriculum prefix. ≤ ~600 tokens. No timestamps, stable ordering, so
// the rendering is cache-friendly.

public struct SummarizeLearnerModelInput {
    public var course: Course
    public var conceptStates: [ConceptState]
    public var conceptNames: [String: String]
    public var calibration: LearnerModelSummary.Calibration
    public var recent: LearnerModelSummary.Recent
    public var verbosity: LearnerModelSummary.Preferences.Verbosity?
    public var examplesDomain: String?
    public init(course: Course, conceptStates: [ConceptState], conceptNames: [String: String], calibration: CalibrationSummary,
                lastLessonSummary: String? = nil, openQuestions: [String] = [],
                verbosity: LearnerModelSummary.Preferences.Verbosity? = nil, examplesDomain: String? = nil) {
        self.course = course; self.conceptStates = conceptStates; self.conceptNames = conceptNames
        self.calibration = .init(brier: calibration.brier, overconfidenceBias: calibration.overconfidenceBias, n: calibration.n)
        self.recent = .init(lastLessonSummary: lastLessonSummary, openQuestions: openQuestions)
        self.verbosity = verbosity; self.examplesDomain = examplesDomain
    }
}

public let LEARNER_MODEL_MAX_FOCUS_CONCEPTS = 12
public let LEARNER_MODEL_MAX_MISCONCEPTIONS = 3
public let LEARNER_MODEL_MAX_OPEN_QUESTIONS = 4
public let LEARNER_MODEL_MAX_SUMMARY_CHARS = 400
public let LEARNER_MODEL_MASTERED_THRESHOLD = 0.85
public let LEARNER_MODEL_SHAKY_THRESHOLD = 0.5

private func byId(_ a: LearnerModelSummary.ConceptLine, _ b: LearnerModelSummary.ConceptLine) -> Double {
    Double(jsCompareCodeUnits(a.id, b.id))
}

private func clamp01(_ x: Double) -> Double { x.isFinite ? jsMax(0, jsMin(1, x)) : 0 }
private func round2(_ x: Double) -> Double { jsRound(x * 100) / 100 }
private func truncate(_ s: String, _ n: Int) -> String { jsLength(s) <= n ? s : "\(jsSlice(s, max(0, n - 1)))…" }

public func summarizeLearnerModel(_ input: SummarizeLearnerModelInput) -> LearnerModelSummary {
    let concepts = jsSorted(input.conceptStates.map { cs in
        LearnerModelSummary.ConceptLine(
            id: cs.conceptId, name: input.conceptNames[cs.conceptId] ?? cs.conceptId, mastery: round2(clamp01(cs.mastery)),
            successfulSessions: cs.successfulSessions, misconceptions: Array(cs.misconceptions.prefix(LEARNER_MODEL_MAX_MISCONCEPTIONS)))
    }, byId)
    return LearnerModelSummary(
        goals: input.course.goals,
        scaffolding: input.course.scaffolding,
        concepts: concepts,
        calibration: .init(brier: round2(input.calibration.brier), overconfidenceBias: round2(input.calibration.overconfidenceBias),
                           n: input.calibration.n),
        recent: .init(lastLessonSummary: input.recent.lastLessonSummary.map { truncate(jsOneLine($0), LEARNER_MODEL_MAX_SUMMARY_CHARS) },
                      openQuestions: input.recent.openQuestions.prefix(LEARNER_MODEL_MAX_OPEN_QUESTIONS).map(jsOneLine)),
        preferences: .init(verbosity: input.verbosity ?? .normal, examplesDomain: input.examplesDomain))
}

/// Compact text for the prompt. Lists only concepts related to the lesson (`focusConceptIds`, at most 12,
/// sorted by id) plus aggregate counts.
public func renderLearnerModel(_ summary: LearnerModelSummary, _ focusConceptIds: [String]) -> String {
    let focus = Set(focusConceptIds)
    let all = summary.concepts
    let mastered = all.filter { $0.mastery >= LEARNER_MODEL_MASTERED_THRESHOLD }.count
    let shaky = all.filter { $0.mastery < LEARNER_MODEL_SHAKY_THRESHOLD && ($0.successfulSessions > 0 || !$0.misconceptions.isEmpty) }.count
    let unseen = all.filter { $0.mastery == 0 && $0.successfulSessions == 0 }.count
    let withMisconceptions = all.filter { !$0.misconceptions.isEmpty }.count

    var lines: [String] = []
    let g = summary.goals
    var goalBits = ["purpose=\(g.purpose.rawValue)", "weekly_minutes=\(g.weeklyMinutes)"]
    if g.examDate != nil { goalBits.append("exam=set") }
    lines.append("LEARNER MODEL")
    let background = g.background.flatMap { $0.isEmpty ? nil : " background=\"\(truncate(jsOneLine($0), 120))\"" } ?? ""
    lines.append("goals: \(goalBits.joined(separator: " "))\(background)")
    lines.append("scaffolding: \(summary.scaffolding.rawValue)")
    lines.append("concepts: total=\(all.count) mastered=\(mastered) shaky=\(shaky) unseen=\(unseen) with_misconceptions=\(withMisconceptions)")

    let focused = Array(jsSorted(all.filter { focus.contains($0.id) }, byId).prefix(LEARNER_MODEL_MAX_FOCUS_CONCEPTS))
    if !focused.isEmpty {
        lines.append("related concepts (\(focused.count)):")
        for c in focused {
            let mis = c.misconceptions.isEmpty ? "" : " misconceptions=[\(c.misconceptions.joined(separator: ","))]"
            lines.append("- \(truncate(jsOneLine(c.name), 60)) mastery=\(jsToFixed(c.mastery, 2)) sessions=\(c.successfulSessions)\(mis)")
        }
    }
    let missing = focusConceptIds.filter { id in !all.contains { $0.id == id } }.count
    if missing > 0 { lines.append("related concepts not yet started: \(missing)") }

    let cal = summary.calibration
    lines.append(cal.n > 0
        ? "calibration: brier=\(jsToFixed(cal.brier, 2)) bias=\(cal.overconfidenceBias >= 0 ? "+" : "")\(jsToFixed(cal.overconfidenceBias, 2)) n=\(cal.n)"
        : "calibration: no data")
    if let last = summary.recent.lastLessonSummary, !last.isEmpty { lines.append("last lesson (learner's words): \"\(last)\"") }
    if !summary.recent.openQuestions.isEmpty {
        lines.append("open questions:")
        for qn in summary.recent.openQuestions.prefix(LEARNER_MODEL_MAX_OPEN_QUESTIONS) { lines.append("- \(truncate(qn, 160))") }
    }
    var prefs = ["verbosity=\(summary.preferences.verbosity.rawValue)"]
    if let d = summary.preferences.examplesDomain, !d.isEmpty { prefs.append("examples_domain=\"\(truncate(jsOneLine(d), 60))\"") }
    lines.append("preferences: \(prefs.joined(separator: " "))")
    return lines.joined(separator: "\n")
}
