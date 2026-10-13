import Foundation
import EpistemicsCore

public struct ObserverConcept: Sendable, Hashable {
    public struct Objective: Sendable, Hashable {
        public var id: String, text: String, bloom: String?
        public init(id: String, text: String, bloom: String? = nil) { self.id = id; self.text = text; self.bloom = bloom }
    }
    public struct Misconception: Sendable, Hashable {
        public var tag: String, description: String
        public init(tag: String, description: String) { self.tag = tag; self.description = description }
    }
    public var name: String
    public var definition: String
    public var objectives: [Objective]
    public var misconceptions: [Misconception]

    public init(name: String, definition: String, objectives: [Objective], misconceptions: [Misconception]) {
        self.name = name; self.definition = definition; self.objectives = objectives; self.misconceptions = misconceptions
    }
    public init(_ c: Concept) {
        self.init(name: c.name, definition: c.definition,
                  objectives: c.objectives.map { Objective(id: $0.id, text: $0.text, bloom: $0.bloom.rawValue) },
                  misconceptions: c.misconceptions.map { Misconception(tag: $0.tag, description: $0.description) })
    }
}

public struct ObserveInput: Sendable, Hashable {
    public var learnerTurn: String
    public var tutorTurnBefore: String
    public var concept: ObserverConcept
    public var sourcesLoaded: Bool
    /// The previous learner turn also made no progress on the same question (feeds `stuck`).
    public var previousTurnNoProgress: Bool?
    public var model: String?
    public var metadata: RequestMetadata?

    public init(learnerTurn: String, tutorTurnBefore: String, concept: ObserverConcept, sourcesLoaded: Bool,
                previousTurnNoProgress: Bool? = nil, model: String? = nil, metadata: RequestMetadata? = nil) {
        self.learnerTurn = learnerTurn; self.tutorTurnBefore = tutorTurnBefore; self.concept = concept
        self.sourcesLoaded = sourcesLoaded; self.previousTurnNoProgress = previousTurnNoProgress
        self.model = model; self.metadata = metadata
    }
}

/// How the learner's ink answer was written (iPad DESIGN §9). Never shown as a metric, never graded.
public struct InkSummary: Sendable, Hashable, Codable {
    public var secondsToFirstStroke: Double?
    public var secondsWriting: Double?
    public var crossedOut: [String]
    public var drewDiagram: Bool
    public init(secondsToFirstStroke: Double? = nil, secondsWriting: Double? = nil, crossedOut: [String] = [], drewDiagram: Bool = false) {
        self.secondsToFirstStroke = secondsToFirstStroke; self.secondsWriting = secondsWriting
        self.crossedOut = crossedOut; self.drewDiagram = drewDiagram
    }
}

/// The iPad observer's input: the web input plus the lesson phase (marks are off in unaided phases) and the ink summary.
public struct InkObserveInput: Sendable, Hashable {
    public var base: ObserveInput
    public var phase: LessonPhase
    public var ink: InkSummary?
    public init(_ base: ObserveInput, phase: LessonPhase, ink: InkSummary? = nil) { self.base = base; self.phase = phase; self.ink = ink }
    /// Marks are never drawn during PRIME, PROBE and CHECK (DESIGN §5.5: a circle is a hint).
    public var marksAllowed: Bool { !phase.isUnaided }
}

/// A tutor mark (iPad DESIGN §5.5): the one span of the learner's latest answer worth pointing at.
public struct TutorMark: Codable, Sendable, Hashable {
    /// Quoted exactly from the learner's latest answer; the app maps it to word boxes and strokes.
    public var quote: String
    /// Optional margin note, at most eight words, never a question.
    public var note: String?
    public init(quote: String, note: String? = nil) { self.quote = quote; self.note = note }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(quote, forKey: .quote)
        try c.encode(note, forKey: .note) // explicit null, as the schema requires
    }
}

/// Core's ObserverResult plus the iPad's `mark`. Decodes from (and encodes to) one flat JSON object.
@dynamicMemberLookup
public struct InkObserverResult: Codable, Sendable, Hashable {
    public var observation: ObserverResult
    public var mark: TutorMark?

