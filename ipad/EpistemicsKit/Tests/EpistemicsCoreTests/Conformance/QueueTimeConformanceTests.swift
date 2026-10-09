import Foundation
import Testing
@testable import EpistemicsCore

/// Study days across timezones and DST (time.json), queue builds and the load simulator (queue.json).
@Suite struct QueueTimeConformanceTests {
    @Test func studyDayAndStartAcrossTimezonesAndDST() throws {
        let cases = try Fixtures.json("time.json")["cases"]!.array
        #expect(cases.count > 10_000)
        var failures: [String] = []
        for c in cases {
            let at = c[0].int, tz = c[1].string, cfg = DayConfig(timezone: tz, dayStartHour: c[2].int)
            let day = studyDay(at, cfg), start = studyDayStart(at, cfg), offset = tzOffsetMinutes(at, tz)
            if day != c[3].string || start != c[4].int || abs(offset - c[5].double) > 1e-9 {
                failures.append("\(at) \(tz) h\(c[2].int): \(day) \(start) \(offset) vs \(c[3].string) \(c[4].int) \(c[5].double)")
            }
        }
        #expect(failures.isEmpty, "\(failures.count): \(failures.prefix(6))")
    }

    @Test func buildQueueScenarios() throws {
        let fx = try Fixtures.json("queue.json")
        let s = Scheduler(SchedulerParams(desiredRetention: 0.9, enableFuzz: false))
        for (i, sc) in fx["scenarios"]!.array.enumerated() {
            let cards = try sc["cards"]!.decoded([Card].self)
            let settings = try sc["settings"]!.decoded(CourseSettings.self)
            let items = try sc["itemsByCard"]!.decoded([String: QueueItemInfo].self)
            let now = sc["now"]!.int, o = sc["opts"]!
            let q = buildQueue(BuildQueueInput(
                cards: cards, now: now, settings: settings, itemsByCard: items, retrievability: { s.retrievability($0, now) },
                recentlyShownConceptIds: o["recentlyShownConceptIds"].map { Set($0.array.map(\.string)) },
                rng: sc["rngSeed"] == .null ? nil : mulberry32(sc["rngSeed"]!.int),
                reviewsDoneToday: o["reviewsDoneToday"]?.int, newDoneToday: o["newDoneToday"]?.int,
                learnAheadMs: o["learnAheadMs"]?.int, debtCarriedOverDays: o["debtCarriedOverDays"]?.int))
            let e = sc["out"]!
            let ids = { (k: String) in e[k]!.array.map(\.string) }
            #expect(q.learning.map(\.id) == ids("learning"), "scenario \(i) learning")
            #expect(q.reviews.map(\.id) == ids("reviews"), "scenario \(i) reviews")
            #expect(q.newCards.map(\.id) == ids("newCards"), "scenario \(i) new")
            #expect(q.buried.map(\.id) == ids("buried"), "scenario \(i) buried")
            #expect([q.debt, q.dueToday, q.overdueDays, q.daysToClear] == ["debt", "dueToday", "overdueDays", "daysToClear"].map { e[$0]!.int },
                    "scenario \(i) counts")
            #expect(q.gateOpen == e["gateOpen"]!.bool && q.recoveryMode == e["recoveryMode"]!.bool, "scenario \(i) gate")
        }
    }

    @Test func simulatorMatchesDayByDay() throws {
        let fz = Scheduler(SchedulerParams(desiredRetention: 0.9, enableFuzz: true))
        for sim in try Fixtures.json("queue.json")["simulations"]!.array {
            let o = sim["opts"]!
            let days = simulateLoad(try sim["cards"]!.decoded([Card].self), sim["days"]!.int, try sim["settings"]!.decoded(CourseSettings.self), fz,
                                    SimulateOptions(newPerDay: o["newPerDay"]?.int, pNew: o["pNew"]?.double, startAt: o["startAt"]?.int, seed: o["seed"]?.int))
            #expect(days == (try sim["out"]!.decoded([SimulatedDay].self)))
        }
    }
}
