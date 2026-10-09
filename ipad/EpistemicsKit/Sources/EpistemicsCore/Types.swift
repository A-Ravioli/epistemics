import Foundation

// Epistemics domain model, ported from web/packages/core/src/types.ts.
//
// Two halves:
//  - CONTENT (Curriculum → Unit → Lesson → Concept → Item): immutable, versioned, shelvable.
//    No learner state ever lives here. Decodes the web app's `*.epistemics.json` packs unchanged.
//  - LEARNER STATE (Course, Card, ConceptState, Session, Receipt…): keyed to content ids.
//
// Timestamps are epoch milliseconds (UTC), as on the web, so rows can sync between the two apps.

public typealias EpochMs = Int

// MARK: - Content

public enum Bloom: String, Codable, Sendable, Hashable, CaseIterable {
    case remember, understand, apply, analyze
}

public enum ItemType: String, Codable, Sendable, Hashable, CaseIterable {
    case recall        // front → back, self-graded
    case cloze         // sentence with a gap, self-graded
    case explain       // "explain why/how", LLM-graded by rubric
    case apply         // problem with new numbers/context, LLM-graded (+ optional exact answer)
    case discriminate  // contrast two confusable concepts, LLM-graded
    case map           // relations from memory; on the iPad, a drawn map (DESIGN §6.6)
    case teachback     // multi-turn teach-the-AI-student, graded post hoc
    case predict       // "what do you expect…", self-graded after reveal
    case sketch        // iPad only: draw a representation, graded on its structure (DESIGN §7)

    /// Types the learner grades against the revealed reference (no rubric call).
    public var isSelfGraded: Bool { self == .recall || self == .cloze || self == .predict }
}

public struct Objective: Codable, Sendable, Hashable {
    public var id: String
    public var bloom: Bloom
    public var text: String
    public init(id: String, bloom: Bloom, text: String) { self.id = id; self.bloom = bloom; self.text = text }
}

public struct Misconception: Codable, Sendable, Hashable {
    public var tag: String
    public var description: String
    public var remedy: String
    public init(tag: String, description: String, remedy: String) { self.tag = tag; self.description = description; self.remedy = remedy }
}

public struct Example: Codable, Sendable, Hashable {
    public var title: String
    public var body: String
    public var domain: String?
    public init(title: String, body: String, domain: String? = nil) { self.title = title; self.body = body; self.domain = domain }
}

public struct SourceSpan: Codable, Sendable, Hashable {
    public var chunkId: String
    public var quote: String
    public var page: Int?
    public var heading: String?
}

public struct RubricCriterion: Codable, Sendable, Hashable {
    public var id: String
    public var text: String
    public var evidenceHint: String?
    public init(id: String, text: String, evidenceHint: String? = nil) { self.id = id; self.text = text; self.evidenceHint = evidenceHint }
}

public struct ItemReference: Codable, Sendable, Hashable {
    /// Hidden from the tutor and from the Reader.
    public var answer: String
    /// Optional canonical short answer for exact match.
    public var exact: String?
    public var notes: String?
    /// `sketch` items: the expected drawing, as a structural description (DESIGN §7).
    public var structure: JSONValue?
    public init(answer: String, exact: String? = nil, notes: String? = nil, structure: JSONValue? = nil) {
        self.answer = answer; self.exact = exact; self.notes = notes; self.structure = structure
    }
}

/// The kind of paper an ink area uses. Chosen from the item type unless the pack overrides it.
public enum Paper: String, Codable, Sendable, Hashable, CaseIterable {
    case ruled, squared, dotted, short
}

/// Optional per-item override of the ink area (pack extension, ignored by the web app).
public struct InkHint: Codable, Sendable, Hashable {
    public var paper: Paper?
    public var lines: Int?
    public init(paper: Paper? = nil, lines: Int? = nil) { self.paper = paper; self.lines = lines }
}

