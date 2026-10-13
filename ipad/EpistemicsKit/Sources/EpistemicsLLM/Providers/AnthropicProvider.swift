import Foundation
import EpistemicsCore

/// Anthropic Messages API over raw HTTP (URLSession).
///
/// - Key: `apiKey` sends `x-api-key`. Leave it nil with a proxy `baseURL` that injects the key (the Supabase edge
///   function); `extraHeaders` can attach that proxy's bearer token per request.
/// - Cache breakpoints: system blocks and messages flagged `cache` get `cache_control` (1h TTL by default, max 4).
/// - Mid-conversation control messages are sent as `role: "system"` on models that support them and folded into
///   the preceding user message elsewhere.
/// - Thinking is left at the model default (adaptive, always on); `output_config.effort` is always sent. No temperature.
/// - Refusals (`stop_reason: "refusal"`) throw `LlmError(.refusal)`. Opus 5.5 / Sonnet 5.5 requests carry server-side
///   fallbacks by default (`fallbacks: "default"` + the `server-side-fallback-2026-07-01` beta).
/// - One retry with backoff on 429 / 5xx / connection errors; never after a streamed delta. Task cancellation aborts.
public struct AnthropicProvider: LLMProvider {
    public struct Options: Sendable {
        public var apiKey: String?
        /// The API root; `/v1/messages` is appended. Default `https://api.anthropic.com`.
        public var baseURL: URL
        public var models: ModelConfig
        public var onUsage: UsageSink?
        /// Delay before the single retry. Default 1.5 s.
        public var retryDelay: Duration
        /// TTL for flagged cache breakpoints. Default 1 hour (a study session).
        public var cacheTTL: CacheTTL
        /// Request timeout in seconds. Default 600.
        public var timeout: TimeInterval
        /// Send `fallbacks: "default"` on Opus 5.5 / Sonnet 5.5. Default true.
        public var serverSideFallbacks: Bool
        /// Extra headers per request (e.g. `authorization: Bearer <session token>` for the edge function).
        public var extraHeaders: (@Sendable () async throws -> [String: String])?
        public var session: URLSession

        public init(apiKey: String? = nil, baseURL: URL = URL(string: "https://api.anthropic.com")!,
                    models: ModelConfig = .defaults, onUsage: UsageSink? = nil, retryDelay: Duration = .milliseconds(1500),
                    cacheTTL: CacheTTL = .oneHour, timeout: TimeInterval = 600, serverSideFallbacks: Bool = true,
                    extraHeaders: (@Sendable () async throws -> [String: String])? = nil, session: URLSession = .shared) {
            self.apiKey = apiKey; self.baseURL = baseURL; self.models = models; self.onUsage = onUsage
            self.retryDelay = retryDelay; self.cacheTTL = cacheTTL; self.timeout = timeout
            self.serverSideFallbacks = serverSideFallbacks; self.extraHeaders = extraHeaders; self.session = session
        }
    }

    public let name = "anthropic"
    public let options: Options

    public init(options: Options = Options()) { self.options = options }
    public init(apiKey: String?, baseURL: URL = URL(string: "https://api.anthropic.com")!, models: ModelConfig = .defaults,
                onUsage: UsageSink? = nil) {
        self.init(options: Options(apiKey: apiKey, baseURL: baseURL, models: models, onUsage: onUsage))
    }

    /// The model a role will use with this provider's configuration.
    public func model(for role: LlmRole) -> String { options.models[role] }

    // MARK: Request plumbing

    var endpoint: URL {
        var s = options.baseURL.absoluteString
        while s.hasSuffix("/") { s.removeLast() }
        return URL(string: s + "/v1/messages")!
    }

    func body(_ req: LlmRequest, schema: JSONSchema?, stream: Bool) -> AnthropicBody {
        buildAnthropicBody(req, models: options.models, schema: schema, stream: stream, ttl: options.cacheTTL,
                           serverSideFallbacks: options.serverSideFallbacks)
    }

    func urlRequest(_ body: AnthropicBody, stream: Bool) async throws -> URLRequest {
        var r = URLRequest(url: endpoint)
        r.httpMethod = "POST"
        r.timeoutInterval = options.timeout
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        r.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        if stream { r.setValue("text/event-stream", forHTTPHeaderField: "accept") }
        if let key = options.apiKey { r.setValue(key, forHTTPHeaderField: "x-api-key") }
        if body.fallbacks { r.setValue(fallbackBeta, forHTTPHeaderField: "anthropic-beta") }
        if let extra = options.extraHeaders {
            for (k, v) in try await extra() { r.setValue(v, forHTTPHeaderField: k) }
        }
        r.httpBody = body.json.data
        return r
    }

    private func emit(_ req: LlmRequest, _ usage: Usage) {
        options.onUsage?(UsageCall(usage, req))
    }

    private static func ms(since start: ContinuousClock.Instant) -> Int {
        let d = ContinuousClock.now - start
        return Int(d.components.seconds * 1000 + d.components.attoseconds / 1_000_000_000_000_000)
    }

