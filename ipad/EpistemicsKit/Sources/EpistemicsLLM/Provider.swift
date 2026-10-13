import Foundation
import EpistemicsCore

// Provider-agnostic LLM interface (port of web/packages/llm/src/provider.ts).
// The network hop and the key are configured on the provider; role code never touches either.

/// `output_config.effort`. Thinking is adaptive and always on for the current models; effort is the cost knob.
public enum Effort: String, Codable, Sendable, Hashable, CaseIterable {
    case low, medium, high, xhigh, max
}

/// An image attached to a message (placed before the message's text). `data` is the raw file bytes;
/// the provider base64-encodes it.
public struct ImageContent: Sendable, Hashable {
    public var mediaType: String
    public var data: Data
    public init(mediaType: String = "image/png", data: Data) { self.mediaType = mediaType; self.data = data }
    public static func png(_ data: Data) -> ImageContent { ImageContent(mediaType: "image/png", data: data) }
}

public struct ChatMessage: Sendable, Hashable {
    public enum Role: String, Codable, Sendable, Hashable {
        case user, assistant
        /// A mid-conversation control message from the app's state machine.
        case system
    }
    public var role: Role
    public var content: String
    /// Images sent before `content` (user messages only).
    public var images: [ImageContent]
    /// Put a cache breakpoint after this message (the learner-model message that opens a tutor call).
    public var cache: Bool

    public init(role: Role, content: String, images: [ImageContent] = [], cache: Bool = false) {
        self.role = role; self.content = content; self.images = images; self.cache = cache
    }
    public static func user(_ text: String, images: [ImageContent] = [], cache: Bool = false) -> ChatMessage {
        ChatMessage(role: .user, content: text, images: images, cache: cache)
    }
    public static func assistant(_ text: String) -> ChatMessage { ChatMessage(role: .assistant, content: text) }
    public static func system(_ text: String) -> ChatMessage { ChatMessage(role: .system, content: text) }
}

/// One block of the system prompt; `cache: true` puts a breakpoint after it.
public struct CacheableBlock: Sendable, Hashable {
    public var text: String
    public var cache: Bool
    public init(_ text: String, cache: Bool = false) { self.text = text; self.cache = cache }
}

public struct RequestMetadata: Sendable, Hashable, Codable {
    public var sessionId: String?
    public var courseId: String?
    public init(sessionId: String? = nil, courseId: String? = nil) { self.sessionId = sessionId; self.courseId = courseId }
}

/// One LLM call. There is no temperature: the current models reject non-default sampling parameters.
/// Cancellation is Swift Task cancellation.
public struct LlmRequest: Sendable, Hashable {
    public var role: LlmRole
    /// Overrides the provider's per-role default.
    public var model: String?
    /// Ordered; blocks with `cache: true` get a cache breakpoint.
    public var system: [CacheableBlock]
    public var messages: [ChatMessage]
    public var maxTokens: Int?
    /// Defaults to the provider's per-role effort.
    public var effort: Effort?
    public var metadata: RequestMetadata?

    public init(role: LlmRole, model: String? = nil, system: [CacheableBlock] = [], messages: [ChatMessage],
                maxTokens: Int? = nil, effort: Effort? = nil, metadata: RequestMetadata? = nil) {
        self.role = role; self.model = model; self.system = system; self.messages = messages
        self.maxTokens = maxTokens; self.effort = effort; self.metadata = metadata
    }
}

public struct Usage: Sendable, Hashable, Codable {
    public var inputTokens: Int
    public var cacheRead: Int
    public var cacheWrite: Int
    public var outputTokens: Int
    public var costUsd: Double
    public var latencyMs: Int
    public var model: String

    public init(inputTokens: Int = 0, cacheRead: Int = 0, cacheWrite: Int = 0, outputTokens: Int = 0,
                costUsd: Double = 0, latencyMs: Int = 0, model: String = "") {
        self.inputTokens = inputTokens; self.cacheRead = cacheRead; self.cacheWrite = cacheWrite
        self.outputTokens = outputTokens; self.costUsd = costUsd; self.latencyMs = latencyMs; self.model = model
    }

    public static let zero = Usage()

    /// Build a usage record from raw token counts, priced from `Pricing`.
    public static func make(model: String, inputTokens: Int, outputTokens: Int, cacheRead: Int = 0, cacheWrite: Int = 0,
                            latencyMs: Int) -> Usage {
        Usage(inputTokens: inputTokens, cacheRead: cacheRead, cacheWrite: cacheWrite, outputTokens: outputTokens,
              costUsd: Pricing.cost(model: model, inputTokens: inputTokens, outputTokens: outputTokens,
                                    cacheRead: cacheRead, cacheWrite: cacheWrite),
              latencyMs: latencyMs, model: model)
    }

