import Foundation
import EpistemicsCore

public struct GradeReference: Sendable, Hashable, Codable {
    public var answer: String
    public var exact: String?
    public var notes: String?
    public init(answer: String, exact: String? = nil, notes: String? = nil) { self.answer = answer; self.exact = exact; self.notes = notes }
    public init(_ r: ItemReference) { self.init(answer: r.answer, exact: r.exact, notes: r.notes) }
}

public struct GradeInput: Sendable, Hashable {
    public struct Misconception: Sendable, Hashable {
        public var tag: String, description: String
        public init(tag: String, description: String) { self.tag = tag; self.description = description }
    }
    public var prompt: String
    public var reference: GradeReference
    public var rubric: [RubricCriterion]
    /// The confirmed reading of the learner's ink (or typed text). Never the image.
    public var answer: String
    public var misconceptions: [Misconception]
    /// Force this many samples (≥ 1). Default: 1, escalating to 3 by consensus deferral.
    public var samples: Int?
    /// Confidence below which a single sample is escalated. Default 0.7 (sketch items may use a higher bar).
    public var consensusConfidence: Double
    public var model: String?
    public var metadata: RequestMetadata?

    public init(prompt: String, reference: GradeReference, rubric: [RubricCriterion], answer: String,
                misconceptions: [Misconception], samples: Int? = nil, consensusConfidence: Double = Grader.consensusConfidence,
                model: String? = nil, metadata: RequestMetadata? = nil) {
        self.prompt = prompt; self.reference = reference; self.rubric = rubric; self.answer = answer
        self.misconceptions = misconceptions; self.samples = samples; self.consensusConfidence = consensusConfidence
        self.model = model; self.metadata = metadata
    }
}

public struct GradeOutcome: Sendable, Hashable {
    public var grade: GradeResult
    public var usage: Usage
    /// Samples disagree on the rating band: ask the learner to self-grade with the rubric shown.
    public var disagreement: Bool
}

/// Blind grader (port of roles/grader.ts, DESIGN §6.2). Sees only prompt, reference, rubric, answer and
/// misconceptions; never the dialogue and never the image. Consensus deferral: a low-confidence or borderline
/// first sample draws two more; the median score and per-criterion majority decide.
public enum Grader {
    public static let ratingBoundaries: [Double] = [0.4, 0.75, 0.95]
    public static let consensusConfidence = 0.7
    public static let consensusMargin = 0.05
    public static let consensusSamples = 3

    public static let schema = JSONSchema.object([
        "criteria": .array(.object(["id": .string, "met": .boolean, "evidence": .string])),
        "score": JSONSchema.number.described("0 to 1"),
        "misconceptionTags": .array(.string),
        "feedback": .string,
        "confidence": JSONSchema.number.described("0 to 1"),
        "firstError": JSONSchema.nullable(.object([
            "quote": JSONSchema.string.described("Shortest span of the first wrong line, verbatim from the answer"),
            "why": JSONSchema.string.described("One sentence: what is wrong with that line, never the corrected line"),
            "misconceptionTag": JSONSchema.nullable(.string),
        ])),
    ])

    public static func buildRequest(_ input: GradeInput) -> LlmRequest {
        let ref = input.reference
        let payload = OrderedJSON.obj([
            ("prompt", .string(input.prompt)),
            ("reference", .string(ref.answer)),
            ("exactAnswer", .opt(ref.exact?.isEmpty == false ? ref.exact : nil)),
            ("gradingNotes", .opt(ref.notes?.isEmpty == false ? ref.notes : nil)),
            ("rubric", .array(input.rubric.map {
                OrderedJSON.obj([("id", .string($0.id)), ("text", .string($0.text)),
                                 ("evidenceHint", .opt($0.evidenceHint?.isEmpty == false ? $0.evidenceHint : nil))])
            })),
            ("answer", .string(input.answer)),
            ("misconceptions", .array(input.misconceptions.map {
                OrderedJSON.object([("tag", .string($0.tag)), ("description", .string($0.description))])
            })),
        ])
        return LlmRequest(role: .grader, model: input.model, system: [CacheableBlock(Prompts.graderWithInk, cache: true)],
                          messages: [.user(RoleInput.encode(payload))], maxTokens: 4096, effort: .medium, metadata: input.metadata)
    }

