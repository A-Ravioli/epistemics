import Foundation

/// A hidden answer the tutor must not reveal.
public struct LeakReference: Sendable, Hashable, Codable {
    public var answer: String
    public var exact: String?
    public init(answer: String, exact: String? = nil) { self.answer = answer; self.exact = exact }
}

public struct LeakVerdict: Sendable, Hashable {
    public enum Reason: String, Sendable, Hashable { case exact, phrase, model, none, inconclusive }
    public var leaked: Bool
    public var reason: Reason
    public var detail: String?
    public init(leaked: Bool, reason: Reason, detail: String? = nil) { self.leaked = leaked; self.reason = reason; self.detail = detail }
}

/// The leakcheck model's verdict.
public struct LeakCheckResult: Codable, Sendable, Hashable {
    public var leaked: Bool
    public var reason: String
    public init(leaked: Bool, reason: String) { self.leaked = leaked; self.reason = reason }
}

public struct TurnShape: Sendable, Hashable {
    public var ok: Bool
    public var questions: Int
    public var words: Int
    public init(ok: Bool, questions: Int, words: Int) { self.ok = ok; self.questions = questions; self.words = words }
}

/// Leak detector and turn-shape checker (port of roles/leak.ts), run on every tutor turn before rendering:
/// 1. normalised containment of the exact answer;
/// 2. a run of ≥ 4 reference content words appearing contiguously in the tutor text;
/// 3. if inconclusive (heavy vocabulary overlap without such a run) and a provider is given, the leakcheck model.
public enum Leak {
    public static let phraseWindow = 4
    /// Fraction of the reference's distinct content words present in the tutor text above which the model is asked.
    public static let inconclusiveOverlap = 0.6
    public static let inconclusiveMinWords = 3

    public static let schema = JSONSchema.object(["leaked": .boolean, "reason": .string])

    static func containsExact(_ tutorText: String, _ exact: String) -> Bool {
        let e = TextUtil.normalise(exact)
        guard !e.isEmpty else { return false }
        return " \(TextUtil.normalise(tutorText)) ".contains(" \(e) ")
    }

    /// Longest contiguous run of reference content words that also appears contiguously in the tutor text.
    static func longestSharedRun(_ tutorText: String, _ answer: String) -> (length: Int, phrase: String) {
        let t = TextUtil.contentWords(tutorText)
        let a = TextUtil.contentWords(answer)
        guard !t.isEmpty, !a.isEmpty else { return (0, "") }
        let joined = " " + t.joined(separator: " ") + " "
        var best = (length: 0, phrase: "")
        for i in a.indices {
            var len = min(a.count - i, 12)
            while len > best.length {
                let phrase = a[i..<(i + len)].joined(separator: " ")
                if joined.contains(" \(phrase) ") { best = (len, phrase); break }
                len -= 1
            }
        }
        return best
    }

    static func overlapFraction(_ tutorText: String, _ answer: String) -> Double {
        let a = Set(TextUtil.contentWords(answer))
        guard !a.isEmpty else { return 0 }
        let t = Set(TextUtil.contentWords(tutorText))
        return Double(a.filter { t.contains($0) }.count) / Double(a.count)
    }

    /// Pure, synchronous part of the detector. `inconclusive` means a model check is advisable.
    public static func heuristic(_ tutorText: String, reference: LeakReference) -> LeakVerdict {
        // code blocks are checked too: reference answers may be code
        if let exact = reference.exact, !exact.isEmpty, containsExact(tutorText, exact) {
            return LeakVerdict(leaked: true, reason: .exact, detail: exact)
        }
        let run = longestSharedRun(tutorText, reference.answer)
        if run.length >= phraseWindow { return LeakVerdict(leaked: true, reason: .phrase, detail: run.phrase) }
        let distinct = Set(TextUtil.contentWords(reference.answer)).count
        let overlap = overlapFraction(tutorText, reference.answer)
        if distinct >= inconclusiveMinWords, overlap >= inconclusiveOverlap {
            return LeakVerdict(leaked: false, reason: .inconclusive, detail: "overlap " + String(format: "%.2f", overlap))
        }
        return LeakVerdict(leaked: false, reason: .none)
    }

    public static func buildRequest(_ tutorText: String, reference: LeakReference, model: String? = nil,
                                    metadata: RequestMetadata? = nil) -> LlmRequest {
        let payload = OrderedJSON.obj([
            ("tutorText", .string(tutorText)),
            ("reference", OrderedJSON.obj([("answer", .string(reference.answer)), ("exact", .opt(reference.exact?.isEmpty == false ? reference.exact : nil))])),
        ])
        return LlmRequest(role: .leakcheck, model: model, system: [CacheableBlock(Prompts.leakcheck, cache: true)],
                          messages: [.user(RoleInput.encode(payload))], maxTokens: 1024, effort: .low, metadata: metadata)
    }

    /// Full detector: heuristics first; the leakcheck model only on an inconclusive result and when a provider is given.
    public static func detect(_ tutorText: String, reference: LeakReference, provider: (any LLMProvider)? = nil,
                              metadata: RequestMetadata? = nil) async throws -> LeakVerdict {
        let h = heuristic(tutorText, reference: reference)
        guard h.reason == .inconclusive, let provider else { return h }
        let r: Structured<LeakCheckResult> = try await provider.structured(
            buildRequest(tutorText, reference: reference, metadata: metadata), schema: schema, name: "LeakCheck")
        return LeakVerdict(leaked: r.value.leaked, reason: r.value.leaked ? .model : .none, detail: r.value.reason)
    }

    /// Question marks outside code (runs like "??" count once) and words; ok when ≤ 1 question and ≤ maxWords.
    public static func checkTurnShape(_ text: String, maxWords: Int) -> TurnShape {
        let q = TextUtil.questionCount(text)
        let w = TextUtil.wordCount(text)
        return TurnShape(ok: q <= 1 && w <= maxWords, questions: q, words: w)
    }
}