public struct Item: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var conceptId: String
    public var type: ItemType
    public var bloom: Bloom
    public var prompt: String
    public var reference: ItemReference
    public var rubric: [RubricCriterion]
    public var spans: [SourceSpan]
    public var tags: [String]?
    public var generatorVersion: String
    public var hash: String
    public var ink: InkHint?

    public init(id: String, conceptId: String, type: ItemType, bloom: Bloom, prompt: String, reference: ItemReference,
                rubric: [RubricCriterion] = [], spans: [SourceSpan] = [], tags: [String]? = nil,
                generatorVersion: String = "hand-authored", hash: String = "", ink: InkHint? = nil) {
        self.id = id; self.conceptId = conceptId; self.type = type; self.bloom = bloom; self.prompt = prompt
        self.reference = reference; self.rubric = rubric; self.spans = spans; self.tags = tags
        self.generatorVersion = generatorVersion; self.hash = hash; self.ink = ink
    }
}

public struct GuidingQuestion: Codable, Sendable, Hashable {
    public var question: String
    public var expected: String
    public var probesMisconception: String?
    public init(question: String, expected: String, probesMisconception: String? = nil) {
        self.question = question; self.expected = expected; self.probesMisconception = probesMisconception
    }
}

public struct ConceptScript: Codable, Sendable, Hashable {
    public struct Pretest: Codable, Sendable, Hashable {
        public var prompt: String
        public var isomorph: String
        public var reference: String
        public init(prompt: String, isomorph: String, reference: String) { self.prompt = prompt; self.isomorph = isomorph; self.reference = reference }
    }
    public struct WorkedExample: Codable, Sendable, Hashable {
        public var problem: String
        public var steps: [String]
        public init(problem: String, steps: [String]) { self.problem = problem; self.steps = steps }
    }
    public struct Transfer: Codable, Sendable, Hashable {
        public var prompt: String
        public var reference: String
        public init(prompt: String, reference: String) { self.prompt = prompt; self.reference = reference }
    }
    public var pretest: Pretest
    public var guidingQuestions: [GuidingQuestion]
    public var workedExample: WorkedExample
    public var transfer: Transfer
    /// Levels 1...3; level 3 is a partial worked example, never the answer.
    public var hints: [String]
    public init(pretest: Pretest, guidingQuestions: [GuidingQuestion], workedExample: WorkedExample, transfer: Transfer, hints: [String]) {
        self.pretest = pretest; self.guidingQuestions = guidingQuestions; self.workedExample = workedExample
        self.transfer = transfer; self.hints = hints
    }
}

public struct Concept: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var ordinal: Int
    public var name: String
    public var definition: String
    public var objectives: [Objective]
    public var misconceptions: [Misconception]
    public var examples: [Example]
    public var spans: [SourceSpan]
    public var script: ConceptScript
    public var items: [Item]
    public init(id: String, ordinal: Int, name: String, definition: String, objectives: [Objective] = [], misconceptions: [Misconception] = [],
                examples: [Example] = [], spans: [SourceSpan] = [], script: ConceptScript, items: [Item] = []) {
        self.id = id; self.ordinal = ordinal; self.name = name; self.definition = definition; self.objectives = objectives
        self.misconceptions = misconceptions; self.examples = examples; self.spans = spans; self.script = script; self.items = items
    }
}

public struct Lesson: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var ordinal: Int
    public var title: String
    public var summary: String?
    /// 3-5, in teaching order.
    public var concepts: [Concept]
    public init(id: String, ordinal: Int, title: String, summary: String? = nil, concepts: [Concept]) {
        self.id = id; self.ordinal = ordinal; self.title = title; self.summary = summary; self.concepts = concepts
    }
}

public struct Unit: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var ordinal: Int
    public var title: String
    public var summary: String
    public var lessons: [Lesson]
    public init(id: String, ordinal: Int, title: String, summary: String, lessons: [Lesson]) {
        self.id = id; self.ordinal = ordinal; self.title = title; self.summary = summary; self.lessons = lessons
    }
}

public enum EdgeKind: String, Codable, Sendable, Hashable {
    case prereq, encompasses
}

public struct ConceptEdge: Codable, Sendable, Hashable {
    /// prereq: `to` requires `from`. encompasses: practising `from` implicitly practises `to`.
    public var from: String
    public var to: String
    public var kind: EdgeKind
    public var weight: Double?
    public var justification: String?
    public var confidence: Double?
    public init(from: String, to: String, kind: EdgeKind, weight: Double? = nil, justification: String? = nil, confidence: Double? = nil) {
        self.from = from; self.to = to; self.kind = kind; self.weight = weight; self.justification = justification; self.confidence = confidence
    }
}