    /// Sum of two calls; the model is the later call's (empty models are ignored).
    public static func + (a: Usage, b: Usage) -> Usage {
        Usage(inputTokens: a.inputTokens + b.inputTokens, cacheRead: a.cacheRead + b.cacheRead,
              cacheWrite: a.cacheWrite + b.cacheWrite, outputTokens: a.outputTokens + b.outputTokens,
              costUsd: a.costUsd + b.costUsd, latencyMs: a.latencyMs + b.latencyMs,
              model: b.model.isEmpty ? a.model : b.model)
    }
}

/// What a usage sink receives: one call's usage plus who made it.
public struct UsageCall: Sendable, Hashable, Codable {
    public var usage: Usage
    public var role: LlmRole
    public var sessionId: String?
    public var courseId: String?
    /// Epoch ms when recorded (set by the ledger; 0 from providers).
    public var at: EpochMs

    public init(usage: Usage, role: LlmRole, sessionId: String? = nil, courseId: String? = nil, at: EpochMs = 0) {
        self.usage = usage; self.role = role; self.sessionId = sessionId; self.courseId = courseId; self.at = at
    }
    init(_ usage: Usage, _ req: LlmRequest) {
        self.init(usage: usage, role: req.role, sessionId: req.metadata?.sessionId, courseId: req.metadata?.courseId)
    }
}

/// Called once per completed API call (including each grader sample and each structured retry).
public typealias UsageSink = @Sendable (UsageCall) -> Void

public enum StreamEvent: Sendable, Hashable {
    case delta(String)
    /// The last event. `stopReason` is the API's (`end_turn`, `max_tokens`, …).
    case done(Usage, stopReason: String?)
}

public struct TextResult: Sendable, Hashable {
    public var text: String
    public var usage: Usage
    public var stopReason: String?
    public init(text: String, usage: Usage, stopReason: String? = nil) { self.text = text; self.usage = usage; self.stopReason = stopReason }
}

public struct Structured<T: Sendable>: Sendable {
    public var value: T
    /// Summed over every attempt (a parse retry is billed too).
    public var usage: Usage
    public init(value: T, usage: Usage) { self.value = value; self.usage = usage }
}

public protocol LLMProvider: Sendable {
    var name: String { get }
    /// Stream free text: `.delta`s, then one `.done` with usage. Errors (including refusals) are thrown as `LlmError`.
    func stream(_ request: LlmRequest) -> AsyncThrowingStream<StreamEvent, any Error>
    /// Non-streaming free text.
    func text(_ request: LlmRequest) async throws -> TextResult
    /// Structured output constrained by `schema` and decoded as `T`. Implementations retry once on a parse failure.
    func structured<T: Decodable & Sendable>(_ request: LlmRequest, schema: JSONSchema, name: String) async throws -> Structured<T>
}

extension LLMProvider {
    /// `structured` with the result type spelled out.
    public func structured<T: Decodable & Sendable>(_ request: LlmRequest, schema: JSONSchema, name: String, as: T.Type) async throws -> Structured<T> {
        try await structured(request, schema: schema, name: name)
    }

    /// Drain `stream`, calling `onText` with the accumulated text after each delta.
    public func streamText(_ request: LlmRequest, onText: (@Sendable (String) -> Void)? = nil) async throws -> TextResult {
        var text = ""
        for try await ev in stream(request) {
            switch ev {
            case .delta(let d):
                text += d
                onText?(text)
            case .done(let usage, let stop):
                return TextResult(text: text, usage: usage, stopReason: stop)
            }
        }
        throw LlmError(.connection, "Stream ended without a final event", retryable: true)
    }
}

// MARK: - Models, efforts, prices

/// Model id per role. Model ids are configuration, not code.
public struct ModelConfig: Sendable, Hashable, Codable {
    public var tutor: String
    public var observer: String
    public var grader: String
    public var architect: String
    public var itemwriter: String
    public var student: String
    public var leakcheck: String
    public var reader: String

    public init(tutor: String = "claude-opus-5-5", observer: String = "claude-haiku-5-5", grader: String = "claude-sonnet-5-5",
                architect: String = "claude-opus-5-5", itemwriter: String = "claude-sonnet-5-5", student: String = "claude-sonnet-5-5",
                leakcheck: String = "claude-haiku-5-5", reader: String = "claude-sonnet-5-5") {
        self.tutor = tutor; self.observer = observer; self.grader = grader; self.architect = architect
        self.itemwriter = itemwriter; self.student = student; self.leakcheck = leakcheck; self.reader = reader
    }

    public static let defaults = ModelConfig()

