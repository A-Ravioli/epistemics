import Foundation
import EpistemicsCore

// Request building and response parsing for the Messages API (raw HTTP; Swift has no official SDK).
// Port of buildAnthropicParams / toAnthropicMessages / capBreakpoints from providers/anthropic.ts.

public enum CacheTTL: String, Sendable, Hashable {
    case fiveMinutes = "5m"
    case oneHour = "1h"
}

/// Models that accept `{"role": "system"}` entries inside `messages` (mid-conversation control messages).
public func supportsMidSystem(_ model: String) -> Bool {
    let prefixes = ["claude-opus-5", "claude-fable", "claude-mythos", "claude-opus-4-8", "claude-sonnet-5-5", "claude-haiku-5-5"]
    return prefixes.contains { model.hasPrefix($0) }
}

/// Models that get server-side refusal fallbacks (`fallbacks: "default"`) when the provider option is on.
public func supportsServerSideFallback(_ model: String) -> Bool {
    model == "claude-opus-5-5" || model == "claude-sonnet-5-5"
}

public let maxCacheBreakpoints = 4
let fallbackBeta = "server-side-fallback-2026-07-01"

struct WireBlock: Equatable {
    enum Kind: Equatable {
        case text(String)
        case image(mediaType: String, base64: String)
    }
    var kind: Kind
    var cache: Bool = false
}

struct WireMessage: Equatable {
    enum Content: Equatable {
        case text(String)
        case blocks([WireBlock])
    }
    var role: String
    var content: Content
}

/// Convert ChatMessages to API messages.
/// - `cache: true` messages become blocks whose last block carries `cache_control`; images precede the text.
/// - `system` messages are sent as `{role: "system"}` when the model supports it, the previous entry is a user
///   message, and the next non-control entry is not a user message (API placement rules); consecutive controls
///   merge. Otherwise they are folded into the preceding user message as a trailing "[control] …" paragraph,
///   or become a new user message when there is none.
func toAnthropicMessages(_ messages: [ChatMessage], midSystem: Bool) -> [WireMessage] {
    var out: [WireMessage] = []
    for (i, m) in messages.enumerated() {
        if m.role == .system {
            let nextRole = messages[(i + 1)...].first { $0.role != .system }?.role
            let placeable = nextRole != .user
            if midSystem, placeable, let prev = out.last, prev.role == "user" {
                out.append(WireMessage(role: "system", content: .text(m.content)))
                continue
            }
            if midSystem, placeable, let prev = out.last, prev.role == "system", case .text(let t) = prev.content {
                out[out.count - 1].content = .text(t + "\n\n" + m.content)
                continue
            }
            let para = "[control] " + m.content
            if let prev = out.last, prev.role == "user" {
                switch prev.content {
                case .text(let t): out[out.count - 1].content = .text(t + "\n\n" + para)
                case .blocks(let b): out[out.count - 1].content = .blocks(b + [WireBlock(kind: .text(para))])
                }
            } else {
                out.append(WireMessage(role: "user", content: .text(para)))
            }
            continue
        }
        let role = m.role.rawValue
        if m.images.isEmpty && !m.cache {
            out.append(WireMessage(role: role, content: .text(m.content)))
            continue
        }
        var blocks = m.images.map { WireBlock(kind: .image(mediaType: $0.mediaType, base64: $0.data.base64EncodedString())) }
        if !m.content.isEmpty || blocks.isEmpty { blocks.append(WireBlock(kind: .text(m.content))) }
        if m.cache { blocks[blocks.count - 1].cache = true }
        out.append(WireMessage(role: role, content: .blocks(blocks)))
    }
    return out
}