public struct SourceDoc: Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var kind: String
    public var hash: String
    public var licence: String?
    public var pageCount: Int?
}

public struct CurriculumManifest: Codable, Sendable, Hashable {
    public struct ParentVersion: Codable, Sendable, Hashable { public var id: String; public var version: Int }
    public struct Generator: Codable, Sendable, Hashable {
        public var name: String
        public var version: String
        public var model: String?
        public var promptVersion: String?
    }
    public var id: String
    public var version: Int
    public var parentVersion: ParentVersion?
    public var title: String
    public var subject: String
    public var description: String
    public var level: String
    public var contentHash: String
    public var generator: Generator
    public var createdAt: EpochMs
    public var licence: String?
}

public struct Curriculum: Codable, Sendable, Hashable {
    public var manifest: CurriculumManifest
    public var units: [Unit]
    public var edges: [ConceptEdge]
    public var sources: [SourceDoc]
    public init(manifest: CurriculumManifest, units: [Unit], edges: [ConceptEdge] = [], sources: [SourceDoc] = []) {
        self.manifest = manifest; self.units = units; self.edges = edges; self.sources = sources
    }
}

/// A shelvable pack is exactly a Curriculum serialised as JSON (file: *.epistemics.json).
public typealias Pack = Curriculum

// MARK: - Learner state

public enum Scaffolding: String, Codable, Sendable, Hashable {
    case novice, developing, advanced
}

public struct CourseGoals: Codable, Sendable, Hashable {
    public enum Purpose: String, Codable, Sendable, Hashable { case understand, exam, apply }
    public var purpose: Purpose
    public var examDate: EpochMs?
    public var weeklyMinutes: Int
    public var background: String?
    public init(purpose: Purpose = .understand, examDate: EpochMs? = nil, weeklyMinutes: Int, background: String? = nil) {
        self.purpose = purpose; self.examDate = examDate; self.weeklyMinutes = weeklyMinutes; self.background = background
    }
}

public struct CourseSettings: Codable, Sendable, Hashable {
    /// 0.8...0.95, default 0.9.
    public var desiredRetention: Double
    public var reviewsPerDay: Int
    public var maxNewItemsPerDay: Int
    /// Weekday indices 0...6 with reduced load.
    public var easyDays: [Int]
    /// Default 4 (04:00 local).
    public var dayStartHour: Int
    /// IANA identifier, e.g. "Europe/London".
    public var timezone: String
    public init(desiredRetention: Double = 0.9, reviewsPerDay: Int = 120, maxNewItemsPerDay: Int = 40,
                easyDays: [Int] = [], dayStartHour: Int = 4, timezone: String = TimeZone.current.identifier) {
        self.desiredRetention = desiredRetention; self.reviewsPerDay = reviewsPerDay; self.maxNewItemsPerDay = maxNewItemsPerDay
        self.easyDays = easyDays; self.dayStartHour = dayStartHour; self.timezone = timezone
    }
}

public struct Course: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var curriculumId: String
    public var curriculumVersion: Int
    public var title: String
    public var goals: CourseGoals
    public var settings: CourseSettings
    public var scaffolding: Scaffolding
    public var createdAt: EpochMs
    public var updatedAt: EpochMs
    public init(id: String, curriculumId: String, curriculumVersion: Int, title: String, goals: CourseGoals,
                settings: CourseSettings, scaffolding: Scaffolding, createdAt: EpochMs, updatedAt: EpochMs) {
        self.id = id; self.curriculumId = curriculumId; self.curriculumVersion = curriculumVersion; self.title = title
        self.goals = goals; self.settings = settings; self.scaffolding = scaffolding; self.createdAt = createdAt; self.updatedAt = updatedAt
    }
}

/// FSRS card state; numeric values match ts-fsrs.
public enum CardState: Int, Codable, Sendable, Hashable {
    case new = 0, learning = 1, review = 2, relearning = 3
}