    public subscript(role: LlmRole) -> String {
        get {
            switch role {
            case .tutor: tutor
            case .observer: observer
            case .grader: grader
            case .architect: architect
            case .itemwriter: itemwriter
            case .student: student
            case .leakcheck: leakcheck
            case .reader: reader
            }
        }
        set {
            switch role {
            case .tutor: tutor = newValue
            case .observer: observer = newValue
            case .grader: grader = newValue
            case .architect: architect = newValue
            case .itemwriter: itemwriter = newValue
            case .student: student = newValue
            case .leakcheck: leakcheck = newValue
            case .reader: reader = newValue
            }
        }
    }
}

/// Effort sent when a request does not set one. Opus 5.5 and Haiku 5.5 default to `medium` and Sonnet 5.5 to
/// `high` server-side, so the provider always sends one explicitly.
public func defaultEffort(for role: LlmRole) -> Effort {
    switch role {
    case .tutor, .grader, .reader, .itemwriter: .medium
    case .observer, .student, .leakcheck: .low
    case .architect: .high
    }
}

/// Default `max_tokens`: architect and item writer emit whole curricula; structured roles 2048; free text 4096.
public func defaultMaxTokens(role: LlmRole, structured: Bool) -> Int {
    if role == .architect || role == .itemwriter { return 16000 }
    return structured ? 2048 : 4096
}

public struct ModelPrice: Sendable, Hashable {
    /// USD per million tokens.
    public var input: Double, output: Double, cacheRead: Double, cacheWrite: Double
    public init(input: Double, output: Double, cacheRead: Double, cacheWrite: Double) {
        self.input = input; self.output = output; self.cacheRead = cacheRead; self.cacheWrite = cacheWrite
    }
}

public enum Pricing {
    /// Current models: cache writes priced at the 1-hour TTL (2x input), which is what the provider uses.
    /// Previous-generation ids are kept with the web's values so web-synced usage rows price the same.
    public static let prices: [String: ModelPrice] = [
        "claude-opus-5-5": ModelPrice(input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8),
        "claude-sonnet-5-5": ModelPrice(input: 2, output: 10, cacheRead: 0.2, cacheWrite: 4),
        "claude-haiku-5-5": ModelPrice(input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.2),
        // fallback targets and the web's previous defaults
        "claude-opus-4-8": ModelPrice(input: 5, output: 25, cacheRead: 0.5, cacheWrite: 10),
        "claude-opus-5": ModelPrice(input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25),
        "claude-sonnet-5": ModelPrice(input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5),
        "claude-haiku-4-5": ModelPrice(input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25),
    ]

    /// USD for one call; unknown models cost 0.
    public static func cost(model: String, inputTokens: Int, outputTokens: Int, cacheRead: Int, cacheWrite: Int) -> Double {
        guard let p = prices[model] else { return 0 }
        let micro = Double(inputTokens) * p.input + Double(outputTokens) * p.output
            + Double(cacheRead) * p.cacheRead + Double(cacheWrite) * p.cacheWrite
        return micro / 1_000_000
    }
}

// MARK: - Errors

/// Error raised by providers and roles. `kind` lets callers decide between retry, degrade and surface.
public struct LlmError: Error, Sendable, Hashable, CustomStringConvertible {
    public enum Kind: String, Sendable, Hashable {
        case refusal, rateLimit = "rate_limit", connection, status, parse, aborted, unknown
    }
    public var kind: Kind
    public var message: String
    public var status: Int?
    public var retryable: Bool
    /// Refusals: `stop_details.category` / `.explanation`.
    public var refusalCategory: String?
    public var refusalExplanation: String?
    /// Usage of the call that failed, when it completed (refusals).
    public var usage: Usage?

    public init(_ kind: Kind, _ message: String, status: Int? = nil, retryable: Bool? = nil,
                refusalCategory: String? = nil, refusalExplanation: String? = nil, usage: Usage? = nil) {
        self.kind = kind; self.message = message; self.status = status
        self.retryable = retryable ?? (kind == .rateLimit || kind == .connection)
        self.refusalCategory = refusalCategory; self.refusalExplanation = refusalExplanation; self.usage = usage
    }

    public var description: String { "LlmError(\(kind.rawValue)): \(message)" }

    /// Map any error onto an LlmError.
    public static func classify(_ e: any Error) -> LlmError {
        if let e = e as? LlmError { return e }
        if e is CancellationError { return LlmError(.aborted, "Request aborted", retryable: false) }
        if let u = e as? URLError {
            if u.code == .cancelled { return LlmError(.aborted, "Request aborted", retryable: false) }
            return LlmError(.connection, "Connection error: \(u.localizedDescription)", retryable: true)
        }
        if e is DecodingError { return LlmError(.parse, "Could not decode response: \(e)", retryable: false) }
        return LlmError(.unknown, String(describing: e), retryable: false)
    }
}