    /// Run `fn`, retrying once after `retryDelay` on a retryable error.
    private func withRetry<T: Sendable>(_ fn: () async throws -> T) async throws -> T {
        do {
            return try await fn()
        } catch {
            let err = LlmError.classify(error)
            if !err.retryable || Task.isCancelled { throw err }
            do { try await Task.sleep(for: options.retryDelay) } catch { throw LlmError.classify(error) }
            do { return try await fn() } catch { throw LlmError.classify(error) }
        }
    }

    /// One non-streaming call: returns the decoded message.
    private func send(_ body: AnthropicBody) async throws -> WireMessageResponse {
        try Task.checkCancellation()
        let request = try await urlRequest(body, stream: false)
        let (data, response) = try await options.session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw httpError(status: status, body: data) }
        do {
            return try JSONDecoder().decode(WireMessageResponse.self, from: data)
        } catch {
            throw LlmError(.status, "Unreadable API response: \(error)", status: status, retryable: false)
        }
    }

    // MARK: LLMProvider

    public func text(_ req: LlmRequest) async throws -> TextResult {
        let body = body(req, schema: nil, stream: false)
        let started = ContinuousClock.now
        let msg = try await withRetry { try await send(body) }
        let usage = usageFrom(msg.usage, servedModel: msg.model ?? body.model, latencyMs: Self.ms(since: started))
        emit(req, usage)
        if msg.stop_reason == "refusal" { throw refusalError(msg.stop_details, usage: usage) }
        let text = msg.content.filter { $0.type == "text" }.compactMap(\.text).joined()
        return TextResult(text: text, usage: usage, stopReason: msg.stop_reason)
    }

    public func structured<T: Decodable & Sendable>(_ req: LlmRequest, schema: JSONSchema, name: String) async throws -> Structured<T> {
        let body = body(req, schema: schema, stream: false)
        var spent = Usage(model: body.model)

        func once() async throws -> T {
            let started = ContinuousClock.now
            let msg = try await withRetry { try await send(body) }
            let usage = usageFrom(msg.usage, servedModel: msg.model ?? body.model, latencyMs: Self.ms(since: started))
            emit(req, usage)
            spent = spent + usage
            if msg.stop_reason == "refusal" { throw refusalError(msg.stop_details, usage: usage) }
            let text = msg.content.filter { $0.type == "text" }.compactMap(\.text).joined()
            do {
                return try JSONDecoder().decode(T.self, from: Data(text.utf8))
            } catch {
                throw LlmError(.parse, "Structured output did not match \(name) (stop_reason=\(msg.stop_reason ?? "nil")): \(error)",
                               retryable: false)
            }
        }

        let value: T
        do {
            value = try await once()
        } catch {
            let err = LlmError.classify(error)
            if err.kind != .parse || Task.isCancelled { throw err }
            value = try await once() // one retry on a parse failure
        }
        return Structured(value: value, usage: spent)
    }

    public func stream(_ req: LlmRequest) -> AsyncThrowingStream<StreamEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await runStream(req, continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: LlmError.classify(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func runStream(_ req: LlmRequest, _ continuation: AsyncThrowingStream<StreamEvent, any Error>.Continuation) async throws {
        let body = body(req, schema: nil, stream: true)
        var attempt = 0
        var yielded = false
        while true {
            let started = ContinuousClock.now
            do {
                try Task.checkCancellation()
                let request = try await urlRequest(body, stream: true)
                let (bytes, response) = try await options.session.bytes(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status) else {
                    var data = Data()
                    for try await b in bytes { data.append(b) }
                    throw httpError(status: status, body: data)
                }
                var parser = SSEParser()
                var acc = StreamAccumulator()
                var chunk: [UInt8] = []
                chunk.reserveCapacity(512)

                func handle(_ events: [SSEEvent]) throws {
                    for ev in events {
                        switch acc.apply(ev) {
                        case .none: break
                        case .text(let t):
                            yielded = true
                            continuation.yield(.delta(t))
                        case .error(let e): throw e
                        }
                    }
                }

                for try await b in bytes {
                    chunk.append(b)
                    // Parse at line ends so deltas reach the UI as they arrive.
                    if b == 0x0A || chunk.count >= 4096 {
                        try handle(parser.feed(chunk))
                        chunk.removeAll(keepingCapacity: true)
                    }
                }
                try handle(parser.feed(chunk))
                if let last = parser.finish() { try handle([last]) }
                try Task.checkCancellation()
                guard acc.finished else {
                    throw LlmError(.connection, "Stream ended before message_stop", retryable: true)
                }
                let usage = acc.usage(requestedModel: body.model, latencyMs: Self.ms(since: started))
                emit(req, usage)
                if acc.stopReason == "refusal" { throw refusalError(acc.stopDetails, usage: usage) }
                continuation.yield(.done(usage, stopReason: acc.stopReason))
                return
            } catch {
                let err = LlmError.classify(error)
                if err.retryable, attempt == 0, !yielded, !Task.isCancelled {
                    attempt += 1
                    try await Task.sleep(for: options.retryDelay)
                    continue
                }
                throw err
            }
        }
    }
}