public struct Card: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var courseId: String
    public var itemId: String
    public var conceptId: String
    public var state: CardState
    public var due: EpochMs
    public var lastReview: EpochMs?
    public var stability: Double
    public var difficulty: Double
    public var scheduledDays: Int
    public var learningSteps: Int
    public var reps: Int
    public var lapses: Int
    public var suspended: Bool
    /// Seeded by the diagnostic, not yet confirmed by a real review.
    public var provisional: Bool
    public init(id: String, courseId: String, itemId: String, conceptId: String, state: CardState = .new, due: EpochMs,
                lastReview: EpochMs? = nil, stability: Double = 0, difficulty: Double = 0, scheduledDays: Int = 0,
                learningSteps: Int = 0, reps: Int = 0, lapses: Int = 0, suspended: Bool = false, provisional: Bool = false) {
        self.id = id; self.courseId = courseId; self.itemId = itemId; self.conceptId = conceptId; self.state = state
        self.due = due; self.lastReview = lastReview; self.stability = stability; self.difficulty = difficulty
        self.scheduledDays = scheduledDays; self.learningSteps = learningSteps; self.reps = reps; self.lapses = lapses
        self.suspended = suspended; self.provisional = provisional
    }
}

/// Again, Hard, Good, Easy.
public enum Rating: Int, Codable, Sendable, Hashable, CaseIterable, Comparable {
    case again = 1, hard = 2, good = 3, easy = 4
    public static func < (a: Rating, b: Rating) -> Bool { a.rawValue < b.rawValue }
}

/// Guess, fairly sure, certain. On the iPad, the hand-in buttons (DESIGN §4).
public enum Confidence: Int, Codable, Sendable, Hashable, CaseIterable {
    case guess = 1, fairlySure = 2, certain = 3
}

public enum ReviewSource: String, Codable, Sendable, Hashable {
    case review, lesson, checkpoint, teachback, warmup, implicit, manual, diagnostic, map
}

public struct ReviewLogEntry: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var cardId: String
    public var courseId: String
    public var reviewTime: EpochMs
    public var rating: Rating
    public var stateBefore: CardState
    public var elapsedDays: Int
    public var scheduledDays: Int
    /// After the review.
    public var stability: Double
    /// After the review.
    public var difficulty: Double
    public var durationMs: Int?
    public var confidence: Confidence?
    public var source: ReviewSource
    /// True if hints were visible when answered.
    public var assisted: Bool
    public init(id: String, cardId: String, courseId: String, reviewTime: EpochMs, rating: Rating, stateBefore: CardState,
                elapsedDays: Int, scheduledDays: Int, stability: Double, difficulty: Double, durationMs: Int? = nil,
                confidence: Confidence? = nil, source: ReviewSource, assisted: Bool) {
        self.id = id; self.cardId = cardId; self.courseId = courseId; self.reviewTime = reviewTime; self.rating = rating
        self.stateBefore = stateBefore; self.elapsedDays = elapsedDays; self.scheduledDays = scheduledDays
        self.stability = stability; self.difficulty = difficulty; self.durationMs = durationMs; self.confidence = confidence
        self.source = source; self.assisted = assisted
    }
}

public struct ConceptState: Codable, Sendable, Hashable {
    public var courseId: String
    public var conceptId: String
    /// 0...1, see Mastery.swift.
    public var mastery: Double
    /// Distinct study days with at least one successful unaided retrieval.
    public var successfulSessions: Int
    /// "YYYY-MM-DD" in the course-local study day.
    public var lastSuccessDay: String?
    /// Recent tags, most recent first, max 5.
    public var misconceptions: [String]
    public var assistedPass: Int
    public var assistedN: Int
    public var unassistedPass: Int
    public var unassistedN: Int
    public var updatedAt: EpochMs
    public init(courseId: String, conceptId: String, mastery: Double = 0, successfulSessions: Int = 0, lastSuccessDay: String? = nil,
                misconceptions: [String] = [], assistedPass: Int = 0, assistedN: Int = 0, unassistedPass: Int = 0,
                unassistedN: Int = 0, updatedAt: EpochMs = 0) {
        self.courseId = courseId; self.conceptId = conceptId; self.mastery = mastery; self.successfulSessions = successfulSessions
        self.lastSuccessDay = lastSuccessDay; self.misconceptions = misconceptions; self.assistedPass = assistedPass
        self.assistedN = assistedN; self.unassistedPass = unassistedPass; self.unassistedN = unassistedN; self.updatedAt = updatedAt
    }
}

