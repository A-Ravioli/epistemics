import Foundation

// First-run derivations (web docs/ONBOARDING.md §3, §5; apps/web/src/lib/onboarding.ts and
// services/courses.ts `scaffoldingFromBackground`). Persistence and the device-local mirror stay in the app.
//
// One iPad change (iPad DESIGN §8): the review cap is derived at 2 reviews per minute, not the web's 3,
// because handwriting is slower than typing. Both constants are here so the difference is explicit.

public enum OnboardingSource: String, Codable, Sendable, Hashable { case pack, subject, material }

public struct OnboardingSourceRef: Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public init(id: String, title: String) { self.id = id; self.title = title }
}

/// What the flow has collected so far; written after every step so a relaunch resumes.
public struct OnboardingDraft: Codable, Sendable, Hashable {
    public var source: OnboardingSource
    public var packId: String?
    public var packVersion: Int?
    public var subject: String?
    public var level: String?
    public var sources: [OnboardingSourceRef]?
    /// Step 2: what the learner recalled (on the iPad, the confirmed reading of the ink). Becomes `CourseGoals.background`.
    public var recall: String?
    /// Step 4: 10, 20 or 40.
    public var minutesPerDay: Int?
    public var purpose: CourseGoals.Purpose?
    /// "YYYY-MM-DD" as entered; converted to a timestamp at enrolment.
    public var examDate: String?
    public var completedAt: EpochMs?
    public var tutorDeferred: Bool?
    public var placement: Bool?
    /// iPad: asked once in step 1 (iPad DESIGN §6.1).
    public var leftHanded: Bool?
    public init(source: OnboardingSource = .pack) { self.source = source }
}

public let ONBOARDING_DEFAULT_LEVEL = "intro undergraduate"
public let ONBOARDING_DEFAULT_MINUTES = 20
/// The web's review cap: about 20 s a card, typed.
public let WEB_REVIEWS_PER_MINUTE = 3.0
/// The iPad's starting review cap (iPad DESIGN §8), recalibrated from measured hand-in times later.
public let IPAD_REVIEWS_PER_MINUTE = 2.0

public enum OnboardingStep: String, Codable, Sendable, Hashable { case subject, recall, tutor, commitment }

public let ONBOARDING_STEP_LABELS: [OnboardingStep: String] = [
    .subject: "Subject", .recall: "What you know", .tutor: "Tutor", .commitment: "Time",
]

/// Which steps this learner actually sees (ONBOARDING §3).
public func stepsFor(needsCourse: Bool, needsTutor: Bool) -> [OnboardingStep] {
    var steps: [OnboardingStep] = []
    if needsCourse { steps += [.subject, .recall] }
    if needsTutor { steps.append(.tutor) }
    if needsCourse { steps.append(.commitment) }
    return steps
}

public struct SchedulingDerivation: Codable, Sendable, Hashable {
    public var weeklyMinutes: Int
    public var reviewsPerDay: Int
    public var desiredRetention: Double
}

/// One answer, minutes a day, sets the whole review load. `reviewsPerDay` is a cap, not a target: it is where
/// due cards start becoming debt (DESIGN §5.4), so it is what the learner could clear in a session of nothing
/// but reviews. iPad: `clamp(round(minutes × 2), 20, 400)`; pass `WEB_REVIEWS_PER_MINUTE` for the web's rule.
public func schedulingFor(_ minutesPerDay: Int, reviewsPerMinute: Double = IPAD_REVIEWS_PER_MINUTE) -> SchedulingDerivation {
    SchedulingDerivation(weeklyMinutes: minutesPerDay * 7,
                         reviewsPerDay: Int(jsMin(400, jsMax(20, jsRound(Double(minutesPerDay) * reviewsPerMinute)))),
                         desiredRetention: 0.9)
}

/// The goals the draft implies. The recall text is the background. The exam date is noon local time on
/// that day (`new Date("YYYY-MM-DDT12:00:00")` on the web).
public func goalsFor(_ draft: OnboardingDraft, timeZone: TimeZone = .current, reviewsPerMinute: Double = IPAD_REVIEWS_PER_MINUTE) -> CourseGoals {
    let minutes = draft.minutesPerDay ?? ONBOARDING_DEFAULT_MINUTES
    var goals = CourseGoals(purpose: draft.purpose ?? .understand, weeklyMinutes: schedulingFor(minutes, reviewsPerMinute: reviewsPerMinute).weeklyMinutes)
    if let background = draft.recall.map(jsTrim), !background.isEmpty { goals.background = background }
    if goals.purpose == .exam, let exam = draft.examDate, !exam.isEmpty { goals.examDate = localNoon(exam, timeZone) }
    return goals
}

