import Foundation
import Testing
@testable import EpistemicsCore

/// Progress checks, variants and mixed-evidence mastery (Session/ProgressCheck.swift, Scheduler/Mastery.swift;
/// ipad docs/AUDIT.md #3, #4) against the bundled probability pack.
@Suite struct ProgressCheckTests {
    let pack = Fixtures.pack

    func candidate(_ c: Concept, provisional: Bool = false, mastery: Double = 0.8, mixedN: Int = 1) -> ProgressCheckCandidate {
        ProgressCheckCandidate(conceptId: c.id, itemId: c.items[0].id, provisional: provisional, mastery: mastery, mixedN: mixedN)
    }

    func lessonOf(_ conceptId: String) -> String {
        pack.allLessons.first { $0.concepts.contains { $0.id == conceptId } }!.id
    }

    // MARK: When

    @Test func dueAfterFourLessonsOrTwoWeeksButNotWithTooLittleToMix() {
        #expect(!progressCheckDue(lessonsSinceLast: 3, daysSinceLast: 13, eligibleConcepts: 10, hasProvisional: false))
        #expect(progressCheckDue(lessonsSinceLast: 4, daysSinceLast: 0, eligibleConcepts: 10, hasProvisional: false))
        #expect(progressCheckDue(lessonsSinceLast: 0, daysSinceLast: 14, eligibleConcepts: 10, hasProvisional: false))
        #expect(!progressCheckDue(lessonsSinceLast: 9, daysSinceLast: 30, eligibleConcepts: 2, hasProvisional: true))
    }

    @Test func placedOutConceptsAreCheckedSooner() {
        #expect(!progressCheckDue(lessonsSinceLast: 0, daysSinceLast: 7, eligibleConcepts: 10, hasProvisional: false))
        #expect(progressCheckDue(lessonsSinceLast: 0, daysSinceLast: 7, eligibleConcepts: 10, hasProvisional: true))
    }

    // MARK: What

    @Test func provisionalConceptsComeFirstThenTheLeastEvidence() {
        let concepts = pack.allConcepts
        var cands = concepts.map { candidate($0, mixedN: 3) }
        cands[10] = candidate(concepts[10], provisional: true, mixedN: 0)
        cands[20] = candidate(concepts[20], mixedN: 0)
        let picked = selectProgressCheck(pack, cands).map(\.conceptId)
        #expect(picked.count == PROGRESS_CHECK_SIZE)
        #expect(Set(picked).isSuperset(of: [concepts[10].id, concepts[20].id]))
        // Priority decides what is asked; interleaving decides the order. With only one slot left the
        // provisional concept still beats every confirmed one.
        let tight = selectProgressCheck(pack, cands, size: 1).map(\.conceptId)
        #expect(tight == [concepts[10].id], "the unconfirmed placed-out concept outranks everything")
    }

