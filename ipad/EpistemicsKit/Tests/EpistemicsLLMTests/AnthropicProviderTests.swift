import Foundation
import Testing
import EpistemicsCore
@testable import EpistemicsLLM

private let tutorReq = LlmRequest(
    role: .tutor,
    system: [CacheableBlock("charter text", cache: true), CacheableBlock("curriculum context", cache: true)],
    messages: [.user("learner model", cache: true), .assistant("What do you think?"), .user("not sure"), .system("phase=DEVELOP hint_level=1")],
    effort: .medium,
    metadata: RequestMetadata(sessionId: "s1", courseId: "c1"))

private struct Flag: Decodable, Sendable, Equatable { var a: Int }
private let flagSchema = JSONSchema.object(["a": .integer])

@Suite("Anthropic provider: request shape")
struct AnthropicRequestTests {
    @Test func textBuildsTheExactBody() async throws {
        let seen = Box<UsageCall>()
        let stub = Stub { _, _ in messageReply("Why do you say that?") }
        let p = stub.provider(onUsage: { seen.append($0) })
        let r = try await p.text(tutorReq)
        #expect(r.text == "Why do you say that?")
        #expect(r.usage.inputTokens == 40 && r.usage.outputTokens == 12 && r.usage.cacheRead == 1000 && r.usage.cacheWrite == 200)
        #expect(r.usage.model == "claude-opus-5-5")
        #expect(abs(r.usage.costUsd - (40 * 4 + 12 * 20 + 1000 * 0.2 + 200 * 8) / 1e6) < 1e-12)
        #expect(seen.all.first?.role == .tutor && seen.all.first?.sessionId == "s1" && seen.all.first?.courseId == "c1")

        let c = stub.captured[0]
        #expect(c.url == "https://\(stub.host)/v1/messages")
        #expect(c.headers["x-api-key"] == "k")
        #expect(c.headers["anthropic-version"] == "2023-06-01")
        #expect(c.headers["content-type"] == "application/json")
        #expect(c.headers["anthropic-beta"] == "server-side-fallback-2026-07-01")
        #expect(c.json == json("""
        {"model":"claude-opus-5-5","max_tokens":4096,
         "system":[{"type":"text","text":"charter text","cache_control":{"type":"ephemeral","ttl":"1h"}},
                   {"type":"text","text":"curriculum context","cache_control":{"type":"ephemeral","ttl":"1h"}}],
         "messages":[{"role":"user","content":[{"type":"text","text":"learner model","cache_control":{"type":"ephemeral","ttl":"1h"}}]},
                     {"role":"assistant","content":"What do you think?"},
                     {"role":"user","content":"not sure"},
                     {"role":"system","content":"phase=DEVELOP hint_level=1"}],
         "output_config":{"effort":"medium"},
         "fallbacks":"default"}
        """))
        // no temperature, no thinking config, no stream flag
        let body = String(decoding: c.body, as: UTF8.self)
        #expect(!body.contains("temperature") && !body.contains("thinking") && !body.contains("\"stream\""))
    }

    @Test func bodyBytesAreStableAndOrdered() {
        let a = buildAnthropicBody(tutorReq, models: .defaults, schema: nil, stream: false).json.serialized()
        let b = buildAnthropicBody(tutorReq, models: .defaults, schema: nil, stream: false).json.serialized()
        #expect(a == b)
        #expect(a.hasPrefix(#"{"model":"claude-opus-5-5","max_tokens":4096,"system":["#))
    }

    @Test func fallbacksOnlyOnOpusAndSonnet55() async throws {
        for (model, expected) in [("claude-opus-5-5", true), ("claude-sonnet-5-5", true), ("claude-haiku-5-5", false), ("claude-opus-5", false)] {
            let stub = Stub { _, _ in messageReply("x", model: model) }
            var models = ModelConfig.defaults
            models.tutor = model
            _ = try await stub.provider(models: models).text(tutorReq)
            let c = stub.captured[0]
            #expect((c.headers["anthropic-beta"] != nil) == expected, "\(model)")
            #expect((c.json["fallbacks"]?.stringValue == "default") == expected, "\(model)")
        }
        // option off
        let stub = Stub { _, _ in messageReply("x") }
        _ = try await stub.provider(fallbacks: false).text(tutorReq)
        #expect(stub.captured[0].headers["anthropic-beta"] == nil)
        #expect(stub.captured[0].json["fallbacks"] == nil)
    }

    @Test func foldsControlMessagesOnModelsWithoutMidConversationSystem() async throws {
        let stub = Stub { _, _ in messageReply("ok", model: "claude-sonnet-5") }
        var models = ModelConfig.defaults
        models.tutor = "claude-sonnet-5"
        _ = try await stub.provider(models: models).text(tutorReq)
        let msgs = stub.captured[0].json["messages"]!.arrayValue!
        #expect(msgs.count == 3)
        #expect(msgs[2] == json(#"{"role":"user","content":"not sure\n\n[control] phase=DEVELOP hint_level=1"}"#))
    }

    @Test func midSystemSupportAndFoldingEdgeCases() {
        #expect(supportsMidSystem("claude-opus-5-5"))
        #expect(supportsMidSystem("claude-sonnet-5-5"))
        #expect(supportsMidSystem("claude-haiku-5-5"))
        #expect(supportsMidSystem("claude-opus-5"))
        #expect(supportsMidSystem("claude-fable-5-1"))
        #expect(!supportsMidSystem("claude-sonnet-5"))
        #expect(!supportsMidSystem("claude-haiku-4-5"))
        // a control after an assistant turn cannot be a system message: it becomes a user message
        let m = toAnthropicMessages([.user("a"), .assistant("b"), .system("ctl")], midSystem: true)
        #expect(m[2] == WireMessage(role: "user", content: .text("[control] ctl")))
        // a control after a cached user message appends a text block after the breakpoint
        let m2 = toAnthropicMessages([.user("a", cache: true), .system("ctl")], midSystem: false)
        #expect(m2 == [WireMessage(role: "user", content: .blocks([WireBlock(kind: .text("a"), cache: true), WireBlock(kind: .text("[control] ctl"))]))])
        // consecutive controls merge
        let m3 = toAnthropicMessages([.user("a"), .system("x"), .system("y")], midSystem: true)
        #expect(m3 == [WireMessage(role: "user", content: .text("a")), WireMessage(role: "system", content: .text("x\n\ny"))])
        // a control followed by a user turn cannot stay a system message (API placement rule): folded
        let m4 = toAnthropicMessages([.user("a"), .system("x"), .user("b")], midSystem: true)
        #expect(m4 == [WireMessage(role: "user", content: .text("a\n\n[control] x")), WireMessage(role: "user", content: .text("b"))])
        // a control first in the list becomes a user message
        let m5 = toAnthropicMessages([.system("x")], midSystem: true)
        #expect(m5 == [WireMessage(role: "user", content: .text("[control] x"))])
    }

    @Test func capsCacheBreakpointsAtFourDroppingTheEarliest() {
        let req = LlmRequest(role: .tutor,
                             system: [CacheableBlock("a", cache: true), CacheableBlock("b", cache: true), CacheableBlock("c", cache: true)],
                             messages: [.user("d", cache: true), .assistant("e"), .user("f", cache: true)])
        let body = buildAnthropicBody(req, models: .defaults, schema: nil, stream: false).json.jsonValue
        let system = body["system"]!.arrayValue!
        #expect(system[0]["cache_control"] == nil)
        #expect(system[1]["cache_control"] != nil)
        #expect(system[2]["cache_control"] != nil)
        let marked = body["messages"]!.arrayValue!.filter { $0["content"]?.arrayValue != nil }.count
        #expect(marked == 2)
        var s: [WireBlock] = [], ms: [WireMessage] = []
        capBreakpoints(system: &s, messages: &ms) // no-op
        #expect(s.isEmpty && ms.isEmpty)
    }

    @Test func imagesPrecedeTextAsBase64Blocks() {
        let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] + Array(repeating: UInt8(7), count: 100))
        let req = LlmRequest(role: .reader, system: [CacheableBlock("reader prompt", cache: true)],
                             messages: [.user("read this", images: [.png(png)])])
        let body = buildAnthropicBody(req, models: .defaults, schema: nil, stream: false).json
        let b64 = png.base64EncodedString()
        #expect(!b64.contains("\n"))
        #expect(body.jsonValue["messages"] == json("""
        [{"role":"user","content":[
          {"type":"image","source":{"type":"base64","media_type":"image/png","data":"\(b64)"}},
          {"type":"text","text":"read this"}]}]
        """))
        #expect(body["model"] == .string("claude-sonnet-5-5"))
        #expect(body.jsonValue["output_config"] == json(#"{"effort":"medium"}"#))
    }

    @Test func proxyModeSendsNoKeyAndAppendsThePath() async throws {
        let stub = Stub { _, _ in messageReply("x") }
        let p = stub.provider(apiKey: nil, extraHeaders: { ["authorization": "Bearer session-token"] },
                              baseURL: URL(string: "https://\(stub.host)/functions/v1/anthropic-proxy/")!)
        _ = try await p.text(tutorReq)
        let c = stub.captured[0]
        #expect(c.url == "https://\(stub.host)/functions/v1/anthropic-proxy/v1/messages")
        #expect(c.headers["x-api-key"] == nil)
        #expect(c.headers["authorization"] == "Bearer session-token")
    }

    @Test func defaultEndpointIsTheAnthropicAPI() {
        let p = AnthropicProvider(apiKey: "k")
        #expect(p.endpoint.absoluteString == "https://api.anthropic.com/v1/messages")
    }

    @Test func perRoleEffortsAndModels() {
        let roles: [(LlmRole, String, String)] = [
            (.tutor, "claude-opus-5-5", "medium"), (.observer, "claude-haiku-5-5", "low"), (.grader, "claude-sonnet-5-5", "medium"),
            (.student, "claude-sonnet-5-5", "low"), (.leakcheck, "claude-haiku-5-5", "low"), (.reader, "claude-sonnet-5-5", "medium"),
            (.architect, "claude-opus-5-5", "high"), (.itemwriter, "claude-sonnet-5-5", "medium"),
        ]
        for (role, model, effort) in roles {
            let body = buildAnthropicBody(LlmRequest(role: role, messages: [.user("x")]), models: .defaults, schema: nil, stream: false).json
            #expect(body["model"] == .string(model))
            #expect(body["output_config"]?["effort"] == .string(effort))
        }
    }
}

@Suite("Anthropic provider: structured()")
struct AnthropicStructuredTests {
    static let value = #"{"attemptMade":true,"gaveUp":false,"offTopic":false,"objectiveProgress":[{"objectiveId":"O1","status":"partial"}],"misconceptionTags":[],"keyIdeaStated":false,"priorKnowledgeElicited":false,"stuck":false,"unsourcedClaims":[]}"#

    @Test func sendsTheSchemaAndDecodesTheValue() async throws {
        let stub = Stub { _, _ in messageReply(Self.value, model: "claude-haiku-5-5") }
        let req = LlmRequest(role: .observer, system: [CacheableBlock("observer prompt", cache: true)], messages: [.user("{}")], maxTokens: 1024, effort: .low)
        let r: Structured<ObserverResult> = try await stub.provider().structured(req, schema: Observer.schema, name: "ObserverResult")
        #expect(r.value.attemptMade && r.value.objectiveProgress == [.init(objectiveId: "O1", status: .partial)])
        #expect(r.usage.inputTokens == 40)
        let b = stub.captured[0].json
        #expect(b["model"]?.stringValue == "claude-haiku-5-5")
        #expect(b["max_tokens"]?.intValue == 1024)
        #expect(b["output_config"]?["effort"]?.stringValue == "low")
        #expect(b["output_config"]?["format"]?["type"]?.stringValue == "json_schema")
        let schema = b["output_config"]!["format"]!["schema"]!
        #expect(schema["type"]?.stringValue == "object")
        #expect(schema["additionalProperties"] == .bool(false))
        #expect(schema["required"]?.arrayValue?.contains(.string("attemptMade")) == true)
        #expect(schema["properties"]?["objectiveProgress"]?["items"]?["additionalProperties"] == .bool(false))
        #expect(b["stream"] == nil && b["thinking"] == nil && b["fallbacks"] == nil)
        #expect(stub.captured[0].headers["anthropic-beta"] == nil) // haiku: no fallbacks
    }

    @Test func schemaHasNoNumericConstraints() {
        let s = String(decoding: Grader.schema.json.data, as: UTF8.self) + Reader.schema.json.serialized() + Observer.inkSchema.json.serialized()
        for banned in ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"] { #expect(!s.contains(banned)) }
    }

    @Test func defaultsStructuredMaxTokens() async throws {
        let stub = Stub { _, _ in messageReply(#"{"a":1}"#) }
        let p = stub.provider()
        let _: Structured<Flag> = try await p.structured(LlmRequest(role: .grader, messages: [.user("x")]), schema: flagSchema, name: "T")
        let _: Structured<Flag> = try await p.structured(LlmRequest(role: .architect, messages: [.user("x")]), schema: flagSchema, name: "T")
        #expect(stub.captured[0].json["max_tokens"]?.intValue == 2048)
        #expect(stub.captured[0].json["model"]?.stringValue == "claude-sonnet-5-5")
        #expect(stub.captured[1].json["max_tokens"]?.intValue == 16000)
        #expect(stub.captured[1].json["system"] == nil)
    }

    @Test func retriesOnceOnAParseFailureAndBillsBothCalls() async throws {
        let stub = Stub { _, n in messageReply(n == 1 ? #"{"a":"wrong"}"# : #"{"a":2}"#) }
        let r: Structured<Flag> = try await stub.provider().structured(LlmRequest(role: .grader, messages: [.user("x")]), schema: flagSchema, name: "T")
        #expect(r.value == Flag(a: 2))
        #expect(stub.captured.count == 2)
        #expect(r.usage.inputTokens == 80)

        let bad = Stub { _, _ in messageReply("not json") }
        await #expect { let _: Structured<Flag> = try await bad.provider().structured(LlmRequest(role: .grader, messages: [.user("x")]), schema: flagSchema, name: "T") }
            throws: { ($0 as? LlmError)?.kind == .parse }
        #expect(bad.captured.count == 2)
    }

    @Test func surfacesARefusal() async throws {
        let stub = Stub { _, _ in
            messageReply("", stopReason: "refusal", extra: #","stop_details":{"type":"refusal","category":"cyber","explanation":"no"}"#)
        }
        let p = stub.provider()
        do {
            _ = try await p.text(tutorReq)
            Issue.record("expected a refusal")
        } catch let e as LlmError {
            #expect(e.kind == .refusal && e.refusalCategory == "cyber" && e.refusalExplanation == "no" && !e.retryable)
            #expect(e.message.contains("declined"))
            #expect(e.usage?.inputTokens == 40)
        }
        await #expect { let _: Structured<Flag> = try await p.structured(tutorReq, schema: flagSchema, name: "T") }
            throws: { ($0 as? LlmError)?.kind == .refusal }
        #expect(stub.captured.count == 2) // a refusal is not retried
    }

    @Test func pricesFallbackIterations() async throws {
        let extra = #","usage":{"input_tokens":10,"output_tokens":5,"iterations":[{"type":"message","model":"claude-opus-5-5","input_tokens":100,"output_tokens":0},{"type":"fallback_message","model":"claude-opus-4-8","input_tokens":100,"output_tokens":50}]}"#
        let body = #"{"model":"claude-opus-4-8","content":[{"type":"fallback","from":{"model":"claude-opus-5-5"},"to":{"model":"claude-opus-4-8"}},{"type":"text","text":"hi"}],"stop_reason":"end_turn""# + extra + "}"
        let stub = Stub { _, _ in StubReply(chunks: [Data(body.utf8)]) }
        let r = try await stub.provider().text(tutorReq)
        #expect(r.text == "hi")
        #expect(r.usage.model == "claude-opus-4-8")
        #expect(r.usage.inputTokens == 200 && r.usage.outputTokens == 50)
        #expect(abs(r.usage.costUsd - (100 * 4 + 100 * 5 + 50 * 25) / 1e6) < 1e-12)
    }
}

@Suite("Anthropic provider: stream()")
struct AnthropicStreamTests {
    @Test func yieldsTextDeltasThenDoneWithUsage() async throws {
        let seen = Box<UsageCall>()
        let stub = Stub { _, _ in sseReply(sseStream(["Why ", "do you ", "say that? ", "é→ü"])) }
        let events = try await collect(stub.provider(onUsage: { seen.append($0) }).stream(tutorReq))
        let text = events.compactMap { if case .delta(let t) = $0 { t } else { nil } }.joined()
        #expect(text == "Why do you say that? é→ü")
        guard case .done(let usage, let stop)? = events.last else { Issue.record("no done"); return }
        #expect(usage.inputTokens == 30 && usage.outputTokens == 9 && usage.cacheRead == 500 && usage.model == "claude-opus-5-5")
        #expect(stop == "end_turn")
        #expect(stub.captured[0].json["stream"] == .bool(true))
        #expect(stub.captured[0].headers["accept"] == "text/event-stream")
        #expect(stub.captured[0].json["system"]?.arrayValue?.first?["cache_control"] == json(#"{"type":"ephemeral","ttl":"1h"}"#))
        #expect(seen.all.count == 1)
    }

    @Test func ignoresFallbackBlocksAndKeepsThePartial() async throws {
        let body = sseStream(["partial "]).replacingOccurrences(of: sse("message_delta", #"{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":9}}"#), with:
            sse("content_block_start", #"{"type":"content_block_start","index":2,"content_block":{"type":"fallback","from":{"model":"claude-opus-5-5"},"to":{"model":"claude-opus-4-8"}}}"#)
            + sse("content_block_stop", #"{"type":"content_block_stop","index":2}"#)
            + sse("content_block_start", #"{"type":"content_block_start","index":3,"content_block":{"type":"text","text":""}}"#)
            + sse("content_block_delta", #"{"type":"content_block_delta","index":3,"delta":{"type":"text_delta","text":"continued"}}"#)
            + sse("message_delta", #"{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":9}}"#))
        let stub = Stub { _, _ in sseReply(body) }
        let r = try await stub.provider().streamText(tutorReq)
        #expect(r.text == "partial continued")
    }

    @Test func throwsOnARefusalStopReason() async throws {
        let stub = Stub { _, _ in sseReply(sseStream(["partial"], stopReason: "refusal", stopDetails: #"{"type":"refusal","category":"bio","explanation":null}"#)) }
        do {
            _ = try await collect(stub.provider().stream(tutorReq))
            Issue.record("expected refusal")
        } catch let e as LlmError {
            #expect(e.kind == .refusal && e.refusalCategory == "bio" && e.message.contains("declined"))
        }
    }

    @Test func retriesOnceOnARateLimitBeforeAnyDelta() async throws {
        let stub = Stub { _, n in n == 1 ? errorReply(429, "rate_limit_error", "slow down") : sseReply(sseStream(["ok"])) }
        let events = try await collect(stub.provider().stream(tutorReq))
        #expect(stub.captured.count == 2)
        #expect(events.count == 2)

        let always = Stub { _, _ in errorReply(429, "rate_limit_error", "slow down") }
        do {
            _ = try await collect(always.provider().stream(tutorReq))
            Issue.record("expected error")
        } catch let e as LlmError {
            #expect(e.kind == .rateLimit && e.message.contains("Rate limited") && e.status == 429)
        }
        #expect(always.captured.count == 2)
    }

    @Test func anInStreamErrorAfterADeltaIsNotRetried() async throws {
        // everything up to and including the first text delta, then an overloaded error
        let full = sseStream(["half"])
        let cut = full.range(of: "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}")!.lowerBound
        let broken = String(full[..<cut]) + sse("error", #"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#)
        let stub = Stub { _, _ in sseReply(broken) }
        var deltas = 0
        do {
            for try await e in stub.provider().stream(tutorReq) { if case .delta = e { deltas += 1 } }
            Issue.record("expected error")
        } catch let e as LlmError {
            #expect(e.status == 529 && e.retryable)
        }
        #expect(deltas >= 1)
        #expect(stub.captured.count == 1)
    }

    @Test func aTruncatedStreamIsAConnectionError() async throws {
        let cut = sseStream(["a"]).components(separatedBy: "event: message_delta")[0]
        let stub = Stub { _, _ in sseReply(cut) }
        await #expect { _ = try await collect(stub.provider().stream(tutorReq)) } throws: { ($0 as? LlmError)?.kind == .connection }
        #expect(stub.captured.count == 1) // a delta had been yielded: no retry
    }

    @Test func cancellationAborts() async throws {
        let stub = Stub { _, _ in sseReply(sseStream(Array(repeating: "word ", count: 200))) }
        let p = stub.provider()
        let task = Task { () -> Int in
            var n = 0
            for try await e in p.stream(tutorReq) { if case .delta = e { n += 1; if n == 3 { withUnsafeCurrentTask { $0?.cancel() } } } }
            return n
        }
        let result = await task.result
        switch result {
        case .success(let n): #expect(n < 200)
        case .failure(let e): #expect((e as? LlmError)?.kind == .aborted || e is CancellationError)
        }
    }
}

@Suite("Anthropic provider: errors and retries")
struct AnthropicErrorTests {
    let req = LlmRequest(role: .grader, messages: [.user("x")])

    @Test func retriesOnceOn429And5xxNotOn400() async throws {
        let a = Stub { _, n in n == 1 ? errorReply(429, "rate_limit_error", "slow") : messageReply("ok") }
        #expect(try await a.provider().text(req).text == "ok")
        #expect(a.captured.count == 2)

        let b = Stub { _, n in n == 1 ? errorReply(529, "overloaded_error", "busy") : messageReply("ok") }
        #expect(try await b.provider().text(req).text == "ok")
        #expect(b.captured.count == 2)

        let c = Stub { _, _ in errorReply(400, "invalid_request_error", "bad") }
        do {
            _ = try await c.provider().text(req)
            Issue.record("expected error")
        } catch let e as LlmError {
            #expect(e.kind == .status && e.status == 400 && !e.retryable && e.message.contains("bad"))
        }
        #expect(c.captured.count == 1)
    }

    @Test func retriesOnceOnAConnectionErrorThenGivesUp() async throws {
        let s = Stub { _, _ in StubReply(chunks: [], failure: .networkConnectionLost) }
        await #expect { _ = try await s.provider().text(req) } throws: { ($0 as? LlmError)?.kind == .connection }
        #expect(s.captured.count == 2)
    }
}

@Suite("SSE parser")
struct SSEParserTests {
    @Test func parsesAcrossArbitraryChunkBoundariesAndLineEndings() {
        let raw = "event: a\r\ndata: {\"x\":\"é\"}\r\n\r\n: comment\n\nevent: b\ndata: line1\ndata: line2\n\ndata: last"
        for size in [1, 2, 3, 5, 64] {
            var p = SSEParser()
            var events: [SSEEvent] = []
            for c in chunked(raw, size: size) { events += p.feed(c) }
            if let e = p.finish() { events.append(e) }
            #expect(events == [SSEEvent(event: "a", data: #"{"x":"é"}"#), SSEEvent(event: "b", data: "line1\nline2"), SSEEvent(event: nil, data: "last")], "chunk \(size)")
        }
    }
}
