import Foundation
import Testing
@testable import EpistemicsCore

/// FSRS parity against ts-fsrs 5.4.2 through the web wrapper (fixture fsrs.json).
///
/// States, due times, intervals, steps, reps and lapses must match exactly. Stability and difficulty are
/// compared to 1e-9: both sides round them to 8 decimals (`roundTo`), but Math.exp/pow/log in V8 (fdlibm)
/// and Darwin libm may differ by an ulp, which can flip the 8th decimal in rare cases. Any such flip would
/// show up here as a 1e-8 difference; none occur on this fixture, so the tolerance only absorbs
/// representation noise. Intervals and fuzz depend on the exact values and are compared exactly.
@Suite struct FSRSConformanceTests {
    static let fx = try! Fixtures.json("fsrs.json")

    static func params(_ c: JSONValue) -> SchedulerParams {
        SchedulerParams(w: c["w"]?.array.map(\.double), desiredRetention: c["desiredRetention"]!.double,
                        maximumIntervalDays: c["maximumIntervalDays"]?.int, enableFuzz: c["enableFuzz"]?.bool)
    }

    static let schedulers: [Scheduler] = fx["configs"]!.array.map { Scheduler(params($0)) }

    @Test func parametersMigrateAndClipLikeTsFsrs() {
        for (i, p) in Self.fx["params"]!.array.enumerated() {
            let s = Self.schedulers[i]
            #expect(s.params.w.map(bitsHex) == p["w"]!.array.map(\.string), "config \(i) w")
            #expect(s.engine.parameters.w.map(bitsHex) == p["engineW"]!.array.map(\.string), "config \(i) engine w")
            #expect(bitsHex(s.engine.intervalModifier) == p["intervalModifier"]!.string, "config \(i) interval modifier")
            #expect(s.params.maximumInterval == p["maximumInterval"]!.int)
        }
        for o in Self.fx["odd"]!.array {
            let s = Scheduler(SchedulerParams(w: o["w"]!.array.map(\.double), desiredRetention: 0.9))
            #expect(s.engine.parameters.w.map(bitsHex) == o["effective"]!.array.map(\.string))
            #expect(bitsHex(s.engine.intervalModifier) == o["intervalModifier"]!.string)
        }
    }

    @Test func intervalForStability() {
        let stabilities = [0.001, 0.4, 1, 2.3, 7.77, 21, 100, 365.25, 9999]
        for (i, row) in Self.fx["intervals"]!.array.enumerated() {
            #expect(stabilities.map { Self.schedulers[i].intervalForStability($0) } == row.array.map(\.int))
        }
    }

    @Test func reviewSequencesMatchStepByStep() {
        let sequences = Self.fx["sequences"]!.array
        #expect(sequences.count >= 200)
        var steps = 0, maxDelta = 0.0
        var failures: [String] = []
        let sources: [String: ReviewSource] = ["review": .review, "lesson": .lesson, "checkpoint": .checkpoint, "warmup": .warmup, "diagnostic": .diagnostic]
        for seq in sequences {
            let s = Self.schedulers[seq["config"]!.int]
            var initial = CompactCard(seq["initial"]!)
            initial.stability = bits(seq["initialBits"]![0])
            initial.difficulty = bits(seq["initialBits"]![1])
            var c = card(id: seq["id"]!.string, conceptId: seq["conceptId"]!.string, initial, itemId: seq["itemId"]!.string)
            for (k, step) in seq["steps"]!.array.enumerated() {
                steps += 1
                let now = step["now"]!.int
                let rating = Rating(rawValue: step["rating"]!.int)!
                let x = step["ctx"]!
                let ctx = ReviewContext(source: sources[x["source"]!.string]!, assisted: x["assisted"]!.bool,
                                        confidence: x["confidence"].map { Confidence(rawValue: $0.int)! }, durationMs: x["durationMs"]?.int)
                let where_ = "\(seq["id"]!.string) step \(k)"

                let preview = s.previewRatings(c, now, ctx)
                for g in Rating.allCases {
                    let expected = step["preview"]![g.rawValue - 1]
                    let got = CompactCard(preview[g]!.card)
                    if !got.matches(CompactCard(expected[0])) { failures.append("\(where_) preview \(g): \(got) vs \(CompactCard(expected[0]))") }
                    let log = preview[g]!.log, el = expected[1]
                    if log.rating.rawValue != el[0].int || log.stateBefore.rawValue != el[1].int || log.elapsedDays != el[2].int
                        || log.scheduledDays != el[3].int || abs(log.stability - el[4].double) > 1e-9
                        || abs(log.difficulty - el[5].double) > 1e-9 || log.reviewTime != el[6].int {
                        failures.append("\(where_) preview log \(g)")
                    }
                }

                let out = s.applyRating(c, rating, now, ctx)
                let expected = CompactCard(step["after"]!)
                let got = CompactCard(out.card)
                maxDelta = max(maxDelta, abs(got.stability - expected.stability), abs(got.difficulty - expected.difficulty))
                if !got.matches(expected) { failures.append("\(where_) after \(rating): \(got) vs \(expected)") }
                #expect(out.log.source == ctx.source && out.log.assisted == ctx.assisted && out.log.confidence == ctx.confidence
                        && out.log.durationMs == ctx.durationMs && out.log.cardId == c.id && out.log.courseId == c.courseId)
                #expect(out.card.id == c.id && out.card.itemId == c.itemId && out.card.conceptId == c.conceptId)

                for (j, dt) in [0, 3 * dayMs, 30 * dayMs + 1234].enumerated() {
                    let r = s.retrievability(out.card, now + dt)
                    if bitsHex(r) != step["r"]![j].string { failures.append("\(where_) retrievability +\(dt): \(r) vs \(bits(step["r"]![j]))") }
                }
                // Continue from the Swift card: the chain must hold on its own, not by being re-fed the TS state.
                c = out.card
            }
        }
        #expect(failures.isEmpty, "\(failures.count) mismatches: \(failures.prefix(8))")
        #expect(steps > 1000)
        #expect(maxDelta == 0, "stability/difficulty differ by up to \(maxDelta)")
    }

    @Test func implicitCreditMatches() throws {
        let s = Self.schedulers[1]
        let now = daysFromCivil(2026, 3, 10) * dayMs + 12 * 3_600_000
        for t in Self.fx["implicit"]!.array {
            let edges = try t["edges"]!.decoded([ConceptEdge].self)
            let cards = try t["cards"]!.decoded([Card].self)
            let res = implicitCredit(ImplicitCreditInput(
                passedConceptId: "B", edges: edges,
                cardsByConcept: ["A": cards.filter { $0.conceptId == "A" }, "Z": cards.filter { $0.conceptId == "Z" }], now: now, scheduler: s))
            let expected = t["results"]!.array
            #expect(res.count == expected.count)
            for (r, e) in zip(res, expected) {
                let ec = try e["card"]!.decoded(Card.self)
                #expect(CompactCard(r.card).matches(CompactCard(ec)) && r.card.id == ec.id)
                #expect(r.log.elapsedDays == e["log"]!["elapsedDays"]!.int && r.log.scheduledDays == e["log"]!["scheduledDays"]!.int)
                #expect(r.log.source == .implicit && r.log.rating == .good)
            }
        }
    }
}
