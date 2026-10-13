import Foundation
import Testing
@testable import EpistemicsCore

/// The knowledge-space placement (Session/Placement.swift) against the bundled probability pack.
@Suite struct PlacementTests {
    let pack = Fixtures.pack

    /// Answers truthfully for a learner who knows exactly `knows`, and returns the final state.
    func run(_ knows: Set<String>, maxProbes: Int = PLACEMENT_DEFAULT_MAX_PROBES) -> PlacementState {
        var s = createPlacement(pack, maxProbes: maxProbes)
        while let probe = nextPlacementProbe(s) {
            #expect(!s.known.contains(probe.conceptId) && !s.unknown.contains(probe.conceptId), "never asks about a settled concept")
            s = recordPlacementResult(s, probe.conceptId, knows.contains(probe.conceptId))
        }
        return s
    }

    /// A concept together with everything it depends on: what someone who knows `ids` must also know.
    func downwardClosure(_ ids: [String]) -> Set<String> {
        let s = createPlacement(pack)
        var out = Set<String>()
        var stack = ids
        while let id = stack.popLast() {
            if out.insert(id).inserted { stack.append(contentsOf: s.prereqs[id] ?? []) }
        }
        return out
    }

    @Test func aNewcomerIsPlacedAtTheBeginningInAFewQuestions() {
        let s = run([])
        let r = placementResult(s)
        #expect(r.knownConceptIds.isEmpty)
        #expect(r.probes <= 8, "a novice is settled well inside the limit, got \(r.probes)")
        #expect(lessonsPlacedOut(pack, knownConceptIds: []).isEmpty)
    }

    @Test func someoneWhoKnowsItAllPlacesOutOfEverythingWithinTheLimit() {
        let all = Set(pack.allConcepts.map(\.id))
        let r = placementResult(run(all))
        #expect(Set(r.knownConceptIds) == all)
        #expect(r.probes <= PLACEMENT_DEFAULT_MAX_PROBES)
        #expect(r.probes < pack.allConcepts.count / 2, "inferring prerequisites saves most of the questions, got \(r.probes)")
        #expect(lessonsPlacedOut(pack, knownConceptIds: all).count == pack.allLessons.count)
    }

    @Test func truthfulAnswersNeverOverPlace() {
        // Every lesson boundary, as a learner who has mastered the course up to there.
        let lessons = pack.allLessons
        for cut in 0...lessons.count {
            let knows = downwardClosure(lessons.prefix(cut).flatMap { $0.concepts.map(\.id) })
            let r = placementResult(run(knows))
            #expect(Set(r.knownConceptIds).isSubset(of: knows), "placed a concept the learner does not know (cut \(cut))")
        }
    }

    @Test func itPlacesEachBranchOnItsOwnEvidence() {
        // Knows counting (multiplication principle → permutations → combinations) but not the axioms branch:
        // the old single-depth diagnostic cannot represent this.
        let counting = downwardClosure(["c-combinations"])
        let s = run(counting, maxProbes: 29)
        let r = placementResult(s)
        #expect(Set(r.knownConceptIds) == counting)
        #expect(!r.knownConceptIds.contains("c-conditional-probability"))
    }

    @Test func aPassSettlesPrerequisitesAndAFailSettlesDependents() {
        var s = createPlacement(pack)
        s = recordPlacementResult(s, "c-permutations", true)
        #expect(s.known.isSuperset(of: ["c-permutations", "c-multiplication-principle"]))
        s = recordPlacementResult(s, "c-conditional-probability", false)
        #expect(s.unknown.isSuperset(of: ["c-conditional-probability", "c-bayes-theorem", "c-independence"]))
        #expect(s.known.isDisjoint(with: s.unknown))
    }

    @Test func itStopsAtTheProbeLimitAndCountsTheRestAsNotKnown() {
        let s = run(Set(pack.allConcepts.map(\.id)), maxProbes: 1)
        #expect(s.probes == 1)
        #expect(nextPlacementProbe(s) == nil)
        let r = placementResult(s)
        #expect(r.knownConceptIds.count + r.notKnownConceptIds.count == pack.allConcepts.count)
    }

    @Test func itProbesWithItemsThatShowUseNotRecognition() {
        let s = createPlacement(pack)
        let items = Dictionary(uniqueKeysWithValues: pack.allItems.map { ($0.id, $0) })
        let types = s.probeItem.values.compactMap { items[$0]?.type }
        #expect(types.allSatisfy { $0 == .apply || $0 == .explain || $0 == .discriminate || $0 == .sketch })
    }
}
