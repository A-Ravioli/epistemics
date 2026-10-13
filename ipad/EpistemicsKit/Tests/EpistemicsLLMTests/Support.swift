import Foundation
import Synchronization
import EpistemicsCore
@testable import EpistemicsLLM

// MARK: - URLProtocol stub (no real network)

struct StubReply: Sendable {
    var status: Int = 200
    var headers: [String: String] = ["content-type": "application/json"]
    /// Delivered as separate chunks, to exercise SSE parsing across boundaries.
    var chunks: [Data]
    /// Fail the connection instead of replying.
    var failure: URLError.Code?
}

struct Captured: Sendable {
    var url: String
    var headers: [String: String]
    var body: Data
    /// The body as core's JSONValue (key order ignored in comparisons).
    var json: JSONValue { (try? JSONDecoder().decode(JSONValue.self, from: body)) ?? .null }
}

typealias StubHandler = @Sendable (_ request: Captured, _ n: Int) -> StubReply

/// Routes requests by host, so tests running in parallel each get their own handler.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    struct Route { var handler: StubHandler; var captured: [Captured] }
    static let routes = Mutex<[String: Route]>([:])

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var body = Data()
        if let b = request.httpBody { body = b } else if let s = request.httpBodyStream {
            s.open()
            var buf = [UInt8](repeating: 0, count: 65536)
            while s.hasBytesAvailable { let n = s.read(&buf, maxLength: buf.count); if n <= 0 { break }; body.append(buf, count: n) }
            s.close()
        }
        var headers: [String: String] = [:]
        for (k, v) in request.allHTTPHeaderFields ?? [:] { headers[k.lowercased()] = v }
        let cap = Captured(url: request.url?.absoluteString ?? "", headers: headers, body: body)
        let host = request.url?.host ?? ""
        let found: (StubHandler, Int)? = Self.routes.withLock { routes in
            guard var r = routes[host] else { return nil }
            r.captured.append(cap)
            routes[host] = r
            return (r.handler, r.captured.count)
        }
        guard let (handler, n) = found else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return
        }
        let reply = handler(cap, n)
        if let f = reply.failure { client?.urlProtocol(self, didFailWithError: URLError(f)); return }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        for c in reply.chunks { client?.urlProtocol(self, didLoad: c) }
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// A stubbed endpoint: a unique host, a URLSession routed to the stub, and the captured requests.
final class Stub: Sendable {
    let host: String
    let session: URLSession

    init(host: String = "stub-\(UUID().uuidString.lowercased()).test", _ handler: @escaping StubHandler) {
        self.host = host
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        session = URLSession(configuration: config)
        StubURLProtocol.routes.withLock { $0[host] = .init(handler: handler, captured: []) }
    }

    var baseURL: URL { URL(string: "https://\(host)")! }
    var captured: [Captured] { StubURLProtocol.routes.withLock { $0[host]?.captured ?? [] } }

    func provider(apiKey: String? = "k", models: ModelConfig = .defaults, onUsage: UsageSink? = nil,
                  fallbacks: Bool = true, extraHeaders: (@Sendable () async throws -> [String: String])? = nil,
                  baseURL: URL? = nil) -> AnthropicProvider {
        AnthropicProvider(options: .init(apiKey: apiKey, baseURL: baseURL ?? self.baseURL, models: models, onUsage: onUsage,
                                         retryDelay: .zero, serverSideFallbacks: fallbacks, extraHeaders: extraHeaders,
                                         session: session))
    }
}

// MARK: - Canned API responses

func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }

func encodeString(_ s: String) -> String { OrderedJSON.string(s).serialized() }

func messageReply(_ text: String, model: String = "claude-opus-5-5", stopReason: String = "end_turn", extra: String = "") -> StubReply {
    let body = """
    {"id":"msg_01","type":"message","role":"assistant","model":"\(model)",
     "content":[{"type":"thinking","thinking":"","signature":"sig"},{"type":"text","text":\(encodeString(text))}],
     "stop_reason":"\(stopReason)","stop_sequence":null\(extra),
     "usage":{"input_tokens":40,"output_tokens":12,"cache_read_input_tokens":1000,"cache_creation_input_tokens":200}}
    """
    return StubReply(chunks: [Data(body.utf8)])
}