    public init(observation: ObserverResult, mark: TutorMark? = nil) { self.observation = observation; self.mark = mark }

    public subscript<V>(dynamicMember kp: WritableKeyPath<ObserverResult, V>) -> V {
        get { observation[keyPath: kp] }
        set { observation[keyPath: kp] = newValue }
    }

    private enum K: String, CodingKey { case mark }
    public init(from decoder: any Decoder) throws {
        observation = try ObserverResult(from: decoder)
        mark = try decoder.container(keyedBy: K.self).decodeIfPresent(TutorMark.self, forKey: .mark)
    }
    public func encode(to encoder: any Encoder) throws {
        try observation.encode(to: encoder)
        var c = encoder.container(keyedBy: K.self)
        try c.encode(mark, forKey: .mark)
    }
}

/// Observer (port of roles/observer.ts): after each learner turn a cheap structured call reports what happened.
/// The state machine, not the model, acts on it.
public enum Observer {
    public static let maxNoteWords = 8

    static let objectiveProgress = JSONSchema.object([
        "objectiveId": .string,
        "status": .enumeration(["none", "partial", "met"]),
    ])

    static let baseFields: KeyValuePairs<String, JSONSchema> = [
        "attemptMade": .boolean,
        "gaveUp": .boolean,
        "offTopic": .boolean,
        "objectiveProgress": .array(objectiveProgress),
        "misconceptionTags": .array(.string),
        "keyIdeaStated": .boolean,
        "priorKnowledgeElicited": .boolean,
        "stuck": .boolean,
        "unsourcedClaims": .array(.string),
    ]

    public static let schema = JSONSchema.object(baseFields)

    public static let markSchema = JSONSchema.nullable(.object(["quote": .string, "note": .nullable(.string)]))

    public static let inkSchema = JSONSchema.object([
        "attemptMade": .boolean,
        "gaveUp": .boolean,
        "offTopic": .boolean,
        "objectiveProgress": .array(objectiveProgress),
        "misconceptionTags": .array(.string),
        "keyIdeaStated": .boolean,
        "priorKnowledgeElicited": .boolean,
        "stuck": .boolean,
        "unsourcedClaims": .array(.string),
        "mark": markSchema,
    ])

    static func payload(_ input: ObserveInput) -> [(String, OrderedJSON?)] {
        let concept = OrderedJSON.object([
            ("name", .string(input.concept.name)),
            ("definition", .string(input.concept.definition)),
            ("objectives", .array(input.concept.objectives.map {
                OrderedJSON.obj([("id", .string($0.id)), ("bloom", .opt($0.bloom)), ("text", .string($0.text))])
            })),
            ("misconceptions", .array(input.concept.misconceptions.map {
                OrderedJSON.object([("tag", .string($0.tag)), ("description", .string($0.description))])
            })),
        ])
        return [
            ("tutorTurnBefore", .string(input.tutorTurnBefore)),
            ("learnerTurn", .string(input.learnerTurn)),
            ("concept", concept),
            ("sourcesLoaded", .bool(input.sourcesLoaded)),
            ("previousTurnNoProgress", input.previousTurnNoProgress.map(OrderedJSON.bool)),
        ]
    }

    public static func buildRequest(_ input: ObserveInput) -> LlmRequest {
        LlmRequest(role: .observer, model: input.model, system: [CacheableBlock(Prompts.observer, cache: true)],
                   messages: [.user(RoleInput.encode(.obj(payload(input))))], maxTokens: 2048, effort: .low,
                   metadata: input.metadata)
    }