public enum SessionType: String, Codable, Sendable, Hashable {
    case review, lesson, checkpoint, diagnostic, teachback, warmup, map
}

public struct Session: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var courseId: String
    public var type: SessionType
    public var lessonId: String?
    public var unitId: String?
    public var startedAt: EpochMs
    public var endedAt: EpochMs?
    public var summary: [String: JSONValue]?
    public init(id: String, courseId: String, type: SessionType, lessonId: String? = nil, unitId: String? = nil,
                startedAt: EpochMs, endedAt: EpochMs? = nil, summary: [String: JSONValue]? = nil) {
        self.id = id; self.courseId = courseId; self.type = type; self.lessonId = lessonId; self.unitId = unitId
        self.startedAt = startedAt; self.endedAt = endedAt; self.summary = summary
    }
}

public struct CriterionResult: Codable, Sendable, Hashable {
    public var id: String
    public var met: Bool
    /// Quoted from the (confirmed) answer. On the iPad it is mapped back to strokes to place a mark.
    public var evidence: String
    public init(id: String, met: Bool, evidence: String) { self.id = id; self.met = met; self.evidence = evidence }
}

public struct GradeResult: Codable, Sendable, Hashable {
    public var criteria: [CriterionResult]
    /// 0...1
    public var score: Double
    public var misconceptionTags: [String]
    /// Criterion-level, explanatory.
    public var feedback: String
    /// The grader's own confidence, 0...1.
    public var confidence: Double
    /// How many grader samples were used (consensus deferral).
    public var samples: Int?
    public init(criteria: [CriterionResult], score: Double, misconceptionTags: [String] = [], feedback: String,
                confidence: Double, samples: Int? = nil) {
        self.criteria = criteria; self.score = score; self.misconceptionTags = misconceptionTags; self.feedback = feedback
        self.confidence = confidence; self.samples = samples
    }
}

/// How an answer was given. Logged on every receipt (DESIGN §10, §11).
public enum AnswerModality: String, Codable, Sendable, Hashable {
    case ink, typed, dictated
}

public struct Receipt: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var sessionId: String
    public var courseId: String
    public var itemId: String
    public var conceptId: String
    /// The confirmed reading of the ink (or the typed text).
    public var answer: String
    public var confidence: Confidence?
    public var grade: GradeResult?
    public var rating: Rating
    public var assisted: Bool
    public var disputed: Bool
    public var createdAt: EpochMs
    /// iPad: the ink this receipt grades.
    public var inkId: String?
    public var modality: AnswerModality?
    public init(id: String, sessionId: String, courseId: String, itemId: String, conceptId: String, answer: String,
                confidence: Confidence? = nil, grade: GradeResult? = nil, rating: Rating, assisted: Bool, disputed: Bool = false,
                createdAt: EpochMs, inkId: String? = nil, modality: AnswerModality? = nil) {
        self.id = id; self.sessionId = sessionId; self.courseId = courseId; self.itemId = itemId; self.conceptId = conceptId
        self.answer = answer; self.confidence = confidence; self.grade = grade; self.rating = rating; self.assisted = assisted
        self.disputed = disputed; self.createdAt = createdAt; self.inkId = inkId; self.modality = modality
    }
}

public struct JudgmentOfLearning: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var sessionId: String
    public var courseId: String
    public var conceptId: String
    /// 0...1
    public var predictedRecall: Double
    public var actualOutcome: Bool?
    public var checkedAt: EpochMs?
    public var createdAt: EpochMs
}

public struct FsrsParams: Codable, Sendable, Hashable {
    public var courseId: String
    public var w: [Double]
    public var desiredRetention: Double
    public var optimizedAt: EpochMs?
    public var nReviews: Int
    public var logloss: Double?
}

// MARK: - Lesson engine (shared between the session reducer and the observer)

public enum LessonPhase: String, Codable, Sendable, Hashable {
    case prime = "PRIME", probe = "PROBE", develop = "DEVELOP", consolidate = "CONSOLIDATE", extend = "EXTEND"
    case check = "CHECK", remediate = "REMEDIATE", wrap = "WRAP", done = "DONE"

