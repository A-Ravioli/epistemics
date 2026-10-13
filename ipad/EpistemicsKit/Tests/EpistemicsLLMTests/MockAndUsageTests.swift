import Foundation
import Testing
import Synchronization
import EpistemicsCore
@testable import EpistemicsLLM

private let req = LlmRequest(role: .tutor, system: [CacheableBlock("charter", cache: true)],
                             messages: [.user("hi", cache: true), .user("what now?")])

private struct X: Codable, Sendable, Equatable { var x: Int }

@Suite("Mock provider")
struct MockTests {
    @Test func streamsWordDeltasThenDone() async throws {
        let mock = MockProvider(.init(queue: [.tutor: ["One two  three\nfour?"]], model: "claude-opus-5-5"))
        let events = try await collect(mock.stream(req))
        let deltas = events.compactMap { if case .delta(let t) = $0 { t } else { nil } }
        #expect(deltas.count > 3)
        #expect(deltas.joined() == "One two  three\nfour?")
        guard case .done(let usage, _)? = events.last else { Issue.record("no done"); return }
        #expect(usage.cacheRead > 0 && usage.costUsd > 0)
        #expect(mock.calls.count == 1)
    }

    @Test func queueThenResponderThenHeuristics() async throws {
        let mock = MockProvider(.init(queue: [.tutor: ["first", .dynamic { .text("second for \($0.role.rawValue)") }]],
                                      respond: { $0.role == .student ? .text("scripted student?") : nil }))
        #expect(try await mock.text(req).text == "first")
        #expect(try await mock.text(req).text == "second for tutor")
        #expect(try await mock.text(req).text.contains("?"))
        var s = req
        s.role = .student
        #expect(try await mock.text(s).text == "scripted student?")
        mock.push(.tutor, "pushed")
        #expect(try await mock.text(req).text == "pushed")
        #expect(mock.calls.count == 5)
        mock.reset()
        #expect(mock.calls.isEmpty)
    }

