import Foundation
import Synchronization
import EpistemicsCore

/// A scripted response for the mock provider.
public enum MockResponse: Sendable, ExpressibleByStringLiteral {
    /// Free text, or JSON text for a structured call.
    case text(String)
    /// A structured value.
    case json(JSONValue)
    /// Computed from the request.
    case dynamic(@Sendable (LlmRequest) -> MockResponse)

    public init(stringLiteral value: String) { self = .text(value) }

    /// Any Encodable value, as JSON.
    public static func value<E: Encodable>(_ v: E) -> MockResponse {
        let data = (try? JSONEncoder().encode(v)) ?? Data("null".utf8)
        return .json((try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null)
    }
}

/// Deterministic provider for tests and the offline "Demo tutor" (port of providers/mock.ts):
/// - queued responses per role (`queue`, `push(_:_:)`), consumed in order,
/// - then `respond`, then built-in heuristics that yield valid observer / grader / warm-up / leak-check / reader
///   results from the fenced JSON input block,
/// - records every request in `calls`,
/// - simulates streaming with word deltas.
public final class MockProvider: LLMProvider, Sendable {
    public struct Script: Sendable {
        public var queue: [LlmRole: [MockResponse]]
        /// Default responder when the role's queue is empty; return nil for the built-in heuristics.
        public var respond: (@Sendable (LlmRequest) -> MockResponse?)?
        /// Model reported in usage (default "mock"; use a priced id to exercise cost accounting).
        public var model: String
        public var onUsage: UsageSink?
        /// Delay between streamed deltas (demo mode). Default 0.
        public var delay: Duration
        /// Fixed latency reported in usage.
        public var latencyMs: Int

        public init(queue: [LlmRole: [MockResponse]] = [:], respond: (@Sendable (LlmRequest) -> MockResponse?)? = nil,
                    model: String = "mock", onUsage: UsageSink? = nil, delay: Duration = .zero, latencyMs: Int = 0) {
            self.queue = queue; self.respond = respond; self.model = model; self.onUsage = onUsage
            self.delay = delay; self.latencyMs = latencyMs
        }
    }

    public let name = "mock"
    private let script: Script
    private struct State { var queue: [LlmRole: [MockResponse]]; var calls: [LlmRequest] }
    private let state: Mutex<State>

    public init(_ script: Script = Script()) {
        self.script = script
        self.state = Mutex(State(queue: script.queue, calls: []))
    }

    /// Every request received, in order.
    public var calls: [LlmRequest] { state.withLock { $0.calls } }

    public func push(_ role: LlmRole, _ responses: MockResponse...) {
        state.withLock { $0.queue[role, default: []].append(contentsOf: responses) }
    }

    public func reset() {
        state.withLock { $0.calls.removeAll(); $0.queue.removeAll() }
    }

    // MARK: Resolution

    private func resolve(_ req: LlmRequest) throws -> MockResolved {
        let next: MockResponse? = state.withLock { s in
            s.calls.append(req)
            guard var q = s.queue[req.role], !q.isEmpty else { return nil }
            let n = q.removeFirst()
            s.queue[req.role] = q
            return n
        }
        var r = next ?? script.respond?(req)
        while case .dynamic(let f)? = r { r = f(req) }
        switch r {
        case .text(let t)?: return .text(t)
        case .json(let j)?: return .json(j)
        case .dynamic?, nil: return try MockHeuristics.defaultResponse(req)
        }
    }

    private static func text(of r: MockResolved) -> String {
        switch r {
        case .text(let t): return t
        case .json(let j):
            let enc = JSONEncoder()
            enc.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
            return String(decoding: (try? enc.encode(j)) ?? Data(), as: UTF8.self)
        }
    }

    private static func approxTokens(_ s: String) -> Int { (s.utf16.count + 3) / 4 }

    private func usage(for req: LlmRequest, output: String) -> Usage {
        let input = req.system.map(\.text).joined(separator: "\n") + req.messages.map(\.content).joined(separator: "\n")
        let cacheable = req.system.filter(\.cache).map(\.text).joined() + req.messages.filter(\.cache).map(\.content).joined()
        let cached = Self.approxTokens(cacheable)
        let total = Self.approxTokens(input)
        let u = Usage.make(model: req.model ?? script.model, inputTokens: total - cached, outputTokens: Self.approxTokens(output),
                           cacheRead: cached, latencyMs: script.latencyMs)
        script.onUsage?(UsageCall(u, req))
        return u
    }