    @Test func spansTheCourseAndNeverAsksTwiceFromOneLessonInARow() {
        let cands = pack.allConcepts.map { candidate($0) }
        let picked = selectProgressCheck(pack, cands)
        #expect(picked.count == PROGRESS_CHECK_SIZE)
        #expect(Set(picked.map(\.conceptId)).count == picked.count, "one question per concept")
        let lessons = picked.map { lessonOf($0.conceptId) }
        var perLesson: [String: Int] = [:]
        for l in lessons { perLesson[l, default: 0] += 1 }
        #expect(perLesson.values.allSatisfy { $0 <= PROGRESS_CHECK_MAX_PER_LESSON })
        for i in 1..<lessons.count { #expect(lessons[i] != lessons[i - 1], "interleaved") }
    }

    @Test func topsUpFromOneLessonWhenThatIsAllThereIs() {
        let one = pack.allLessons.first { $0.concepts.count >= 3 }!
        let picked = selectProgressCheck(pack, one.concepts.map { candidate($0) })
        #expect(picked.count == one.concepts.count, "the per-lesson cap gives way rather than leave the check short")
    }

    @Test func ignoresUnknownAndDuplicateConcepts() {
        let c = pack.allConcepts[0]
        let picked = selectProgressCheck(pack, [candidate(c), candidate(c),
                                                ProgressCheckCandidate(conceptId: "nope", itemId: "x", provisional: true, mastery: 0, mixedN: 0)])
        #expect(picked.map(\.conceptId) == [c.id])
    }

    // MARK: Variants

    func itemWithVariants() -> Item {
        var item = pack.allItems.first { $0.type == .apply }!
        item.variants = [
            ItemVariant(id: item.id + "~v1", prompt: "Variant one", reference: ItemReference(answer: "One", exact: "1"),
                        rubric: [RubricCriterion(id: "c1", text: "Gets one")]),
            ItemVariant(id: item.id + "~v2", prompt: "Variant two", reference: ItemReference(answer: "Two", exact: "2"),
                        rubric: [RubricCriterion(id: "c1", text: "Gets two")]),
        ]
        return item
    }

    @Test func servesEachVersionOnceThenTheOneSeenLongestAgo() {
        let item = itemWithVariants()
        let v1 = item.id + "~v1", v2 = item.id + "~v2"
        #expect(nextVariant(item, history: []) == nil, "the item itself first")
        #expect(nextVariant(item, history: [VariantUse(variantId: nil, at: 10)]) == v1)
        #expect(nextVariant(item, history: [VariantUse(variantId: nil, at: 10), VariantUse(variantId: v1, at: 20)]) == v2)
        let all = [VariantUse(variantId: nil, at: 10), VariantUse(variantId: v1, at: 20), VariantUse(variantId: v2, at: 30)]
        #expect(nextVariant(item, history: all) == nil)
        #expect(nextVariant(item, history: all + [VariantUse(variantId: nil, at: 40)]) == v1)
    }

    @Test func anItemWithoutVariantsIsAlwaysItself() {
        let item = pack.allItems[0]
        #expect(nextVariant(item, history: [VariantUse(variantId: nil, at: 1), VariantUse(variantId: "gone~v1", at: 2)]) == nil)
    }

    @Test func servingAVariantKeepsTheCardButSwapsTheProblem() {
        let item = itemWithVariants()
        let served = item.serving(item.id + "~v2")
        #expect(served.id == item.id && served.conceptId == item.conceptId && served.type == item.type)
        #expect(served.prompt == "Variant two" && served.reference.exact == "2" && served.rubric.map(\.text) == ["Gets two"])
        #expect(item.serving(nil) == item)
        #expect(item.serving("unknown") == item)
    }

    @Test func variantsDecodeFromAPackAndAreOptional() throws {
        let json = #"{"id":"i","conceptId":"c","type":"apply","bloom":"apply","prompt":"p","reference":{"answer":"a"},"rubric":[],"spans":[],"generatorVersion":"g","hash":"h","variants":[{"id":"i~v1","prompt":"q","reference":{"answer":"b","exact":"3"},"rubric":[{"id":"c1","text":"t"}]}]}"#
        let item = try JSONDecoder().decode(Item.self, from: Data(json.utf8))
        #expect(item.variants?.first?.reference.exact == "3")
        let plain = try JSONDecoder().decode(Item.self, from: Data(json.replacingOccurrences(of: #","variants":[{"id":"i~v1","prompt":"q","reference":{"answer":"b","exact":"3"},"rubric":[{"id":"c1","text":"t"}]}]"#, with: "").utf8))
        #expect(plain.variants == nil)
    }

    // MARK: Mastery on mixed evidence

    @Test func lessonChecksDoNotEarnMasteredButMixedAnswersDo() {
        var s = ConceptState(courseId: "k", conceptId: "c", mastery: 0.95, successfulSessions: 3)
        for day in ["2026-01-01", "2026-01-03", "2026-01-06"] {
            s = updateConceptStateAfterReceipt(s, ConceptReceipt(rating: .good, assisted: false, day: day))
        }
        #expect(isMastered(s.mastery, unassistedPassRate(s)), "the old rule would call it mastered")
        #expect(!isMasteredOnMixedEvidence(s), "but none of that was out of context")
        s = updateConceptStateAfterReceipt(s, ConceptReceipt(rating: .good, assisted: false, day: "2026-01-10", mixed: true))
        #expect(!isMasteredOnMixedEvidence(s), "one mixed pass is not enough")
        s = updateConceptStateAfterReceipt(s, ConceptReceipt(rating: .easy, assisted: false, day: "2026-01-20", mixed: true))
        #expect(isMasteredOnMixedEvidence(s))
        #expect(s.mixedN == 2 && s.mixedPass == 2)
    }

    @Test func assistedAnswersNeverCountAsMixedEvidence() {
        var s = ConceptState(courseId: "k", conceptId: "c", mastery: 0.95)
        s = updateConceptStateAfterReceipt(s, ConceptReceipt(rating: .good, assisted: true, day: "d", mixed: true))
        #expect(s.mixedN == nil)
        s = updateConceptStateAfterReceipt(s, ConceptReceipt(rating: .again, assisted: false, day: "d", mixed: true))
        #expect(s.mixedN == 1 && s.mixedPass == 0 && mixedPassRate(s) == 0)
    }

    @Test func conceptStatesWrittenBeforeMixedCountersStillDecode() throws {
        let json = #"{"courseId":"k","conceptId":"c","mastery":0.5,"successfulSessions":1,"misconceptions":[],"assistedPass":0,"assistedN":0,"unassistedPass":1,"unassistedN":1,"updatedAt":0}"#
        let s = try JSONDecoder().decode(ConceptState.self, from: Data(json.utf8))
        #expect(s.mixedN == nil && mixedPassRate(s) == 0)
    }
}