    /// Normalised exact match: numbers compare numerically (any number token in the answer), strings after
    /// normalisation, multi-word answers by whole-phrase containment.
    public static func exactMatches(_ answer: String, exact: String) -> Bool {
        let a = TextUtil.normalise(answer)
        let e = TextUtil.normalise(exact)
        if e.isEmpty { return false }
        if a == e { return true }
        if let numE = TextUtil.jsNumber(e.replacingOccurrences(of: ",", with: "")), numE.isFinite {
            for tok in a.components(separatedBy: " ") where !tok.isEmpty {
                if let n = TextUtil.jsNumber(tok.replacingOccurrences(of: ",", with: "")), n.isFinite,
                   abs(n - numE) <= abs(numE) * 1e-9 + 1e-12 { return true }
            }
            return false
        }
        return " \(a) ".contains(" \(e) ")
    }

    /// Short-circuit grade for items with an exact canonical answer: 1 or 0 with confidence 1.
    public static func gradeExact(_ answer: String, exact: String, rubric: [RubricCriterion] = []) -> GradeResult {
        let met = exactMatches(answer, exact: exact)
        let evidence = met ? TextUtil.jsSlice(answer.trimmingCharacters(in: .whitespacesAndNewlines), 200) : ""
        return GradeResult(criteria: rubric.map { CriterionResult(id: $0.id, met: met, evidence: evidence) },
                           score: met ? 1 : 0, misconceptionTags: [],
                           feedback: met ? "Your final answer matches the expected result."
                                         : "Your final answer does not match the expected result (\(exact)).",
                           confidence: 1, samples: 0)
    }

    /// True when a first sample should be escalated to three: low confidence, or a score strictly within the
    /// margin of a rating boundary (on 3-decimal rounding).
    public static func needsConsensus(score: Double, confidence: Double, confidenceBar: Double = consensusConfidence) -> Bool {
        if confidence < confidenceBar { return true }
        return ratingBoundaries.contains { b in (abs(score - b) * 1000).rounded(.toNearestOrAwayFromZero) / 1000 < consensusMargin }
    }

    static func median(_ xs: [Double]) -> Double {
        let s = xs.sorted()
        let mid = s.count / 2
        return s.count % 2 == 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
    }

    /// Combine N samples: median score, per-criterion majority, majority misconception tags, mean confidence,
    /// feedback from the sample closest to the median.
    public static func combine(_ samples: [GradeResult], rubric: [RubricCriterion]) -> GradeResult {
        precondition(!samples.isEmpty, "Grader.combine: no samples")
        if samples.count == 1 { var g = samples[0]; g.samples = 1; return g }
        let score = median(samples.map(\.score))
        let need = samples.count / 2 + 1
        let ids = rubric.isEmpty ? TextUtil.unique(samples.flatMap { $0.criteria.map(\.id) }) : rubric.map(\.id)
        let criteria = ids.map { id -> CriterionResult in
            let votes = samples.compactMap { s in s.criteria.first { $0.id == id } }
            let met = votes.filter(\.met).count >= need
            let evidence = votes.first { $0.met == met }?.evidence ?? votes.first?.evidence ?? ""
            return CriterionResult(id: id, met: met, evidence: evidence)
        }
        var tagOrder: [String] = []
        var counts: [String: Int] = [:]
        for s in samples {
            for t in TextUtil.unique(s.misconceptionTags) {
                if counts[t] == nil { tagOrder.append(t) }
                counts[t, default: 0] += 1
            }
        }
        let tags = tagOrder.filter { counts[$0]! >= need }
        var closest = samples[0]
        for s in samples.dropFirst() where abs(s.score - score) < abs(closest.score - score) { closest = s }
        let confidence = samples.map(\.confidence).reduce(0, +) / Double(samples.count)
        // The first wrong step: only when most samples found one, quoted from the sample nearest the median.
        let withError = samples.filter { $0.firstError != nil }
        let firstError = withError.count >= need
            ? (closest.firstError ?? withError.min { abs($0.score - score) < abs($1.score - score) }?.firstError)
            : nil
        return GradeResult(criteria: criteria, score: score, misconceptionTags: tags, feedback: closest.feedback,
                           confidence: confidence, samples: samples.count, firstError: firstError)
    }