    // MARK: LLMProvider

    public func stream(_ req: LlmRequest) -> AsyncThrowingStream<StreamEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let text = Self.text(of: try resolve(req))
                    for d in TextUtil.splitDeltas(text) {
                        try Task.checkCancellation()
                        if script.delay > .zero { try await Task.sleep(for: script.delay) }
                        continuation.yield(.delta(d))
                    }
                    continuation.yield(.done(usage(for: req, output: text), stopReason: "end_turn"))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: LlmError.classify(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func text(_ req: LlmRequest) async throws -> TextResult {
        let text = Self.text(of: try resolve(req))
        return TextResult(text: text, usage: usage(for: req, output: text), stopReason: "end_turn")
    }

    public func structured<T: Decodable & Sendable>(_ req: LlmRequest, schema: JSONSchema, name: String) async throws -> Structured<T> {
        let text = Self.text(of: try resolve(req))
        do {
            let value = try JSONDecoder().decode(T.self, from: Data(text.utf8))
            return Structured(value: value, usage: usage(for: req, output: text))
        } catch {
            throw LlmError(.parse, "mock provider: response for \(req.role.rawValue) does not match \(name): \(error)", retryable: false)
        }
    }
}

// MARK: - Built-in heuristics

/// The mock's deterministic stand-ins for each role, public so tests and previews can use them directly.
public enum MockHeuristics {
    static let giveUp = try! NSRegularExpression(
        pattern: "^\\s*(idk|i don'?t know|dunno|no idea|not sure|pass|skip|just tell me|tell me the answer)\\b",
        options: [.caseInsensitive])
    static let priorKnowledge = try! NSRegularExpression(
        pattern: "\\b(remember|learned|learnt|know|earlier|before|last time|we did)\\b", options: [.caseInsensitive])