/// Keep at most `maxCacheBreakpoints` markers, dropping the earliest (a later breakpoint still covers the prefix).
func capBreakpoints(system: inout [WireBlock], messages: inout [WireMessage]) {
    var marked: [(msg: Int?, block: Int)] = []
    for (i, b) in system.enumerated() where b.cache { marked.append((nil, i)) }
    for (mi, m) in messages.enumerated() {
        guard case .blocks(let bs) = m.content else { continue }
        for (bi, b) in bs.enumerated() where b.cache { marked.append((mi, bi)) }
    }
    let excess = marked.count - maxCacheBreakpoints
    guard excess > 0 else { return }
    for (msg, block) in marked.prefix(excess) {
        if let msg {
            guard case .blocks(var bs) = messages[msg].content else { continue }
            bs[block].cache = false
            messages[msg].content = .blocks(bs)
        } else {
            system[block].cache = false
        }
    }
}

func encode(_ b: WireBlock, ttl: CacheTTL) -> OrderedJSON {
    var pairs: [(String, OrderedJSON)]
    switch b.kind {
    case .text(let t):
        pairs = [("type", .string("text")), ("text", .string(t))]
    case .image(let mediaType, let data):
        pairs = [("type", .string("image")),
                 ("source", .object([("type", .string("base64")), ("media_type", .string(mediaType)), ("data", .string(data))]))]
    }
    if b.cache { pairs.append(("cache_control", .object([("type", .string("ephemeral")), ("ttl", .string(ttl.rawValue))]))) }
    return .object(pairs)
}

func encode(_ m: WireMessage, ttl: CacheTTL) -> OrderedJSON {
    let content: OrderedJSON
    switch m.content {
    case .text(let t): content = .string(t)
    case .blocks(let bs): content = .array(bs.map { encode($0, ttl: ttl) })
    }
    return .object([("role", .string(m.role)), ("content", content)])
}

/// The JSON body and resolved model for one request.
struct AnthropicBody {
    var model: String
    var json: OrderedJSON
    var fallbacks: Bool
}

func buildAnthropicBody(_ req: LlmRequest, models: ModelConfig, schema: JSONSchema?, stream: Bool,
                        ttl: CacheTTL = .oneHour, serverSideFallbacks: Bool = true) -> AnthropicBody {
    let model = req.model ?? models[req.role]
    var system = req.system.filter { !$0.text.isEmpty }.map { WireBlock(kind: .text($0.text), cache: $0.cache) }
    var messages = toAnthropicMessages(req.messages, midSystem: supportsMidSystem(model))
    capBreakpoints(system: &system, messages: &messages)

    var pairs: [(String, OrderedJSON)] = [
        ("model", .string(model)),
        ("max_tokens", .int(req.maxTokens ?? defaultMaxTokens(role: req.role, structured: schema != nil))),
    ]
    if !system.isEmpty { pairs.append(("system", .array(system.map { encode($0, ttl: ttl) }))) }
    pairs.append(("messages", .array(messages.map { encode($0, ttl: ttl) })))
    var output: [(String, OrderedJSON)] = [("effort", .string((req.effort ?? defaultEffort(for: req.role)).rawValue))]
    if let schema {
        output.append(("format", .object([("type", .string("json_schema")), ("schema", schema.json)])))
    }
    pairs.append(("output_config", .object(output)))
    let fallbacks = serverSideFallbacks && supportsServerSideFallback(model)
    if fallbacks { pairs.append(("fallbacks", .string("default"))) }
    if stream { pairs.append(("stream", .bool(true))) }
    return AnthropicBody(model: model, json: .object(pairs), fallbacks: fallbacks)
}

// MARK: - Responses

struct WireUsage: Decodable {
    var input_tokens: Int?
    var output_tokens: Int?
    var cache_read_input_tokens: Int?
    var cache_creation_input_tokens: Int?
    var iterations: [WireIteration]?
}

/// One attempt of a request served with fallbacks (`usage.iterations`).
struct WireIteration: Decodable {
    var type: String?
    var model: String?
    var input_tokens: Int?
    var output_tokens: Int?
    var cache_read_input_tokens: Int?
    var cache_creation_input_tokens: Int?
}

struct WireStopDetails: Decodable {
    var type: String?
    var category: String?
    var explanation: String?
}

struct WireContentBlock: Decodable {
    var type: String
    var text: String?
}