    @Test func structuredDecodesObjectsAndJSONStrings() async throws {
        let mock = MockProvider(.init(queue: [.grader: [#"{"x": 1}"#, .value(X(x: 2))]]))
        var g = req
        g.role = .grader
        let a: Structured<X> = try await mock.structured(g, schema: .object(["x": .integer]), name: "S")
        let b: Structured<X> = try await mock.structured(g, schema: .object(["x": .integer]), name: "S")
        #expect(a.value == X(x: 1) && b.value == X(x: 2))
        g.role = .architect
        await #expect { let _: Structured<X> = try await mock.structured(g, schema: .object(["x": .integer]), name: "S") }
            throws: { ($0 as? LlmError)?.message.contains("no scripted response") == true }
    }

    @Test func reportsUsageWithMetadata() async throws {
        let seen = Box<UsageCall>()
        let mock = MockProvider(.init(onUsage: { seen.append($0) }))
        var r = req
        r.metadata = RequestMetadata(sessionId: "s", courseId: "c")
        _ = try await mock.text(r)
        let call = seen.all[0]
        #expect(call.role == .tutor && call.sessionId == "s" && call.courseId == "c" && call.usage.model == "mock" && call.usage.costUsd == 0)
    }

    @Test func attemptHeuristic() {
        #expect(MockHeuristics.attemptMade("I think it is 4"))
        #expect(!MockHeuristics.attemptMade("idk"))
        #expect(!MockHeuristics.attemptMade("I don't know, sorry"))
        #expect(!MockHeuristics.attemptMade("no"))
    }

    @Test func streamHonoursCancellation() async throws {
        let mock = MockProvider(.init(queue: [.tutor: [.text(Array(repeating: "w", count: 500).joined(separator: " "))]], delay: .milliseconds(2)))
        let task = Task { try await collect(mock.stream(req)) }
        try await Task.sleep(for: .milliseconds(20))
        task.cancel()
        let r = await task.result
        if case .success(let events) = r { #expect(events.count < 500) }
    }
}

@Suite("Usage")
struct UsageTests {
    func call(_ cost: Double, role: LlmRole = .tutor, model: String = "claude-opus-5-5", courseId: String? = nil) -> UsageCall {
        UsageCall(usage: Usage(inputTokens: 100, outputTokens: 50, costUsd: cost, latencyMs: 10, model: model), role: role, courseId: courseId)
    }

    @Test func prices() {
        #expect(Pricing.cost(model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 0, cacheRead: 0, cacheWrite: 0) == 4)
        #expect(Pricing.cost(model: "claude-opus-5-5", inputTokens: 0, outputTokens: 1_000_000, cacheRead: 0, cacheWrite: 0) == 20)
        #expect(Pricing.cost(model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, cacheRead: 1_000_000, cacheWrite: 0) == 0.2)
        #expect(Pricing.cost(model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 1_000_000) == 8)
        #expect(Pricing.cost(model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000) == 2 + 10 + 0.2 + 4)
        #expect(abs(Pricing.cost(model: "claude-haiku-5-5", inputTokens: 1_000_000, outputTokens: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000) - (0.1 + 0.5 + 0.01 + 0.2)) < 1e-12)
        #expect(Pricing.cost(model: "claude-opus-5", inputTokens: 1_000_000, outputTokens: 0, cacheRead: 0, cacheWrite: 0) == 5)
        #expect(Pricing.cost(model: "unknown", inputTokens: 1_000_000, outputTokens: 1_000_000, cacheRead: 0, cacheWrite: 0) == 0)
    }

    static let tz = TimeZone(identifier: "Europe/London")!
    static func ms(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int = 0) -> EpochMs {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        return EpochMs(cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi))!.timeIntervalSince1970 * 1000)
    }

    final class Clock: Sendable {
        let v: Mutex<EpochMs>
        init(_ t: EpochMs) { v = Mutex(t) }
        func set(_ t: EpochMs) { v.withLock { $0 = t } }
        var now: EpochMs { v.withLock { $0 } }
    }

    @Test func ledgerTotalsAndTodaysCost() {
        let clock = Clock(Self.ms(2026, 9, 16, 10))
        let ledger = UsageLedger(now: { clock.now }, dayStartHour: 4, timeZone: Self.tz)
        ledger.record(call(0.1))
        ledger.record(call(0.2, role: .grader, model: "claude-sonnet-5-5", courseId: "A"))
        #expect(ledger.totals().calls == 2)
        #expect(abs(ledger.totals().costUsd - 0.3) < 1e-9)
        #expect(abs((ledger.byRole()[.tutor]?.costUsd ?? 0) - 0.1) < 1e-9)
        #expect(ledger.byModel()["claude-sonnet-5-5"]?.calls == 1)
        #expect(abs(ledger.todaysCost() - 0.3) < 1e-9)
        #expect(abs(ledger.todaysCost(UsageFilter(courseId: "A")) - 0.2) < 1e-9)
        clock.set(Self.ms(2026, 9, 17, 3))       // 03:00 next day: same study day
        #expect(abs(ledger.todaysCost() - 0.3) < 1e-9)
        clock.set(Self.ms(2026, 9, 17, 4, 30))   // after the boundary
        #expect(ledger.todaysCost() == 0)
    }

    @Test func startOfStudyDay() {
        let early = UsageLedger.startOfStudyDay(Self.ms(2026, 9, 17, 2), dayStartHour: 4, timeZone: Self.tz)
        #expect(early == Self.ms(2026, 9, 16, 4))
        let later = UsageLedger.startOfStudyDay(Self.ms(2026, 9, 17, 12), dayStartHour: 4, timeZone: Self.tz)
        #expect(later == Self.ms(2026, 9, 17, 4))
    }

    @Test func loadAndCombineSinks() {
        let now = EpochMs(Date().timeIntervalSince1970 * 1000)
        let ledger = UsageLedger(now: { now })
        var old = call(1)
        old.at = now - 1000
        ledger.load([old])
        let seen = Box<UsageCall>()
        let sink = Budget.combineSinks(ledger.sink, { seen.append($0) }, nil)
        sink(call(0.5))
        #expect(seen.all.count == 1)
        #expect(abs(ledger.totals().costUsd - 1.5) < 1e-9)
        ledger.clear()
        #expect(ledger.calls.isEmpty)
    }

    func ledgerWith(_ spent: Double) -> UsageLedger {
        let l = UsageLedger()
        if spent > 0 { l.record(call(spent)) }
        return l
    }

    @Test func budgetGuard() {
        let a = Budget.guardSpend(ledgerWith(0.79), dailyUsd: 1)
        #expect(a.allowed && a.degradeToModel == nil && abs(a.fraction - 0.79) < 1e-9)
        let b = Budget.guardSpend(ledgerWith(0.8), dailyUsd: 1)
        #expect(b.allowed && b.degradeToModel == "claude-sonnet-5-5")
        #expect(Budget.guardSpend(ledgerWith(0.9), dailyUsd: 1, role: .grader).degradeToModel == nil)
        #expect(Budget.guardSpend(ledgerWith(0.9), dailyUsd: 1, currentModel: "claude-sonnet-5-5").degradeToModel == nil)
        #expect(!Budget.guardSpend(ledgerWith(1), dailyUsd: 1).allowed)
        #expect(!Budget.guardSpend(ledgerWith(1.5), dailyUsd: 1, role: .observer).allowed)
        #expect(Budget.guardSpend(ledgerWith(100), dailyUsd: 0).allowed)
        #expect(Budget.guardSpend(ledgerWith(100), dailyUsd: .infinity).allowed)
    }

    @Test func usageSum() {
        let s = Usage(inputTokens: 1, outputTokens: 2, costUsd: 0.5, model: "a") + Usage(inputTokens: 3, outputTokens: 4, costUsd: 0.25, model: "")
        #expect(s.inputTokens == 4 && s.outputTokens == 6 && s.costUsd == 0.75 && s.model == "a")
    }
}

@Suite("Ordered JSON")
struct OrderedJSONTests {
    @Test func serialisesLikeJSONStringify() {
        let v = OrderedJSON.object([("b", .int(1)), ("a", .array([.string("x\"y\n\u{01}"), .double(0.5), .double(2), .null, .bool(true)])), ("e", .array([])), ("o", .object([]))])
        #expect(v.serialized() == #"{"b":1,"a":["x\"y\n\u0001",0.5,2,null,true],"e":[],"o":{}}"#)
        #expect(v.prettySerialized() == "{\n  \"b\": 1,\n  \"a\": [\n    \"x\\\"y\\n\\u0001\",\n    0.5,\n    2,\n    null,\n    true\n  ],\n  \"e\": [],\n  \"o\": {}\n}")
        #expect(OrderedJSON.string("a/b é").serialized() == "\"a/b é\"")
    }

    @Test func roundTripsThroughJSONValue() {
        let j = json(#"{"z":[1,"a",null,{"k":false}],"a":2.5}"#)
        #expect(OrderedJSON(j).jsonValue == j)
        #expect(OrderedJSON(j).serialized() == #"{"a":2.5,"z":[1,"a",null,{"k":false}]}"#)
    }
}