    static func test(_ r: NSRegularExpression, _ s: String) -> Bool {
        r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    public static let defaultTutorText = "Before we go further, try putting the key idea in your own words: what do you think is going on here, and why?"
    public static let defaultStudentText = "Hmm, I'm not sure I follow yet. Could you walk me through one concrete example of that?"

    /// Length > 3 and not an "idk"-style message.
    public static func attemptMade(_ learnerText: String) -> Bool {
        let t = TextUtil.jsTrim(learnerText)
        return t.utf16.count > 3 && !test(giveUp, t)
    }

    // Payload shapes (the fields the role builders write).
    struct ObserverPayload: Decodable {
        struct Objective: Decodable { var id: String; var text: String }
        struct Misc: Decodable { var tag: String; var description: String }
        struct ConceptP: Decodable { var name: String?; var definition: String?; var objectives: [Objective]?; var misconceptions: [Misc]? }
        var learnerTurn: String?
        var tutorTurnBefore: String?
        var concept: ConceptP?
        var previousTurnNoProgress: Bool?
        var phase: String?
        var marksAllowed: Bool?
    }

    struct GraderPayload: Decodable {
        struct Criterion: Decodable { var id: String; var text: String }
        var reference: String?
        var rubric: [Criterion]?
        var answer: String?
        var misconceptions: [ObserverPayload.Misc]?
    }

    struct LeakPayload: Decodable { var tutorText: String?; var reference: LeakReference? }
    struct WarmupPayload: Decodable { var dump: String?; var concepts: [WarmupConcept]? }
    struct ReaderPayload: Decodable { var draft: String? }

    public static func observe(learnerTurn learner: String, tutorTurnBefore: String = "", concept: ObserverConcept?,
                               previousTurnNoProgress: Bool? = nil) -> ObserverResult {
        let attempt = attemptMade(learner)
        let gaveUp = test(giveUp, TextUtil.jsTrim(learner))
        let objectives = concept?.objectives ?? []
        let definition = concept?.definition ?? ""
        let progress = objectives.map { o -> ObserverResult.ObjectiveProgress in
            let shared = TextUtil.sharedContentWords(learner, o.text)
            return .init(objectiveId: o.id, status: shared >= 3 ? .met : shared >= 1 ? .partial : .none)
        }
        let tags = (concept?.misconceptions ?? []).filter { TextUtil.sharedContentWords(learner, $0.description) >= 3 }.map(\.tag)
        let context = "\(definition) \(objectives.map(\.text).joined(separator: " ")) \(tutorTurnBefore)"
        let offTopic = attempt && TextUtil.contentWords(learner).count >= 3 && TextUtil.sharedContentWords(learner, context) == 0
        return ObserverResult(
            attemptMade: attempt && !offTopic, gaveUp: gaveUp, offTopic: offTopic, objectiveProgress: progress,
            misconceptionTags: tags, keyIdeaStated: TextUtil.sharedContentWords(learner, definition) >= 3,
            priorKnowledgeElicited: test(priorKnowledge, learner),
            stuck: previousTurnNoProgress == true && (!attempt || progress.allSatisfy { $0.status == .none }),
            unsourcedClaims: [])
    }

    /// Mock mark: the learner's first clause (up to 8 words) when marks are allowed and they made an attempt;
    /// a note only when a misconception was tagged.
    public static func mark(learnerTurn: String, observation: ObserverResult, marksAllowed: Bool) -> TutorMark? {
        guard marksAllowed, observation.attemptMade else { return nil }
        let trimmed = TextUtil.jsTrim(learnerTurn)
        let clauseEnd = trimmed.firstIndex { ".,;:!?\n".contains($0) } ?? trimmed.endIndex
        let clause = trimmed[..<clauseEnd]
        let words = clause.split(whereSeparator: \.isWhitespace).prefix(8)
        guard let first = words.first, let last = words.last else { return nil }
        let quote = String(clause[first.startIndex..<last.endIndex])
        return TutorMark(quote: quote, note: observation.misconceptionTags.isEmpty ? nil : "Look again at this step.")
    }

    public static func grade(answer: String, reference: String, rubricIds: [String],
                             misconceptions: [(tag: String, description: String)] = []) -> GradeResult {
        let good = TextUtil.sharedContentWords(answer, reference) >= 3
        let evidence = good ? TextUtil.jsSlice(TextUtil.jsTrim(answer), 120) : ""
        return GradeResult(
            criteria: rubricIds.map { CriterionResult(id: $0, met: good, evidence: evidence) },
            score: good ? 0.9 : 0.3,
            misconceptionTags: misconceptions.filter { TextUtil.sharedContentWords(answer, $0.description) >= 3 }.map(\.tag),
            feedback: good
                ? "Your answer covers the key ideas of the reference. One detail could be sharper: state the mechanism explicitly."
                : "Your answer misses the key ideas of the reference. Restate what the concept claims and why it holds.",
            confidence: 0.9)
    }

    public static func warmup(dump: String, concepts: [WarmupConcept]) -> WarmupResult {
        var recalled: [String] = [], partial: [String] = []
        for c in concepts {
            let nameWords = TextUtil.contentWords(c.name)
            let named = !nameWords.isEmpty && TextUtil.sharedContentWords(dump, c.name) == Set(nameWords).count
            let gloss = TextUtil.sharedContentWords(dump, c.definition)
            if named && gloss >= 2 { recalled.append(c.id) } else if named || gloss >= 2 { partial.append(c.id) }
        }
        return WarmupResult(recalledConceptIds: recalled, partial: partial)
    }

    static let boxedPattern = try! NSRegularExpression(pattern: "\\\\boxed\\{([^}]*)\\}")
    static let struckPattern = try! NSRegularExpression(pattern: "~~(.+?)~~")
    static let arrowLine = try! NSRegularExpression(pattern: "^\\s*(.+?)\\s*->\\s*(.+?)\\s*(?::\\s*(.+?)\\s*)?$")

    /// Mock Reader: echoes the draft as the reading. `~~x~~` is crossed out (removed from the text and listed);
    /// `\boxed{x}` is the boxed answer; lines `a -> b` (optionally `a -> b : label`) form the diagram; a token
    /// containing `?` is an uncertain span whose alternative is the token without the `?`.
    public static func read(draft: String) -> ReaderOutput {
        func groups(_ r: NSRegularExpression, _ s: String) -> [[String?]] {
            r.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { m in
                (1..<m.numberOfRanges).map { i in Range(m.range(at: i), in: s).map { String(s[$0]) } }
            }
        }
        let crossed = groups(struckPattern, draft).compactMap { $0.first ?? nil }
        var text = TextUtil.replace(struckPattern, in: draft, with: "")
        text = text.components(separatedBy: "\n").map { $0.replacingOccurrences(of: "  ", with: " ") }
            .map { TextUtil.jsTrim($0) }.joined(separator: "\n")
        text = TextUtil.jsTrim(text)
        let boxed = groups(boxedPattern, text).first?.first ?? nil

        var nodes: [ReaderOutput.Node] = []
        var edges: [ReaderOutput.Edge] = []
        func node(_ label: String) -> String {
            if let n = nodes.first(where: { $0.label == label }) { return n.id }
            let id = "n\(nodes.count + 1)"
            nodes.append(.init(id: id, label: label))
            return id
        }
        for line in text.components(separatedBy: "\n") {
            guard let g = groups(arrowLine, line).first, let a = g[0], let b = g[1] else { continue }
            edges.append(.init(from: node(a), to: node(b), label: g.count > 2 ? g[2] : nil))
        }

        var uncertain: [ReaderOutput.Uncertain] = []
        if text.contains("?") {
            for tok in text.split(whereSeparator: \.isWhitespace).map(String.init) where tok.contains("?") {
                let alt = tok.replacingOccurrences(of: "?", with: "")
                guard !uncertain.contains(where: { $0.span == tok }) else { continue }
                uncertain.append(.init(span: tok, alternatives: alt.isEmpty ? [] : [alt]))
            }
        }
        return ReaderOutput(text: text, boxed: boxed, diagram: nodes.isEmpty ? nil : .init(nodes: nodes, edges: edges),
                          crossedOut: crossed, uncertain: uncertain)
    }

    static func encodeJSON<E: Encodable>(_ v: E) -> JSONValue {
        let data = (try? JSONEncoder().encode(v)) ?? Data("null".utf8)
        return (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null
    }

    static func defaultResponse(_ req: LlmRequest) throws -> MockResolved {
        switch req.role {
        case .observer:
            let p = RoleInput.decode(req, as: ObserverPayload.self)
            let concept = p?.concept.map { c in
                ObserverConcept(name: c.name ?? "", definition: c.definition ?? "",
                                objectives: (c.objectives ?? []).map { .init(id: $0.id, text: $0.text) },
                                misconceptions: (c.misconceptions ?? []).map { .init(tag: $0.tag, description: $0.description) })
            }
            let learner = p?.learnerTurn ?? RoleInput.lastUserText(req)
            let obs = observe(learnerTurn: learner, tutorTurnBefore: p?.tutorTurnBefore ?? "", concept: concept,
                              previousTurnNoProgress: p?.previousTurnNoProgress)
            if p?.phase != nil {
                let m = mark(learnerTurn: learner, observation: obs, marksAllowed: p?.marksAllowed ?? false)
                return .json(encodeJSON(InkObserverResult(observation: obs, mark: m)))
            }
            return .json(encodeJSON(obs))
        case .grader:
            if let w = RoleInput.decode(req, as: WarmupPayload.self), let dump = w.dump {
                return .json(encodeJSON(warmup(dump: dump, concepts: w.concepts ?? [])))
            }
            let p = RoleInput.decode(req, as: GraderPayload.self)
            let g = grade(answer: p?.answer ?? RoleInput.lastUserText(req), reference: p?.reference ?? "",
                          rubricIds: (p?.rubric ?? []).map(\.id),
                          misconceptions: (p?.misconceptions ?? []).map { ($0.tag, $0.description) })
            return .json(encodeJSON(g))
        case .leakcheck:
            let p = RoleInput.decode(req, as: LeakPayload.self)
            let v = Leak.heuristic(p?.tutorText ?? "", reference: p?.reference ?? LeakReference(answer: ""))
            // the model path is only consulted on inconclusive heuristics; treat heavy overlap as a leak
            let leaked = v.leaked || v.reason == .inconclusive
            return .json(encodeJSON(LeakCheckResult(leaked: leaked, reason: leaked ? "mock: the message restates the reference"
                                                                                  : "mock: no overlap with the reference")))
        case .reader:
            let p = RoleInput.decode(req, as: ReaderPayload.self)
            return .json(encodeJSON(read(draft: p?.draft ?? "")))
        case .tutor:
            return .text(defaultTutorText)
        case .student:
            return .text(defaultStudentText)
        case .architect, .itemwriter:
            throw LlmError(.parse, "mock provider: no scripted response for role \"\(req.role.rawValue)\"", retryable: false)
        }
    }
}

enum MockResolved { case text(String), json(JSONValue) }