func localNoon(_ ymd: String, _ tz: TimeZone) -> EpochMs? {
    let p = ymd.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3, (1...12).contains(p[1]), (1...31).contains(p[2]) else { return nil }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    guard let date = cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12)) else { return nil }
    return Int((date.timeIntervalSince1970 * 1000).rounded())
}

/// Initial scaffolding from what the learner says they know (DESIGN §3.3). The first run passes depth "working".
public enum BackgroundDepth: String, Codable, Sendable, Hashable { case intro, working, deep }

public func scaffoldingFromBackground(_ background: String?, _ depth: BackgroundDepth) -> Scaffolding {
    let b = jsTrim(background ?? "")
    if depth == .deep && jsLength(b) > 40 { return .advanced }
    if jsLength(b) > 0 || depth != .intro { return .developing }
    return .novice
}

public func defaultCourseSettings(timezone: String = TimeZone.current.identifier) -> CourseSettings {
    CourseSettings(desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: timezone)
}

// MARK: - The reflection (ONBOARDING §3, step 2)

/// Words too common to mean anything when they collide; matching on these would flatter the learner.
public let ONBOARDING_STOP_WORDS: Set<String> = [
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "when", "what", "which", "their",
    "there", "have", "has", "was", "were", "are", "not", "but", "its", "some", "more", "than", "then",
    "they", "them", "you", "your", "can", "will", "how", "why", "all", "any", "one", "two", "value", "values",
    "rule", "rules", "law", "laws", "basic", "basics", "theory", "general", "simple", "problem", "problems",
]

/// `s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []`.
func matchWords(_ s: String) -> [String] {
    var out: [String] = []
    var cur = String.UnicodeScalarView()
    func flush() {
        if cur.count >= 3 { out.append(String(cur)) }
        cur = String.UnicodeScalarView()
    }
    for u in s.lowercased().unicodeScalars {
        let letter = u.value >= 0x61 && u.value <= 0x7A
        if cur.isEmpty {
            if letter { cur.append(u) }
        } else if letter || u == "'" || u == "-" {
            cur.append(u)
        } else {
            flush()
            if letter { cur.append(u) }
        }
    }
    flush()
    return out
}

/// Distinctive words of a concept name (the matcher's unit).
func distinctiveWords(_ name: String) -> [String] { matchWords(name).filter { !ONBOARDING_STOP_WORDS.contains($0) } }

/// Whether `text` names `conceptName`: the full name appears, or every distinctive word of it does.
func namesConcept(_ text: String, _ bag: Set<String>, _ conceptName: String) -> Bool {
    let distinctive = distinctiveWords(conceptName)
    return jsIncludes(text, conceptName.lowercased()) || (!distinctive.isEmpty && distinctive.allSatisfy(bag.contains))
}

/// Which of a curriculum's concepts the learner just named, matched mechanically (no model call: the
/// reflection must work offline and before a tutor is chosen). Returns concept names, at most `limit`.
public func conceptsNamed(_ curriculum: Curriculum, _ recall: String, limit: Int = 4) -> [String] {
    let text = recall.lowercased()
    if jsLength(jsTrim(text)) < 3 { return [] }
    let bag = Set(matchWords(text))
    var hits: [String] = []
    for unit in curriculum.units {
        for lesson in unit.lessons {
            for concept in lesson.concepts where namesConcept(text, bag, concept.name) && !hits.contains(concept.name) {
                hits.append(concept.name)
            }
        }
    }
    return Array(hits.prefix(max(0, limit)))
}

/// Whether the recall earned the placement offer: two named concepts, or a substantial paragraph.
public func shouldOfferPlacement(_ recall: String?, _ named: [String]) -> Bool {
    if named.count >= 2 { return true }
    return jsLength(jsTrim(recall ?? "")) >= 120
}