    /// Phases answered with no help: the page above is folded away and no marks are drawn (DESIGN §3, §5.5).
    public var isUnaided: Bool { self == .prime || self == .probe || self == .check }
}

public struct ObserverResult: Codable, Sendable, Hashable {
    public struct ObjectiveProgress: Codable, Sendable, Hashable {
        public enum Status: String, Codable, Sendable, Hashable { case none, partial, met }
        public var objectiveId: String
        public var status: Status
        public init(objectiveId: String, status: Status) { self.objectiveId = objectiveId; self.status = status }
    }
    /// Did the learner actually try (not "idk", not off-topic).
    public var attemptMade: Bool
    public var gaveUp: Bool
    public var offTopic: Bool
    public var objectiveProgress: [ObjectiveProgress]
    public var misconceptionTags: [String]
    /// The concept's key idea appeared in the learner's own words.
    public var keyIdeaStated: Bool
    public var priorKnowledgeElicited: Bool
    /// Two attempts without progress.
    public var stuck: Bool
    /// Tutor claims not grounded in spans (when sources exist).
    public var unsourcedClaims: [String]
    public init(attemptMade: Bool, gaveUp: Bool = false, offTopic: Bool = false, objectiveProgress: [ObjectiveProgress] = [],
                misconceptionTags: [String] = [], keyIdeaStated: Bool = false, priorKnowledgeElicited: Bool = false,
                stuck: Bool = false, unsourcedClaims: [String] = []) {
        self.attemptMade = attemptMade; self.gaveUp = gaveUp; self.offTopic = offTopic; self.objectiveProgress = objectiveProgress
        self.misconceptionTags = misconceptionTags; self.keyIdeaStated = keyIdeaStated; self.priorKnowledgeElicited = priorKnowledgeElicited
        self.stuck = stuck; self.unsourcedClaims = unsourcedClaims
    }
}

public enum LlmRole: String, Codable, Sendable, Hashable, CaseIterable {
    case tutor, observer, grader, architect, itemwriter, student, leakcheck
    /// iPad: transcribes ink without the answer key (DESIGN §5.1).
    case reader
}

// MARK: - Learner model summary injected into prompts

public struct LearnerModelSummary: Codable, Sendable, Hashable {
    public struct ConceptLine: Codable, Sendable, Hashable {
        public var id: String
        public var name: String
        public var mastery: Double
        public var successfulSessions: Int
        public var misconceptions: [String]
    }
    public struct Calibration: Codable, Sendable, Hashable {
        public var brier: Double
        public var overconfidenceBias: Double
        public var n: Int
    }
    public struct Recent: Codable, Sendable, Hashable {
        public var lastLessonSummary: String?
        public var openQuestions: [String]
    }
    public struct Preferences: Codable, Sendable, Hashable {
        public enum Verbosity: String, Codable, Sendable, Hashable { case terse, normal }
        public var verbosity: Verbosity
        public var examplesDomain: String?
    }
    public var goals: CourseGoals
    public var scaffolding: Scaffolding
    public var concepts: [ConceptLine]
    public var calibration: Calibration
    public var recent: Recent
    public var preferences: Preferences
}

// MARK: - Curriculum lookups

public extension Curriculum {
    var allLessons: [Lesson] { units.sorted { $0.ordinal < $1.ordinal }.flatMap { $0.lessons.sorted { $0.ordinal < $1.ordinal } } }
    var allConcepts: [Concept] { allLessons.flatMap(\.concepts) }
    var allItems: [Item] { allConcepts.flatMap(\.items) }
    func concept(_ id: String) -> Concept? { allConcepts.first { $0.id == id } }
    func item(_ id: String) -> Item? { allItems.first { $0.id == id } }
    func lesson(_ id: String) -> Lesson? { allLessons.first { $0.id == id } }
    func unit(containingLesson lessonId: String) -> Unit? { units.first { $0.lessons.contains { $0.id == lessonId } } }
    func unit(containingConcept conceptId: String) -> Unit? {
        units.first { $0.lessons.contains { $0.concepts.contains { $0.id == conceptId } } }
    }
}
