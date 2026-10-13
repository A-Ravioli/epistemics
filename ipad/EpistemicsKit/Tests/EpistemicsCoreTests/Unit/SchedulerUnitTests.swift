import Foundation
import Synchronization
import Testing
@testable import EpistemicsCore

// Ports of web/packages/core/test/scheduler/*.test.ts.

/// 2026-03-10 12:00 UTC, a Tuesday.
let NOW: EpochMs = daysFromCivil(2026, 3, 10) * dayMs + 12 * 3_600_000
let DAY = dayMs
let HOUR = 3_600_000
let testSettings = CourseSettings(desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: "UTC")

func mkScheduler(w: [Double]? = nil, desiredRetention: Double = 0.9, maximumIntervalDays: Int? = nil, enableFuzz: Bool = false) -> Scheduler {
    Scheduler(SchedulerParams(w: w, desiredRetention: desiredRetention, maximumIntervalDays: maximumIntervalDays, enableFuzz: enableFuzz))
}

private let seq = Atomic<Int>(0)
func mkCard(id: String? = nil, conceptId: String? = nil, state: CardState = .new, due: EpochMs = NOW, lastReview: EpochMs? = nil,
            stability: Double = 0, difficulty: Double = 0, scheduledDays: Int = 0, reps: Int = 0, lapses: Int = 0,
            suspended: Bool = false, provisional: Bool = false) -> Card {
    let n = seq.add(1, ordering: .relaxed).newValue
    return Card(id: id ?? "card-\(n)", courseId: "course-1", itemId: "item-\(n)", conceptId: conceptId ?? "concept-\(n)", state: state,
                due: due, lastReview: lastReview, stability: stability, difficulty: difficulty, scheduledDays: scheduledDays,
                learningSteps: 0, reps: reps, lapses: lapses, suspended: suspended, provisional: provisional)
}

/// A Review-state card last reviewed `daysAgo` days before NOW with the given stability.
func reviewCard(_ daysAgo: Double, _ stability: Double, id: String? = nil, conceptId: String? = nil, due: EpochMs? = nil,
                suspended: Bool = false, lapses: Int = 0, reps: Int = 3) -> Card {
    let lastReview = NOW - Int(daysAgo * Double(DAY))
    return mkCard(id: id, conceptId: conceptId, state: .review, due: due ?? lastReview + Int(stability * Double(DAY)), lastReview: lastReview,
                  stability: stability, difficulty: 5, scheduledDays: Int(jsRound(stability)), reps: reps, lapses: lapses, suspended: suspended)
}

@Suite struct FSRSWrapperTests {
    let s = mkScheduler()

    @Test func cardMappingRoundTrips() {
        let c = reviewCard(3, 12.5, lapses: 1, reps: 7)
        #expect(fromFsrsCard(c, toFsrsCard(c)) == c)
        let n = mkCard()
        #expect(toFsrsCard(n).lastReview == nil && toFsrsCard(n).state == .new)
        #expect(fromFsrsCard(n, toFsrsCard(n)) == n)
        let base = mkCard(suspended: true, provisional: true)
        let out = fromFsrsCard(base, createEmptyCard(NOW))
        #expect(out.id == base.id && out.suspended && out.provisional && out.due == NOW)
    }