    public static func buildRequest(_ input: InkObserveInput) -> LlmRequest {
        var pairs = payload(input.base)
        pairs.append(("phase", .string(input.phase.rawValue)))
        pairs.append(("marksAllowed", .bool(input.marksAllowed)))
        if let ink = input.ink {
            pairs.append(("ink", .obj([
                ("secondsToFirstStroke", ink.secondsToFirstStroke.map(OrderedJSON.double)),
                ("secondsWriting", ink.secondsWriting.map(OrderedJSON.double)),
                ("crossedOut", .array(ink.crossedOut.map(OrderedJSON.string))),
                ("drewDiagram", .bool(ink.drewDiagram)),
            ])))
        }
        return LlmRequest(role: .observer, model: input.base.model, system: [CacheableBlock(Prompts.observerWithInk, cache: true)],
                          messages: [.user(RoleInput.encode(.obj(pairs)))], maxTokens: 2048, effort: .low,
                          metadata: input.base.metadata)
    }

    /// Keep only known objective ids (first occurrence) and known misconception tags; fill missing objectives
    /// with "none"; an off-topic reply is not an attempt.
    public static func sanitise(_ r: ObserverResult, concept: ObserverConcept) -> ObserverResult {
        let known = Set(concept.objectives.map(\.id))
        var seen = Set<String>()
        var progress: [ObserverResult.ObjectiveProgress] = []
        for p in r.objectiveProgress where known.contains(p.objectiveId) && !seen.contains(p.objectiveId) {
            seen.insert(p.objectiveId)
            progress.append(p)
        }
        for o in concept.objectives where !seen.contains(o.id) {
            progress.append(.init(objectiveId: o.id, status: .none))
        }
        let tags = Set(concept.misconceptions.map(\.tag))
        var out = r
        out.objectiveProgress = progress
        out.misconceptionTags = TextUtil.unique(r.misconceptionTags.filter { tags.contains($0) })
        out.attemptMade = r.attemptMade && !r.offTopic
        return out
    }

    /// Validate a mark against the learner's turn: dropped in unaided phases, for non-attempts, or when the quote
    /// cannot be found in the turn. A quote that matches only up to case and whitespace is replaced by the exact
    /// text from the turn. A note that is a question, empty, or longer than eight words is dropped.
    public static func sanitiseMark(_ mark: TutorMark?, learnerTurn: String, phase: LessonPhase, attemptMade: Bool) -> TutorMark? {
        guard let mark, !phase.isUnaided, attemptMade else { return nil }
        let quote = mark.quote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !quote.isEmpty, let exact = locate(quote, in: learnerTurn) else { return nil }
        var note = mark.note?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let n = note, n.isEmpty || n.contains("?") || TextUtil.wordCount(n) > maxNoteWords { note = nil }
        return TutorMark(quote: exact, note: note)
    }

    /// The exact substring of `text` matching `quote`, tolerating case and whitespace differences.
    static func locate(_ quote: String, in text: String) -> String? {
        if text.contains(quote) { return quote }
        let parts = quote.split(whereSeparator: \.isWhitespace).map { NSRegularExpression.escapedPattern(for: String($0)) }
        guard !parts.isEmpty, let r = try? NSRegularExpression(pattern: parts.joined(separator: "\\s+"), options: [.caseInsensitive]),
              let m = r.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(m.range, in: text) else { return nil }
        return String(text[range])
    }

    public static func observe(_ provider: any LLMProvider, _ input: ObserveInput) async throws -> Structured<ObserverResult> {
        let r: Structured<ObserverResult> = try await provider.structured(buildRequest(input), schema: schema, name: "ObserverResult")
        return Structured(value: sanitise(r.value, concept: input.concept), usage: r.usage)
    }

    /// The iPad observer: the web observer plus a validated `mark`.
    public static func observe(_ provider: any LLMProvider, _ input: InkObserveInput) async throws -> Structured<InkObserverResult> {
        let r: Structured<InkObserverResult> = try await provider.structured(buildRequest(input), schema: inkSchema, name: "InkObserverResult")
        let observation = sanitise(r.value.observation, concept: input.base.concept)
        let mark = sanitiseMark(r.value.mark, learnerTurn: input.base.learnerTurn, phase: input.phase, attemptMade: observation.attemptMade)
        return Structured(value: InkObserverResult(observation: observation, mark: mark), usage: r.usage)
    }
}
