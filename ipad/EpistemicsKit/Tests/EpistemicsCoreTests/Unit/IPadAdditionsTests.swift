import Foundation
import Testing
@testable import EpistemicsCore

// Onboarding (ports of apps/web/src/lib/onboarding.test.ts, with the iPad review cap), paper, time by hand,
// and the map-from-memory grader.

@Suite struct OnboardingTests {
    @Test func steps() {
        #expect(stepsFor(needsCourse: true, needsTutor: true) == [.subject, .recall, .tutor, .commitment])
        #expect(stepsFor(needsCourse: true, needsTutor: false) == [.subject, .recall, .commitment])
        #expect(stepsFor(needsCourse: false, needsTutor: true) == [.tutor])
        #expect(stepsFor(needsCourse: false, needsTutor: false).isEmpty)
    }

    @Test func reviewCapIsDerivedForInk() {
        // iPad DESIGN §8: × 2 a minute; the web's × 3 stays available.
        #expect(schedulingFor(20) == SchedulingDerivation(weeklyMinutes: 140, reviewsPerDay: 40, desiredRetention: 0.9))
        #expect(schedulingFor(40).reviewsPerDay == 80)
        #expect(schedulingFor(20, reviewsPerMinute: WEB_REVIEWS_PER_MINUTE) == SchedulingDerivation(weeklyMinutes: 140, reviewsPerDay: 60, desiredRetention: 0.9))
        #expect(schedulingFor(40, reviewsPerMinute: WEB_REVIEWS_PER_MINUTE).reviewsPerDay == 120)
        #expect(schedulingFor(1).reviewsPerDay == 20 && schedulingFor(600).reviewsPerDay == 400)
    }

    @Test func goals() {
        var d = OnboardingDraft()
        d.minutesPerDay = 10
        d.recall = "  I know Bayes  "
        #expect(goalsFor(d) == CourseGoals(purpose: .understand, weeklyMinutes: 70, background: "I know Bayes"))
        var blank = OnboardingDraft()
        blank.recall = "   "
        #expect(goalsFor(blank).background == nil)
        var exam = OnboardingDraft()
        exam.purpose = .exam
        exam.examDate = "2026-12-01"
        let tz = TimeZone(identifier: "Europe/London")!
        #expect(goalsFor(exam, timeZone: tz).examDate == daysFromCivil(2026, 12, 1) * dayMs + 12 * 3_600_000)
        exam.purpose = .understand
        #expect(goalsFor(exam).examDate == nil)
    }

    @Test func reflectionMatcher() {
        let pack = Fixtures.tiny
        #expect(conceptsNamed(pack, "I remember the complement rule from school.") == ["Complement rule"])
        #expect(conceptsNamed(pack, "you add probabilities of disjoint events; that addition thing") == ["Addition rule for disjoint events"])
        #expect(conceptsNamed(pack, "probability is about events, I think").isEmpty)
        #expect(conceptsNamed(pack, "   ").isEmpty)
        #expect(conceptsNamed(pack, "complement rule, addition rule for disjoint events", limit: 1).count == 1)
        #expect(shouldOfferPlacement("…", ["Complement rule", "Addition rule for disjoint events"]))
        #expect(shouldOfferPlacement(String(repeating: "x", count: 120), []))
        #expect(!shouldOfferPlacement("", []) && !shouldOfferPlacement(nil, []))
    }

    @Test func scaffolding() {
        #expect(scaffoldingFromBackground(nil, .intro) == .novice)
        #expect(scaffoldingFromBackground("  ", .working) == .developing)
        #expect(scaffoldingFromBackground("a little", .intro) == .developing)
        #expect(scaffoldingFromBackground(String(repeating: "x", count: 41), .deep) == .advanced)
        #expect(scaffoldingFromBackground(String(repeating: "x", count: 40), .deep) == .developing)
    }
}

@Suite struct InkTests {
    func item(_ type: ItemType, ink: InkHint? = nil) -> Item {
        Item(id: "i", conceptId: "c", type: type, bloom: .apply, prompt: "p", reference: ItemReference(answer: "a"), ink: ink)
    }