func errorReply(_ status: Int, _ type: String, _ message: String) -> StubReply {
    StubReply(status: status, chunks: [Data(#"{"type":"error","error":{"type":"\#(type)","message":"\#(message)"}}"#.utf8)])
}

func sse(_ type: String, _ data: String) -> String { "event: \(type)\ndata: \(data)\n\n" }

/// A recorded-shape event stream: message_start, an (empty) thinking block, a text block with `deltas`, message_delta, message_stop.
func sseStream(_ deltas: [String], stopReason: String = "end_turn", model: String = "claude-opus-5-5", stopDetails: String? = nil) -> String {
    var parts = [
        sse("message_start", #"{"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","model":"\#(model)","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":30,"output_tokens":1,"cache_read_input_tokens":500,"cache_creation_input_tokens":0}}}"#),
        sse("content_block_start", #"{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}"#),
        sse("content_block_delta", #"{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"abc"}}"#),
        sse("content_block_stop", #"{"type":"content_block_stop","index":0}"#),
        "event: ping\ndata: {\"type\": \"ping\"}\n\n",
        sse("content_block_start", #"{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}"#),
    ]
    for d in deltas {
        parts.append(sse("content_block_delta", #"{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":\#(encodeString(d))}}"#))
    }
    parts.append(sse("content_block_stop", #"{"type":"content_block_stop","index":1}"#))
    let details = stopDetails.map { #","stop_details":\#($0)"# } ?? ""
    parts.append(sse("message_delta", #"{"type":"message_delta","delta":{"stop_reason":"\#(stopReason)","stop_sequence":null\#(details)},"usage":{"output_tokens":9}}"#))
    parts.append(sse("message_stop", #"{"type":"message_stop"}"#))
    return parts.joined()
}

/// Split a string into small byte chunks (boundaries fall mid-line and mid-UTF-8 sequence).
func chunked(_ s: String, size: Int = 7) -> [Data] {
    let bytes = Array(s.utf8)
    return stride(from: 0, to: bytes.count, by: size).map { Data(bytes[$0..<min($0 + size, bytes.count)]) }
}

func sseReply(_ body: String) -> StubReply {
    StubReply(headers: ["content-type": "text/event-stream"], chunks: chunked(body))
}

func collect(_ s: AsyncThrowingStream<StreamEvent, any Error>) async throws -> [StreamEvent] {
    var out: [StreamEvent] = []
    for try await e in s { out.append(e) }
    return out
}

final class Box<T: Sendable>: Sendable {
    let m: Mutex<[T]>
    init() { m = Mutex([]) }
    func append(_ x: T) { m.withLock { $0.append(x) } }
    var all: [T] { m.withLock { $0 } }
}

// MARK: - Fixtures (port of test/fixtures.ts; core types decode from pack JSON)

enum Fixtures {
    static let pretestReference = "Two events are independent when P(A and B) equals P(A) times P(B), so knowing one tells you nothing about the other."
    static let transferReference = "Disjoint events with nonzero probability are never independent because P(A and B) is zero while P(A)P(B) is positive."
    static let itemReference = "Independence means P(A|B) = P(A); the occurrence of B does not change the probability of A."

    static func conceptJSON(hint0: String = "Think about what knowing one event does to the odds of the other.") -> OrderedJSON {
        .object([
            ("id", .string("c-indep")), ("ordinal", .int(1)), ("name", .string("Independent events")),
            ("definition", .string("Two events are independent when the occurrence of one does not change the probability of the other.")),
            ("objectives", .array([
                .object([("id", .string("O1")), ("bloom", .string("understand")), ("text", .string("State the multiplication rule for independent events in your own words."))]),
                .object([("id", .string("O2")), ("bloom", .string("apply")), ("text", .string("Decide whether two given events are independent from their probabilities."))]),
            ])),
            ("misconceptions", .array([.object([
                ("tag", .string("conflates-independent-and-disjoint")),
                ("description", .string("Believes disjoint (mutually exclusive) events are independent.")),
                ("remedy", .string("Ask what P(A and B) is for disjoint events and compare with P(A)P(B).")),
            ])])),
            ("examples", .array([.object([("title", .string("Two coin flips")), ("body", .string("The first flip landing heads does not change the chance of heads on the second flip.")), ("domain", .string("games"))])])),
            ("spans", .array([.object([("chunkId", .string("ch1")), ("quote", .string("Events A and B are independent if P(A ∩ B) = P(A)P(B).")), ("page", .int(42)), ("heading", .string("Independence"))])])),
            ("script", .object([
                ("pretest", .object([("prompt", .string("Is drawing a red card and drawing a king from one deck independent?")), ("isomorph", .string("Is rolling a 6 and rolling an even number independent?")), ("reference", .string(pretestReference))])),
                ("guidingQuestions", .array([
                    .object([("question", .string("What does it mean for one event to give you information about another?")), ("expected", .string("that knowing one changes the probability of the other")), ("probesMisconception", .string("conflates-independent-and-disjoint"))]),
                    .object([("question", .string("If A and B cannot both happen, what is P(A and B)?")), ("expected", .string("zero"))]),
                ])),
                ("workedExample", .object([("problem", .string("Two fair dice: is \"first die is 3\" independent of \"sum is 7\"?")), ("steps", .array([.string("P(first is 3) = 1/6"), .string("P(sum is 7) = 6/36 = 1/6"), .string("P(both) = 1/36 = (1/6)(1/6), so yes")]))])),
                ("transfer", .object([("prompt", .string("Can two disjoint events with nonzero probability be independent?")), ("reference", .string(transferReference))])),
                ("hints", .array([.string(hint0), .string("Compare P(A and B) with the product P(A)P(B)."), .string("For the deck: P(red) = 1/2, P(king) = 4/52. Compute P(red king) and compare with the product; what do you notice?")])),
            ])),
            ("items", .array([.object([
                ("id", .string("i1")), ("conceptId", .string("c-indep")), ("type", .string("explain")), ("bloom", .string("understand")),
                ("prompt", .string("Explain what it means for two events to be independent.")),
                ("reference", .object([("answer", .string(itemReference)), ("notes", .string("Accept the multiplication rule or the conditional form."))])),
                ("rubric", .array([
                    .object([("id", .string("c1")), ("text", .string("States that independence means one event does not change the probability of the other."))]),
                    .object([("id", .string("c2")), ("text", .string("Gives the multiplication rule or the conditional-probability form."))]),
                ])),
                ("spans", .array([])), ("generatorVersion", .string("hand-authored")), ("hash", .string("h1")),
            ])])),
        ])
    }

    static let secondConceptJSON: OrderedJSON = .object([
        ("id", .string("c-cond")), ("ordinal", .int(2)), ("name", .string("Conditional probability")),
        ("definition", .string("The probability of A given that B has occurred, P(A|B) = P(A and B) / P(B).")),
        ("objectives", .array([.object([("id", .string("O1")), ("bloom", .string("understand")), ("text", .string("State the definition of conditional probability."))])])),
        ("misconceptions", .array([])), ("examples", .array([])),
        ("spans", .array([.object([("chunkId", .string("ch2")), ("quote", .string("P(A|B) = P(A ∩ B)/P(B)."))])])),
        ("script", .object([
            ("pretest", .object([("prompt", .string("What is P(A|B)?")), ("isomorph", .string("What is P(B|A)?")), ("reference", .string("P(A|B) is P(A and B) divided by P(B), the share of B-outcomes that are also A-outcomes."))])),
            ("guidingQuestions", .array([.object([("question", .string("What happens to the sample space when we learn B occurred?")), ("expected", .string("it shrinks to B"))])])),
            ("workedExample", .object([("problem", .string("P(king | face card)")), ("steps", .array([.string("P(king and face) = 4/52"), .string("P(face) = 12/52"), .string("ratio = 1/3")]))])),
            ("transfer", .object([("prompt", .string("Why is P(A|B) undefined when P(B) = 0?")), ("reference", .string("Because the definition divides by P(B) and division by zero is undefined; there is no restricted sample space to condition on."))])),
            ("hints", .array([.string("Restrict the sample space."), .string("Divide the joint by the marginal."), .string("P(king and face) = 4/52 and P(face) = 12/52; take the ratio and simplify.")])),
        ])),
        ("items", .array([])),
    ])

    static func decode<T: Decodable>(_ j: OrderedJSON, as: T.Type) -> T {
        try! JSONDecoder().decode(T.self, from: j.data)
    }

    static func concept() -> Concept { decode(conceptJSON(), as: Concept.self) }

    static func lesson(hint0: String? = nil, spans: Bool = true) -> Lesson {
        var concepts = [hint0.map { conceptJSON(hint0: $0) } ?? conceptJSON(), secondConceptJSON]
        if !spans {
            concepts = concepts.map { c in
                guard case .object(let pairs) = c else { return c }
                return .object(pairs.map { $0.0 == "spans" ? ("spans", .array([])) : $0 })
            }
        }
        return decode(.object([
            ("id", .string("L1")), ("ordinal", .int(1)), ("title", .string("Independence and conditioning")),
            ("summary", .string("When does one event tell you about another?")), ("concepts", .array(concepts)),
        ]), as: Lesson.self)
    }

    static func observerConcept() -> ObserverConcept { ObserverConcept(concept()) }
}