    @Test func newCardAndFirstRatings() {
        let c = s.newCard("course", "item", "concept", NOW, id: "fixed")
        #expect(c.id == "fixed" && c.state == .new && c.due == NOW && c.reps == 0)
        #expect(s.newCard("course", "item", "concept", NOW).id.wholeMatch(of: /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/) != nil)
        let p = s.previewRatings(c, NOW)
        #expect(p[.again]!.card.state == .learning && p[.again]!.card.due == NOW + 60_000)
        #expect(abs(p[.again]!.card.stability - DEFAULT_FSRS_W[0]) < 1e-6)
        #expect(p[.good]!.card.state == .learning && p[.good]!.card.due == NOW + 10 * 60_000)
        #expect(p[.easy]!.card.state == .review)
        #expect(p[.easy]!.card.scheduledDays == Int(jsRound(DEFAULT_FSRS_W[3])))
        #expect(p[.easy]!.card.due == NOW + p[.easy]!.card.scheduledDays * DAY)
        for r in Rating.allCases { #expect(p[r]!.log.rating == r && p[r]!.log.stateBefore == .new && p[r]!.log.source == .review) }
    }

    @Test func applyRatingCarriesContext() {
        let c = reviewCard(10, 10)
        let out = s.applyRating(c, .good, NOW, ReviewContext(source: .lesson, assisted: true, confidence: .fairlySure, durationMs: 4200))
        #expect(out.card.state == .review && out.card.reps == c.reps + 1 && out.card.lastReview == NOW)
        #expect(out.log.cardId == c.id && out.log.elapsedDays == 10 && out.log.stability == out.card.stability)
        #expect(out.log.source == .lesson && out.log.assisted && out.log.confidence == .fairlySure && out.log.durationMs == 4200)
    }

    @Test func ratingsMoveStabilityTheRightWay() {
        let c = reviewCard(10, 10)
        let p = s.previewRatings(c, NOW)
        #expect(p[.good]!.card.stability > c.stability && p[.easy]!.card.stability > p[.good]!.card.stability)
        #expect(p[.hard]!.card.stability > c.stability && p[.hard]!.card.stability < p[.good]!.card.stability)
        #expect(p[.again]!.card.state == .relearning && p[.again]!.card.lapses == c.lapses + 1)
        #expect(p[.again]!.card.stability < c.stability && p[.again]!.card.due == NOW + 10 * 60_000)
        #expect(p[.good]!.card.due > NOW + 10 * DAY)
        let early = s.applyRating(reviewCard(2, 10), .good, NOW, ReviewContext()).card
        let late = s.applyRating(reviewCard(20, 10), .good, NOW, ReviewContext()).card
        #expect(late.stability > early.stability)
    }

    @Test func retrievability() {
        #expect(s.retrievability(mkCard(), NOW) == 0)
        let c = reviewCard(10, 10)
        #expect(abs(s.retrievability(c, NOW) - 0.9) < 0.005)
        #expect(s.retrievability(c, NOW - 5 * DAY) > 0.9)
        #expect(s.retrievability(c, NOW + 30 * DAY) < 0.8)
        #expect(s.retrievability(c, NOW - 10 * DAY) == 1)
    }

    @Test func learningStepsGraduate() {
        var c = s.newCard("course", "item", "concept", NOW, id: "c")
        c = s.applyRating(c, .good, NOW, ReviewContext(source: .lesson)).card
        #expect(c.state == .learning)
        c = s.applyRating(c, .good, NOW + 10 * 60_000, ReviewContext(source: .lesson)).card
        #expect(c.state == .review && c.scheduledDays >= 1)
    }

    @Test func examCap() {
        let capped = mkScheduler(maximumIntervalDays: 5)
        let c = reviewCard(30, 30)
        #expect(mkScheduler().previewRatings(c, NOW)[.easy]!.card.scheduledDays > 5)
        let p = capped.previewRatings(c, NOW)
        for r in [Rating.hard, .good, .easy] { #expect(p[r]!.card.scheduledDays <= 5 && p[r]!.card.due <= NOW + 5 * DAY) }
        #expect(capped.intervalForStability(1000) == 5 && capped.params.maximumInterval == 5)
        #expect(daysToExam(NOW, NOW + Int(4.2 * Double(DAY))) == 5)
        #expect(daysToExam(NOW, NOW - DAY) == 1)
    }

    @Test func seedKnownCardAndProvisional() {
        let seeded = s.seedKnownCard(mkCard(), NOW)
        #expect(seeded.state == .review && seeded.stability == 21 && seeded.difficulty == 5 && seeded.provisional)
        #expect(seeded.lastReview == NOW && seeded.scheduledDays == 21 && seeded.due == NOW + 21 * DAY)
        #expect(abs(s.retrievability(seeded, NOW + 21 * DAY) - 0.9) < 0.005)
        #expect(s.seedKnownCard(mkCard(), NOW, stabilityDays: 7).scheduledDays == 7)
        let good = s.applyRating(seeded, .good, NOW + 5 * DAY, ReviewContext()).card
        #expect(!good.provisional && good.state == .review)
        let again = s.applyRating(seeded, .again, NOW + 5 * DAY, ReviewContext()).card
        #expect(!again.provisional && again.state == .relearning && again.stability < 21)
    }

    @Test func fuzzIsDeterministicAndCapped() {
        let fz = mkScheduler(maximumIntervalDays: 40, enableFuzz: true)
        let c = reviewCard(30, 30)
        let a = fz.applyRating(c, .good, NOW, ReviewContext()).card, b = fz.applyRating(c, .good, NOW, ReviewContext()).card
        #expect(a.due == b.due && a.scheduledDays <= 40)
    }

    @Test func customParametersAndRetention() {
        var w = DEFAULT_FSRS_W
        w[2] = 5
        let custom = mkScheduler(w: w, desiredRetention: 0.8)
        #expect(custom.params.w[2] == 5)
        #expect(abs(custom.previewRatings(mkCard(), NOW)[.good]!.card.stability - 5) < 1e-6)
        #expect(custom.intervalForStability(10) > s.intervalForStability(10))
    }

    @Test func leechesAndAbsoluteDue() {
        #expect(!isLeech(mkCard(lapses: 7)) && isLeech(mkCard(lapses: 8)))
        let at = NOW + 7 * HOUR
        let card = s.applyRating(reviewCard(10, 10), .good, at, ReviewContext()).card
        #expect(card.due == at + card.scheduledDays * DAY)
    }

    @Test func params() {
        #expect(DEFAULT_FSRS_W.count == 21 && DEFAULT_FSRS_W == FSRSConstants.defaultW && LEECH_LAPSES == 8)
        #expect(!shouldOptimize(399, nil, NOW) && shouldOptimize(400, nil, NOW))
        #expect(!shouldOptimize(400, NOW - 29 * DAY, NOW) && shouldOptimize(400, NOW - 30 * DAY, NOW))
        #expect(!shouldOptimize(5000, NOW - DAY, NOW))
    }

    @Test func invalidStatesAreClampedRatherThanThrown() {
        // ts-fsrs throws here; the port reviews a card whose last review is in the future as same-day.
        let c = reviewCard(-1, 10)
        let out = s.applyRating(c, .good, NOW, ReviewContext())
        #expect(out.card.state == .review && out.log.elapsedDays == 0)
    }
}

@Suite struct RatingAndCalibrationTests {
    @Test func ratingFromGradeBands() {
        #expect([0, 0.39, 0.4, 0.74, 0.75, 0.94].map { ratingFromGrade($0, 1) } == [.again, .again, .hard, .hard, .good, .good])
        #expect(ratingFromGrade(0.95, 0.8) == .easy && ratingFromGrade(1, 1) == .easy)
        #expect(ratingFromGrade(0.95, 0.79) == .good && ratingFromGrade(1, 0.5) == .good)
        #expect(ratingFromGrade(.nan, 1) == .again)
    }

    @Test func consensus() {
        #expect(needsConsensus(0.6, 0.69) && !needsConsensus(0.6, 0.9))
        #expect(needsConsensus(0.42, 0.9) && needsConsensus(0.78, 0.9) && needsConsensus(0.97, 0.9) && !needsConsensus(0.85, 0.9))
    }

    @Test func confidenceAdjustment() {
        #expect(adjustRatingForConfidence(.hard, .certain, false) == (.again, true))
        #expect(adjustRatingForConfidence(.good, .guess, true) == (.hard, false))
        #expect(adjustRatingForConfidence(.easy, .guess, true) == (.hard, false))
        #expect(adjustRatingForConfidence(.good, .fairlySure, true) == (.good, false))
        #expect(adjustRatingForConfidence(.again, .guess, false) == (.again, false))
        for r in Rating.allCases { for c in Confidence.allCases { for ok in [true, false] { #expect(adjustRatingForConfidence(r, c, ok).rating <= r) } } }
        #expect(Rating.allCases.map(isCorrect) == [false, false, true, true])
    }

    @Test func brier() {
        let pairs = [CalibrationPair(confidence: .certain, correct: true), .init(confidence: .certain, correct: false),
                     .init(confidence: .fairlySure, correct: true), .init(confidence: .guess, correct: false)]
        let b = brierScore(pairs)
        #expect(b.n == 4 && abs(b.brier - (0.0025 + 0.9025 + 0.1089 + 0.1089) / 4) < 1e-10 && abs(b.overconfidenceBias - 0.225) < 1e-10)
        #expect(brierScore([]) == CalibrationSummary(brier: 0, overconfidenceBias: 0, n: 0))
        let under = brierScore([.init(confidence: .guess, correct: true), .init(confidence: .guess, correct: true)])
        #expect(abs(under.overconfidenceBias - (0.33 - 1)) < 1e-10 && abs(under.brier - 0.67 * 0.67) < 1e-10)
        let bins = calibrationBins([.init(confidence: .certain, correct: true), .init(confidence: .certain, correct: true),
                                    .init(confidence: .certain, correct: false), .init(confidence: .guess, correct: true)])
        #expect(bins[0].n == 1 && bins[0].observed == 1 && abs(bins[0].gap + 0.67) < 1e-10)
        #expect(bins[1] == CalibrationBin(confidence: .fairlySure, predicted: 0.67, n: 0, observed: 0, gap: 0))
        #expect(bins[2].n == 3 && abs(bins[2].observed - 2.0 / 3) < 1e-10)
    }
}

@Suite struct MasteryTests {
    let s = mkScheduler()

    @Test func retentionAndMastery() {
        let R = { (c: Card, now: EpochMs) in s.retrievability(c, now) }
        let due = reviewCard(10, 10)
        #expect(abs(conceptRetention([due], NOW, R) - 0.9) < 0.005)
        #expect(abs(conceptRetention([due, mkCard()], NOW, R) - 0.45) < 0.005)
        #expect(abs(conceptRetention([due, mkCard(suspended: true)], NOW, R) - 0.9) < 0.005)
        #expect(conceptRetention([], NOW, R) == 0)
        #expect(conceptMastery(0.9, 0) == 0 && abs(conceptMastery(0.9, 1) - 0.3) < 1e-6 && abs(conceptMastery(0.9, 10) - 0.9) < 1e-6)
        #expect(conceptMastery(1.5, 3) == 1)
        #expect(isMastered(0.85, 0.8) && !isMastered(0.84, 0.9) && !isMastered(0.95, 0.79))
    }

    @Test func availability() {
        let edges = [ConceptEdge(from: "a", to: "c", kind: .prereq), ConceptEdge(from: "b", to: "c", kind: .prereq),
                     ConceptEdge(from: "z", to: "c", kind: .encompasses, weight: 0.4)]
        #expect(isAvailable("c", edges, ["a": 0.7, "b": 0.9]) && !isAvailable("c", edges, ["a": 0.69, "b": 0.9]))
        #expect(!isAvailable("c", edges, ["a": 0.9]) && isAvailable("c", edges, ["a": 0.5, "b": 0.5], threshold: 0.5))
        #expect(isAvailable("a", edges, [:]))
    }

    @Test func conceptStateFolding() {
        let base = ConceptState(courseId: "course", conceptId: "c")
        var st = updateConceptStateAfterReceipt(base, ConceptReceipt(rating: .good, assisted: false, day: "2026-03-10", at: 10))
        #expect(st.successfulSessions == 1 && st.lastSuccessDay == "2026-03-10" && st.unassistedPass == 1 && st.updatedAt == 10)
        st = updateConceptStateAfterReceipt(st, ConceptReceipt(rating: .easy, assisted: false, day: "2026-03-10"))
        #expect(st.successfulSessions == 1 && st.unassistedPass == 2)
        st = updateConceptStateAfterReceipt(st, ConceptReceipt(rating: .good, assisted: false, day: "2026-03-11"))
        st = updateConceptStateAfterReceipt(st, ConceptReceipt(rating: .good, assisted: false, day: "2026-03-09"))
        #expect(st.successfulSessions == 2 && st.lastSuccessDay == "2026-03-11")
        let assisted = updateConceptStateAfterReceipt(base, ConceptReceipt(rating: .easy, assisted: true, day: "2026-03-10"))
        #expect(assisted.assistedPass == 1 && assisted.unassistedN == 0 && assisted.lastSuccessDay == nil)
        var fail = updateConceptStateAfterReceipt(base, ConceptReceipt(rating: .again, assisted: false, day: "d"))
        fail = updateConceptStateAfterReceipt(fail, ConceptReceipt(rating: .hard, assisted: false, day: "d"))
        #expect(fail.unassistedN == 2 && unassistedPassRate(fail) == 0 && unassistedPassRate(base) == 0)
        var m = base
        m.misconceptions = ["m1", "m2", "m3", "m4"]
        m = updateConceptStateAfterReceipt(m, ConceptReceipt(rating: .again, assisted: false, misconceptionTags: ["m5", "m2", "m5"], day: "d"))
        #expect(m.misconceptions == ["m5", "m2", "m1", "m3", "m4"])
        m = updateConceptStateAfterReceipt(m, ConceptReceipt(rating: .again, assisted: false, misconceptionTags: ["m6"], day: "d"))
        #expect(m.misconceptions == ["m6", "m5", "m2", "m1", "m3"])
    }

    @Test func topologicalOrdering() throws {
        let edges = [ConceptEdge(from: "b", to: "c", kind: .prereq), ConceptEdge(from: "a", to: "b", kind: .prereq),
                     ConceptEdge(from: "a", to: "d", kind: .prereq), ConceptEdge(from: "x", to: "a", kind: .encompasses, weight: 0.3)]
        #expect(try topologicalOrder(["d", "c", "b", "a", "x"], edges) == ["a", "d", "b", "c", "x"])
        #expect(try topologicalOrder(["a", "b", "c", "d", "x"], edges) == ["a", "b", "c", "d", "x"])
        #expect(try topologicalOrder([], edges) == [])
        #expect(try topologicalOrder(["a", "b"], [ConceptEdge(from: "zzz", to: "a", kind: .prereq), ConceptEdge(from: "b", to: "a", kind: .prereq)]) == ["b", "a"])
        let cyc = [ConceptEdge(from: "a", to: "b", kind: .prereq), ConceptEdge(from: "b", to: "c", kind: .prereq),
                   ConceptEdge(from: "c", to: "a", kind: .prereq), ConceptEdge(from: "a", to: "d", kind: .prereq)]
        #expect(throws: PrerequisiteCycleError(concepts: ["a", "b", "c", "d"])) { try topologicalOrder(["a", "b", "c", "d"], cyc) }
        #expect(throws: PrerequisiteCycleError.self) { try topologicalOrder(["a"], [ConceptEdge(from: "a", to: "a", kind: .prereq)]) }
    }

    @Test func nextLesson() {
        func concept(_ id: String) -> Concept {
            Concept(id: id, ordinal: 0, name: id, definition: id, script: ConceptScript(
                pretest: .init(prompt: "", isomorph: "", reference: ""), guidingQuestions: [], workedExample: .init(problem: "", steps: []),
                transfer: .init(prompt: "", reference: ""), hints: ["", "", ""]))
        }
        let manifest = Fixtures.core.manifest
        let cur = Curriculum(manifest: manifest, units: [
            EpistemicsCore.Unit(id: "u2", ordinal: 2, title: "U2", summary: "", lessons: [Lesson(id: "l3", ordinal: 1, title: "L3", concepts: [concept("e")])]),
            EpistemicsCore.Unit(id: "u1", ordinal: 1, title: "U1", summary: "", lessons: [
                Lesson(id: "l2", ordinal: 2, title: "L2", concepts: [concept("c"), concept("d")]),
                Lesson(id: "l1", ordinal: 1, title: "L1", concepts: [concept("a"), concept("b")]),
            ]),
        ], edges: [ConceptEdge(from: "a", to: "b", kind: .prereq), ConceptEdge(from: "b", to: "c", kind: .prereq),
                   ConceptEdge(from: "c", to: "d", kind: .prereq), ConceptEdge(from: "d", to: "e", kind: .prereq)])
        #expect(nextAvailableLesson(cur, [:], [])?.id == "l1")
        #expect(nextAvailableLesson(cur, [:], ["l1"]) == nil)
        #expect(nextAvailableLesson(cur, ["b": 0.7], ["l1"])?.id == "l2")
        #expect(nextAvailableLesson(cur, ["b": 0.9], ["l1", "l2"]) == nil)
        #expect(nextAvailableLesson(cur, ["b": 0.9, "d": 0.75], ["l1", "l2"])?.id == "l3")
        #expect(nextAvailableLesson(cur, ["d": 0.9], ["l1"])?.id == "l3")
    }
}

@Suite struct ImplicitCreditTests {
    let s = mkScheduler()
    let edges = [ConceptEdge(from: "B", to: "A", kind: .encompasses, weight: 0.4), ConceptEdge(from: "B", to: "Z", kind: .encompasses, weight: 0.9),
                 ConceptEdge(from: "B", to: "Q", kind: .encompasses, weight: 0), ConceptEdge(from: "B", to: "P", kind: .prereq),
                 ConceptEdge(from: "C", to: "A", kind: .encompasses, weight: 0.5)]

    func run(_ cards: [String: [Card]], _ passed: String = "B", scheduler: Scheduler? = nil) -> [RatingOutcome] {
        implicitCredit(ImplicitCreditInput(passedConceptId: passed, edges: edges, cardsByConcept: cards, now: NOW, scheduler: scheduler ?? s))
    }

    @Test func encompassed() {
        let e = encompassedBy("B", edges)
        #expect(e.map(\.conceptId) == ["A", "Z"] && e.map(\.weight) == [0.4, 0.5])
        #expect(encompassedBy("nope", edges).isEmpty)
    }

    @Test func bumpsStabilityOnly() {
        let a = reviewCard(8, 10, id: "a", conceptId: "A")
        let res = run(["A": [a]])
        #expect(res.count == 1)
        let r = res[0]
        let sGood = s.previewRatings(a, NOW)[.good]!.card.stability
        #expect(abs(r.card.stability - (10 + 0.4 * (sGood - 10))) < 1e-9 && r.card.stability < sGood)
        #expect(r.card.due > a.due && r.card.due == a.lastReview! + r.card.scheduledDays * DAY)
        #expect(r.card.scheduledDays == s.intervalForStability(r.card.stability))
        #expect(r.card.difficulty == a.difficulty && r.card.reps == a.reps && r.card.lastReview == a.lastReview && r.card.state == .review)
        #expect(r.log.elapsedDays == 8 && r.log.source == .implicit && r.log.rating == .good && !r.log.assisted)
    }

    @Test func onlyEligibleCards() {
        let cards = [mkCard(id: "new", conceptId: "A"),
                     mkCard(id: "learn", conceptId: "A", state: .learning, due: NOW + 60_000, lastReview: NOW - 60_000, stability: 0.5, difficulty: 5),
                     reviewCard(0.1, 30, id: "strong", conceptId: "A"), reviewCard(8, 10, id: "susp", conceptId: "A", suspended: true),
                     reviewCard(8, 10, id: "ok", conceptId: "A")]
        #expect(run(["A": cards]).map(\.card.id) == ["ok"])
    }

    @Test func neverMovesBackwards() {
        var sInit = 0.5
        while sInit < 200 {
            for daysAgo in [0.5, 1, 3, 10, 40, 400] {
                let c = reviewCard(daysAgo, sInit, conceptId: "A")
                for r in run(["A": [c]]) { #expect(r.card.stability >= c.stability && r.card.due >= c.due) }
            }
            sInit *= 2.3
        }
    }

    @Test func weightsAndCap() {
        let out = run(["A": [reviewCard(8, 10, id: "a", conceptId: "A")], "Z": [reviewCard(8, 10, id: "z", conceptId: "Z")],
                       "P": [reviewCard(8, 10, id: "p", conceptId: "P")], "Q": [reviewCard(8, 10, id: "q", conceptId: "Q")]])
        #expect(out.map(\.card.id).sorted() == ["a", "z"])
        #expect(run(["A": [reviewCard(8, 10, conceptId: "A")]], "A").isEmpty)
        let capped = run(["A": [reviewCard(8, 10, id: "a", conceptId: "A", due: NOW - 5 * DAY)]], scheduler: mkScheduler(maximumIntervalDays: 3))
        #expect(capped[0].card.scheduledDays == 3)
    }
}

@Suite struct QueueTests {
    let s = mkScheduler()

    func build(_ cards: [Card], settings: CourseSettings = testSettings, now: EpochMs = NOW, items: [String: QueueItemInfo]? = nil,
               recent: Set<String>? = nil, rng: Rng? = nil, reviewsDone: Int? = nil, newDone: Int? = nil, learnAhead: Int? = nil,
               carried: Int? = nil) -> Queue {
        let itemsByCard = items ?? Dictionary(uniqueKeysWithValues: cards.map { ($0.id, QueueItemInfo(conceptId: $0.conceptId, type: .recall)) })
        return buildQueue(BuildQueueInput(cards: cards, now: now, settings: settings, itemsByCard: itemsByCard,
                                          retrievability: { s.retrievability($0, now) }, recentlyShownConceptIds: recent, rng: rng ?? mulberry32(7),
                                          reviewsDoneToday: reviewsDone, newDoneToday: newDone, learnAheadMs: learnAhead, debtCarriedOverDays: carried))
    }

    @Test func ordering() {
        let intra = mkCard(id: "intra", state: .learning, due: NOW - 60_000, lastReview: NOW - 120_000, stability: 0.2, difficulty: 5)
        let inter = mkCard(id: "inter", state: .relearning, due: NOW - HOUR, lastReview: NOW - DAY, stability: 1, difficulty: 5, scheduledDays: 1)
        let q = build([mkCard(id: "new"), reviewCard(5, 5, id: "rev"), inter, intra])
        #expect(q.learning.map(\.id) == ["intra", "inter"] && q.reviews.map(\.id) == ["rev"] && q.newCards.isEmpty && q.dueToday == 3)
    }

    @Test func learnAheadAndDayBoundary() {
        let soon = mkCard(id: "soon", state: .learning, due: NOW + 5 * 60_000, lastReview: NOW - 5 * 60_000, stability: 0.2, difficulty: 5)
        let later = mkCard(id: "later", state: .learning, due: NOW + 3 * HOUR, lastReview: NOW - 5 * 60_000, stability: 0.2, difficulty: 5)
        #expect(build([soon, later]).learning.map(\.id) == ["soon"])
        #expect(build([soon, later], learnAhead: 0).learning.isEmpty)
        #expect(build([soon, later], learnAhead: 4 * HOUR).learning.map(\.id) == ["soon", "later"])
        let today = reviewCard(5, 5, id: "today", due: NOW + 10 * HOUR), tomorrow = reviewCard(5, 5, id: "tomorrow", due: NOW + 17 * HOUR)
        #expect(build([tomorrow, today]).reviews.map(\.id) == ["today"])
    }

    @Test func tieBreakUsesTheRng() {
        let a = reviewCard(5, 5, id: "a", due: NOW - 2 * DAY), b = reviewCard(5, 5, id: "b", due: NOW - DAY)
        let c = reviewCard(5, 5, id: "c", due: NOW - DAY), d = reviewCard(5, 5, id: "d", due: NOW - 3 * DAY)
        let q = build([a, b, c, d])
        #expect(q.reviews[0].id == "d" && q.reviews[1].id == "a" && Set(q.reviews[2...].map(\.id)) == ["b", "c"])
        #expect(build([a, b, c, d]).reviews.map(\.id) == q.reviews.map(\.id))
        let orders = Set((1..<20).map { build([a, b, c, d], rng: mulberry32($0)).reviews.map(\.id).joined(separator: ",") })
        #expect(orders.count == 2)
    }

    @Test func suspendedAndBurying() {
        let q = build([reviewCard(5, 5, id: "x", due: NOW - DAY, suspended: true), mkCard(id: "n", suspended: true)])
        #expect(q.reviews.isEmpty && q.newCards.isEmpty && q.dueToday == 0 && q.gateOpen)
        let a1 = reviewCard(5, 5, id: "a1", conceptId: "A", due: NOW - 2 * DAY), a2 = reviewCard(5, 5, id: "a2", conceptId: "A", due: NOW - DAY)
        let b1 = reviewCard(5, 5, id: "b1", conceptId: "B", due: NOW - DAY)
        let q2 = build([a1, a2, b1])
        #expect(q2.reviews.map(\.id) == ["a1", "b1"] && q2.buried.map(\.id) == ["a2"] && q2.dueToday == 3 && !q2.gateOpen)
        let l = mkCard(id: "l", conceptId: "A", state: .learning, due: NOW - 1000, lastReview: NOW - 60_000, stability: 0.2, difficulty: 5)
        let q3 = build([l, reviewCard(5, 5, id: "r", conceptId: "A", due: NOW - DAY), reviewCard(5, 5, id: "o", conceptId: "C", due: NOW - DAY)], recent: ["C"])
        #expect(q3.learning.map(\.id) == ["l"] && q3.reviews.isEmpty && Set(q3.buried.map(\.id)) == ["r", "o"])
        let x = mkCard(id: "x", conceptId: "wrong"), y = mkCard(id: "y", conceptId: "wrong2")
        let q4 = build([x, y], items: ["x": QueueItemInfo(conceptId: "same", type: .recall), "y": QueueItemInfo(conceptId: "same", type: .explain)])
        #expect(q4.newCards.count == 1 && q4.buried.count == 1)
    }

    @Test func gateDebtAndRecovery() {
        let fresh = [mkCard(id: "n1", due: NOW - 3000), mkCard(id: "n2", due: NOW - 2000), mkCard(id: "n3", due: NOW - 1000)]
        let q = build(fresh)
        #expect(q.gateOpen && !q.recoveryMode && q.newCards.map(\.id) == ["n1", "n2", "n3"])
        #expect(!build(fresh + [reviewCard(5, 5, id: "r", due: NOW - DAY)]).gateOpen)
        #expect(build(fresh + [reviewCard(5, 5, id: "r", due: NOW + 3 * DAY)]).gateOpen)

        let six = (0..<6).map { mkCard(id: "n\($0)", due: NOW + $0) }
        var four = testSettings
        four.maxNewItemsPerDay = 4
        #expect(build(six, settings: four).newCards.count == 4 && build(six, settings: four, newDone: 3).newCards.count == 1)
        #expect(build(six, settings: four, newDone: 9).newCards.isEmpty)

        let due = (0..<10).map { reviewCard(5, 5, id: "r\($0)", due: NOW - DAY + $0) }
        var capped = testSettings
        capped.reviewsPerDay = 6
        let d = build(due, settings: capped)
        #expect(d.reviews.count == 6 && d.debt == 4 && d.daysToClear == 2 && !d.gateOpen && !d.recoveryMode && d.overdueDays == 1)
        let partial = build(due, settings: capped, reviewsDone: 4)
        #expect(partial.reviews.count == 2 && partial.debt == 8)
        let old = build([reviewCard(5, 5, id: "old", due: NOW - 10 * DAY)])
        #expect(old.debt == 0 && old.overdueDays == 0 && !old.recoveryMode)

        var two = testSettings
        two.reviewsPerDay = 2
        let rq = build([reviewCard(4, 40, id: "strong", due: NOW - 4 * DAY), reviewCard(4, 20, id: "fresh", due: NOW - 2 * DAY),
                        reviewCard(4, 5, id: "mid", due: NOW - 3 * DAY), reviewCard(4, 1, id: "weak", due: NOW - 3 * DAY), mkCard(id: "new")], settings: two)
        #expect(rq.recoveryMode && !rq.gateOpen && rq.overdueDays == 4 && rq.debt == 2 && rq.reviews.map(\.id) == ["weak", "mid"] && rq.newCards.isEmpty)
        let small = build([reviewCard(3, 30, id: "a", due: NOW - 2 * DAY), reviewCard(3, 1, id: "b", due: NOW - DAY), reviewCard(3, 5, id: "c", due: NOW - DAY)], settings: two)
        #expect(!small.recoveryMode && small.overdueDays == 2 && small.reviews[0].id == "b" && !small.gateOpen)
        let carried = build([mkCard(id: "n")], carried: 3)
        #expect(carried.recoveryMode && !carried.gateOpen && carried.newCards.isEmpty)
    }

    @Test func studyDayBoundaryInTimezone() {
        var tokyo = testSettings
        tokyo.timezone = "Asia/Tokyo"
        let at = daysFromCivil(2026, 3, 10) * DAY + 18 * HOUR
        let x = reviewCard(5, 5, id: "x", due: at + 30 * 60_000), y = reviewCard(5, 5, id: "y", due: at + 90 * 60_000)
        #expect(build([x, y], settings: tokyo, now: at).reviews.map(\.id) == ["x"])
    }

    @Test func estimates() {
        let q = Queue(learning: [mkCard()], reviews: [mkCard(), mkCard()], newCards: [mkCard()], buried: [], debt: 0, dueToday: 0,
                      gateOpen: true, recoveryMode: false, overdueDays: 0, daysToClear: 0)
        #expect(estimateMinutes(q) == 2 && estimateMinutes(q, secondsPerItem: 60) == 4 && estimateMinutes(count: 0) == 0)
    }
}

@Suite struct SimulateTests {
    let s = mkScheduler(enableFuzz: true)

    @Test func mulberryIsDeterministicAndUniform() {
        let a = mulberry32(42), b = mulberry32(42)
        let xs = (0..<1000).map { _ in a() }
        #expect((0..<1000).map { _ in b() } == xs)
        #expect(xs.min()! >= 0 && xs.max()! < 1)
        let mean = xs.reduce(0, +) / 1000
        #expect(mean > 0.45 && mean < 0.55 && mulberry32(1)() != mulberry32(2)())
    }

    @Test func stableBoundedLoad() {
        let days = simulateLoad([], 60, testSettings, s, SimulateOptions(newPerDay: 10, startAt: NOW, seed: 3))
        #expect(days.count == 60 && days[0].day == "2026-03-10" && days[59].day == "2026-05-08")
        for d in days { #expect(d.newCards == 10 && d.reviews <= testSettings.reviewsPerDay + 60 && d.debt == 0 && d.minutes > 0) }
        let mean = { (xs: ArraySlice<SimulatedDay>) in Double(xs.map(\.reviews).reduce(0, +)) / Double(xs.count) }
        let early = mean(days[10..<20]), late = mean(days[40..<60]), veryLate = mean(days[50..<60])
        #expect(late > early && veryLate < late * 1.5 && late > 10 && late < 100)
    }

    @Test func determinismAndBacklog() {
        let a = simulateLoad([], 20, testSettings, s, SimulateOptions(newPerDay: 5, startAt: NOW, seed: 9))
        #expect(a == simulateLoad([], 20, testSettings, s, SimulateOptions(newPerDay: 5, startAt: NOW, seed: 9)))
        #expect(a != simulateLoad([], 20, testSettings, s, SimulateOptions(newPerDay: 5, startAt: NOW, seed: 10)))
        let backlog = (0..<30).map { reviewCard(10, 8, id: "b\($0)", conceptId: "c\($0)", due: NOW - ($0 % 5) * DAY) }
        var ten = testSettings
        ten.reviewsPerDay = 10
        let days = simulateLoad(backlog, 5, ten, s, SimulateOptions(pRecall: { _, _ in 1 }, startAt: NOW, seed: 1))
        #expect(days[0].debt == 20 && days[0].reviews == 10 && days[1].debt == 10 && days[2].debt == 0 && days[0].newCards == 0)
        var three = testSettings
        three.maxNewItemsPerDay = 3
        let gated = simulateLoad(Array(backlog.prefix(5)).map { var c = $0; c.due = NOW - DAY; return c }, 2, three, s,
                                 SimulateOptions(pRecall: { _, _ in 1 }, newPerDay: 10, startAt: NOW, seed: 1))
        #expect(gated[0].reviews >= 5 && gated[0].newCards == 3 && gated[1].newCards == 3)
        let forgetful = simulateLoad([], 3, testSettings, s, SimulateOptions(pRecall: { _, _ in 0 }, newPerDay: 2, startAt: NOW, seed: 1, maxAnswersPerDay: 50))
        #expect(forgetful.allSatisfy { $0.reviews + $0.newCards <= 50 })
    }
}