    /// Rating band map (DESIGN §6.2): < 0.4 Again, < 0.75 Hard, < 0.95 Good, else Easy when confidence ≥ 0.8.
    public static func rating(score: Double, confidence: Double) -> Rating {
        if score < 0.4 { return .again }
        if score < 0.75 { return .hard }
        if score < 0.95 { return .good }
        return confidence >= 0.8 ? .easy : .good
    }

    /// Whether samples disagree on the rating band.
    public static func samplesDisagree(_ samples: [GradeResult]) -> Bool {
        Set(samples.map { rating(score: $0.score, confidence: $0.confidence) }).count > 1
    }

    /// Keep only rubric ids (missing ones become unmet) and known tags; clamp numbers to 0...1. A first error
    /// is kept only if its quote is really in the answer (it is what the mark is drawn on), and only its known tag.
    public static func sanitise(_ g: GradeResult, rubric: [RubricCriterion], misconceptionTags known: [String],
                                answer: String? = nil) -> GradeResult {
        let tags = Set(known)
        var out = g
        if !rubric.isEmpty {
            out.criteria = rubric.map { c in
                g.criteria.first { $0.id == c.id }.map { CriterionResult(id: c.id, met: $0.met, evidence: $0.evidence) }
                    ?? CriterionResult(id: c.id, met: false, evidence: "")
            }
        }
        func clamp(_ x: Double) -> Double { x.isFinite ? Swift.max(0, Swift.min(1, x)) : 0 }
        out.score = clamp(g.score)
        out.confidence = clamp(g.confidence)
        out.misconceptionTags = TextUtil.unique(g.misconceptionTags.filter { tags.contains($0) })
        if var e = g.firstError {
            e.quote = e.quote.trimmingCharacters(in: .whitespacesAndNewlines)
            e.why = e.why.trimmingCharacters(in: .whitespacesAndNewlines)
            if let tag = e.misconceptionTag, !tags.contains(tag) { e.misconceptionTag = nil }
            let inAnswer = answer.map { quoteAppears(e.quote, in: $0) } ?? true
            out.firstError = e.quote.isEmpty || e.why.isEmpty || !inAnswer ? nil : e
        }
        return out
    }

    /// Whether a quoted span is in the answer, ignoring case, spacing and punctuation differences.
    public static func quoteAppears(_ quote: String, in answer: String) -> Bool {
        let q = TextUtil.normalise(quote)
        return !q.isEmpty && TextUtil.normalise(answer).contains(q)
    }

    public static func grade(_ provider: any LLMProvider, _ input: GradeInput) async throws -> GradeOutcome {
        let ref = input.reference
        if let exact = ref.exact {
            let g = gradeExact(input.answer, exact: exact, rubric: input.rubric)
            if g.score == 1 || input.rubric.isEmpty { return GradeOutcome(grade: g, usage: .zero, disagreement: false) }
            // Wrong final answer but a rubric exists: grade the reasoning, capped below the Good band.
            var noExact = input
            noExact.reference = GradeReference(answer: ref.answer, notes: ref.notes)
            var llm = try await grade(provider, noExact)
            llm.grade.score = Swift.min(llm.grade.score, 0.5)
            let shown = TextUtil.jsSlice(input.answer.trimmingCharacters(in: .whitespacesAndNewlines), 80)
            llm.grade.feedback = "\(llm.grade.feedback) Your final answer (\(shown)) does not match the expected result."
            return llm
        }

        let req = buildRequest(input)
        var samples: [GradeResult] = []
        var usage = Usage.zero
        func draw() async throws {
            let r: Structured<GradeResult> = try await provider.structured(req, schema: schema, name: "GradeResult")
            usage = usage + r.usage
            samples.append(sanitise(r.value, rubric: input.rubric, misconceptionTags: input.misconceptions.map(\.tag), answer: input.answer))
        }
        let forced = Swift.max(1, input.samples ?? 1)
        for _ in 0..<forced { try await draw() }
        if forced == 1, needsConsensus(score: samples[0].score, confidence: samples[0].confidence, confidenceBar: input.consensusConfidence) {
            while samples.count < consensusSamples { try await draw() }
        }
        let grade = combine(samples, rubric: input.rubric)
        return GradeOutcome(grade: grade, usage: usage, disagreement: samples.count > 1 && samplesDisagree(samples))
    }
}