    @Test func paperFollowsTheItemType() {
        #expect(inkLayout(for: item(.recall)) == InkLayout(paper: .short, lines: 1))
        #expect(inkLayout(for: item(.cloze)).paper == .short && inkLayout(for: item(.predict)).paper == .short)
        #expect(inkLayout(for: item(.explain)) == InkLayout(paper: .ruled, lines: 3))
        #expect(inkLayout(for: item(.discriminate)) == InkLayout(paper: .ruled, lines: 3, columns: 2))
        #expect(inkLayout(for: item(.apply)) == InkLayout(paper: .squared, lines: 8))
        #expect(inkLayout(for: item(.sketch)).paper == .dotted && inkLayout(for: item(.map)).paper == .dotted)
        #expect(inkLayout(for: item(.teachback)).paper == .ruled && inkLayout(for: item(.teachback)).lines > 3)
    }

    @Test func packOverridesWin() {
        #expect(inkLayout(for: item(.predict, ink: InkHint(paper: .dotted))) == InkLayout(paper: .dotted, lines: INK_DOTTED_LINES))
        #expect(inkLayout(for: item(.explain, ink: InkHint(lines: 6))) == InkLayout(paper: .ruled, lines: 6))
        #expect(inkLayout(for: item(.recall, ink: InkHint(paper: .squared, lines: 4))) == InkLayout(paper: .squared, lines: 4))
    }

    @Test func timeByHand() {
        let cards = [mkCard(id: "r"), mkCard(id: "e"), mkCard(id: "a"), mkCard(id: "unknown")]
        let q = Queue(learning: [cards[0]], reviews: [cards[1], cards[2]], newCards: [cards[3]], buried: [], debt: 0, dueToday: 0,
                      gateOpen: true, recoveryMode: false, overdueDays: 0, daysToClear: 0)
        let items = ["r": QueueItemInfo(conceptId: "c", type: .recall), "e": QueueItemInfo(conceptId: "c", type: .explain),
                     "a": QueueItemInfo(conceptId: "c", type: .apply)]
        #expect(estimateMinutesByHand(q, itemsByCard: items) == 4) // 20 + 60 + 90 + 25 = 195 s
        #expect(estimateMinutesByHand(q, itemsByCard: items, secondsByType: [.apply: 30]) == 3) // 20 + 60 + 30 + 25 = 135 s
        #expect(DEFAULT_SECONDS_BY_TYPE.count == ItemType.allCases.count)
    }
}

@Suite struct MapGradeTests {
    let unit = Fixtures.pack.units[0]

    @Test func matchesNodesLooselyButNotOnOneCommonWord() {
        let concepts = unit.lessons.flatMap(\.concepts)
        #expect(matchMapNode("Bayes", concepts)?.id == "c-bayes-theorem")
        #expect(matchMapNode("complement", concepts)?.id == "c-complement-rule")
        #expect(matchMapNode("Permutation", concepts)?.id == "c-permutations")
        #expect(matchMapNode("multiplication principle", concepts)?.id == "c-multiplication-principle")
        #expect(matchMapNode("conditional probability", concepts)?.id == "c-conditional-probability")
        #expect(matchMapNode("rule", concepts) == nil)
        #expect(matchMapNode("probability", concepts) == nil)
    }

    @Test func comparesEdgesIgnoringDirection() {
        let prereqs = Fixtures.pack.edges.filter { $0.kind == .prereq }
        let inUnit = Set(unit.lessons.flatMap(\.concepts).map(\.id))
        let expected = prereqs.filter { inUnit.contains($0.from) && inUnit.contains($0.to) }
        let first = expected[0]
        let name = { (id: String) in Fixtures.pack.concept(id)!.name }
        let nodes = [name(first.from), name(first.to), "Combinations", "my own idea"]
        let drawn = [DrawnEdge(name(first.to), name(first.from)), DrawnEdge("Combinations", "my own idea"), DrawnEdge("Combinations", name(first.from))]
        let g = gradeMap(nodes: nodes, edges: drawn, unit: unit, curriculumEdges: Fixtures.pack.edges)
        #expect(g.placed.count == 3 && g.missing.count == g.conceptCount - 3 && g.unmatchedNodes == ["my own idea"])
        #expect(g.correctEdges == [ConceptPair(first.from, first.to)])
        #expect(g.extraEdges.contains(DrawnEdge("Combinations", "my own idea")))
        #expect(g.edgeCount == Set(expected.map { ConceptPair($0.from, $0.to) }).count && g.missingEdges.count == g.edgeCount - 1)
        #expect(g.summary == "You placed 3 of \(g.conceptCount) ideas and 1 of \(g.edgeCount) links.")
    }
}