struct WireMessageResponse: Decodable {
    var model: String?
    var content: [WireContentBlock]
    var stop_reason: String?
    var stop_details: WireStopDetails?
    var usage: WireUsage?
}

struct WireErrorBody: Decodable {
    struct Inner: Decodable { var type: String?; var message: String? }
    var error: Inner?
}

/// Usage of a completed call. With fallbacks, `usage.iterations` is the per-attempt source of truth: tokens are
/// summed over attempts and each attempt is priced at its own model (falling back to the served model).
func usageFrom(_ u: WireUsage?, servedModel: String, latencyMs: Int) -> Usage {
    if let its = u?.iterations, !its.isEmpty, its.contains(where: { $0.input_tokens != nil || $0.output_tokens != nil }) {
        var total = Usage(latencyMs: latencyMs, model: servedModel)
        for it in its {
            let m = it.model ?? servedModel
            let part = Usage.make(model: m, inputTokens: it.input_tokens ?? 0, outputTokens: it.output_tokens ?? 0,
                                  cacheRead: it.cache_read_input_tokens ?? 0, cacheWrite: it.cache_creation_input_tokens ?? 0,
                                  latencyMs: 0)
            total.inputTokens += part.inputTokens; total.outputTokens += part.outputTokens
            total.cacheRead += part.cacheRead; total.cacheWrite += part.cacheWrite; total.costUsd += part.costUsd
        }
        return total
    }
    return Usage.make(model: servedModel, inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0,
                      cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0,
                      latencyMs: latencyMs)
}

func refusalError(_ d: WireStopDetails?, usage: Usage?) -> LlmError {
    let cat = d?.category.map { " (\($0))" } ?? ""
    let why = d?.explanation.map { ": \($0)" } ?? ""
    return LlmError(.refusal, "The model declined this request\(cat)\(why)", retryable: false,
                    refusalCategory: d?.category, refusalExplanation: d?.explanation, usage: usage)
}

/// Map an HTTP error response onto an LlmError: 429 → rate limit (retryable), 5xx → status (retryable), else not.
func httpError(status: Int, body: Data) -> LlmError {
    let parsed = try? JSONDecoder().decode(WireErrorBody.self, from: body)
    let msg = parsed?.error?.message ?? String(decoding: body.prefix(500), as: UTF8.self)
    if status == 429 { return LlmError(.rateLimit, "Rate limited: \(msg)", status: 429, retryable: true) }
    return LlmError(.status, "API error \(status): \(msg)", status: status, retryable: status >= 500)
}

/// Map an in-stream `error` event.
func streamError(type: String?, message: String?) -> LlmError {
    let msg = message ?? "stream error"
    switch type {
    case "rate_limit_error": return LlmError(.rateLimit, "Rate limited: \(msg)", status: 429, retryable: true)
    case "overloaded_error": return LlmError(.status, "API error 529: \(msg)", status: 529, retryable: true)
    case "api_error": return LlmError(.status, "API error 500: \(msg)", status: 500, retryable: true)
    default: return LlmError(.status, "API error: \(msg)", retryable: false)
    }
}

// MARK: - Server-sent events

/// One server-sent event.
struct SSEEvent: Equatable {
    var event: String?
    var data: String
}

/// Incremental SSE parser: feed bytes, get complete events. Handles \n, \r\n and \r line endings, multi-line
/// `data:` fields, comments, and chunk boundaries anywhere (including inside a UTF-8 sequence).
struct SSEParser {
    private var line: [UInt8] = []
    private var lastWasCR = false
    private var event: String?
    private var data: [String] = []

    mutating func feed(_ bytes: some Sequence<UInt8>) -> [SSEEvent] {
        var out: [SSEEvent] = []
        for b in bytes {
            if b == 0x0A, lastWasCR { lastWasCR = false; continue }
            lastWasCR = (b == 0x0D)
            if b == 0x0A || b == 0x0D {
                if let ev = endLine() { out.append(ev) }
            } else {
                line.append(b)
            }
        }
        return out
    }

    /// Flush a final event not followed by a blank line.
    mutating func finish() -> SSEEvent? {
        if !line.isEmpty { _ = endLine() }
        return dispatch()
    }

    private mutating func endLine() -> SSEEvent? {
        let text = String(decoding: line, as: UTF8.self)
        line.removeAll(keepingCapacity: true)
        if text.isEmpty { return dispatch() }
        if text.hasPrefix(":") { return nil }
        let field: Substring, value: Substring
        if let colon = text.firstIndex(of: ":") {
            field = text[..<colon]
            var v = text[text.index(after: colon)...]
            if v.hasPrefix(" ") { v = v.dropFirst() }
            value = v
        } else {
            field = Substring(text); value = ""
        }
        switch field {
        case "event": event = String(value)
        case "data": data.append(String(value))
        default: break
        }
        return nil
    }

    private mutating func dispatch() -> SSEEvent? {
        defer { event = nil; data = [] }
        guard !data.isEmpty else { return nil }
        return SSEEvent(event: event, data: data.joined(separator: "\n"))
    }
}

/// Accumulates a streamed message from its events.
struct StreamAccumulator {
    struct Payload: Decodable {
        struct Message: Decodable { var model: String?; var usage: WireUsage? }
        struct Block: Decodable { var type: String; var text: String? }
        struct Delta: Decodable {
            var type: String?
            var text: String?
            var stop_reason: String?
            var stop_details: WireStopDetails?
        }
        struct ErrorInner: Decodable { var type: String?; var message: String? }
        var type: String
        var message: Message?
        var index: Int?
        var content_block: Block?
        var delta: Delta?
        var usage: WireUsage?
        var error: ErrorInner?
    }

    var model: String?
    var input = 0, output = 0, cacheRead = 0, cacheWrite = 0
    var iterations: [WireIteration]?
    var stopReason: String?
    var stopDetails: WireStopDetails?
    var finished = false
    private var blockTypes: [Int: String] = [:]

    enum Step { case none, text(String), error(LlmError) }

    mutating func apply(_ ev: SSEEvent) -> Step {
        guard let payload = try? JSONDecoder().decode(Payload.self, from: Data(ev.data.utf8)) else { return .none }
        switch payload.type {
        case "message_start":
            model = payload.message?.model ?? model
            merge(payload.message?.usage)
        case "content_block_start":
            let type = payload.content_block?.type ?? ""
            if let i = payload.index { blockTypes[i] = type }
            // Only text blocks are surfaced; thinking (empty by default) and fallback markers are ignored.
            if type == "text", let t = payload.content_block?.text, !t.isEmpty { return .text(t) }
        case "content_block_delta":
            if payload.delta?.type == "text_delta", let t = payload.delta?.text, !t.isEmpty,
               blockTypes[payload.index ?? -1] ?? "text" == "text" {
                return .text(t)
            }
        case "message_delta":
            if let s = payload.delta?.stop_reason { stopReason = s }
            if let d = payload.delta?.stop_details { stopDetails = d }
            merge(payload.usage)
        case "message_stop":
            finished = true
        case "error":
            return .error(streamError(type: payload.error?.type, message: payload.error?.message))
        default:
            break // ping, content_block_stop, unknown
        }
        return .none
    }

    /// Usage fields in `message_delta` are cumulative; take each when present.
    private mutating func merge(_ u: WireUsage?) {
        guard let u else { return }
        if let v = u.input_tokens { input = v }
        if let v = u.output_tokens { output = v }
        if let v = u.cache_read_input_tokens { cacheRead = v }
        if let v = u.cache_creation_input_tokens { cacheWrite = v }
        if let its = u.iterations { iterations = its }
    }

    func usage(requestedModel: String, latencyMs: Int) -> Usage {
        usageFrom(WireUsage(input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead,
                            cache_creation_input_tokens: cacheWrite, iterations: iterations),
                  servedModel: model ?? requestedModel, latencyMs: latencyMs)
    }
}
