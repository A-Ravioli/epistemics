import Foundation
import Testing
@testable import EpistemicsCore

/// The worked-example plan and per-lesson scaffolding (Session/WorkedExample.swift).
@Suite struct WorkedExampleTests {
    let pack = Fixtures.pack

    @Test func noviceStudiesTheFirstExampleWholeThenFadesOneStepAtATime() {
        let plans = (0..<5).map { workedExamplePlan(scaffolding: .novice, conceptIndex: $0, stepCount: 4) }
        #expect(plans[0].studyFirst && plans[0].typesetSteps == 4)
        #expect(plans.map(\.learnerSteps) == [0, 1, 2, 3, 3], "one step fewer each time, never the first step")
        #expect(plans.allSatisfy { $0.typesetSteps + $0.learnerSteps == 4 && $0.typesetSteps >= 1 })
    }

    @Test func aDevelopingLearnerStartsOneStepFurtherOn() {
        #expect(workedExamplePlan(scaffolding: .developing, conceptIndex: 0, stepCount: 4).learnerSteps == 1)
        #expect(workedExamplePlan(scaffolding: .developing, conceptIndex: 1, stepCount: 4).learnerSteps == 2)
        #expect(workedExamplePlan(scaffolding: .developing, conceptIndex: 0, stepCount: 1).learnerSteps == 0,
                "a one-step example cannot be faded")
    }

    @Test func anAdvancedLearnerSeesTheExampleOnlyAfterAnAttempt() {
        let p = workedExamplePlan(scaffolding: .advanced, conceptIndex: 0, stepCount: 4)
        #expect(p.foldedUntilAttempt && p.typesetSteps == 4 && p.learnerSteps == 0 && !p.studyFirst)
    }

    @Test func noStepsNoPlan() {
        #expect(workedExamplePlan(scaffolding: .novice, conceptIndex: 2, stepCount: 0) == WorkedExamplePlan(typesetSteps: 0, learnerSteps: 0, foldedUntilAttempt: false))
    }

    @Test func theCardIsPutAwayWhenTheLearnerAnswersAlone() {
        #expect(conceptCardAllowed(.develop) && conceptCardAllowed(.extend) && conceptCardAllowed(.remediate))
        for phase: LessonPhase in [.prime, .probe, .check, .consolidate, .wrap] { #expect(!conceptCardAllowed(phase)) }
    }

    // MARK: Scaffolding per lesson

    func lessonWithOutsidePrereqs() -> (Lesson, [String]) {
        for l in pack.allLessons {
            let own = Set(l.concepts.map(\.id))
            let outside = pack.edges.filter { $0.kind == .prereq && own.contains($0.to) && !own.contains($0.from) }.map(\.from)
            if !outside.isEmpty { return (l, Array(Set(outside))) }
        }
        fatalError("the pack has lessons that build on earlier ones")
    }

    @Test func supportFollowsHowSecureThePrerequisitesAre() {
        let (lesson, prereqs) = lessonWithOutsidePrereqs()
        func level(_ m: Double) -> Scaffolding {
            lessonScaffolding(lesson, pack, Dictionary(uniqueKeysWithValues: prereqs.map { ($0, m) }), courseDefault: .advanced)
        }
        #expect(level(0.72) == .novice, "just unlocked")
        #expect(level(0.85) == .developing)
        #expect(level(0.97) == .advanced)
    }

    @Test func aLessonWithNothingBeforeItKeepsTheCourseLevel() {
        let first = pack.allLessons[0]
        #expect(lessonScaffolding(first, pack, [:], courseDefault: .developing) == .developing)
        #expect(lessonScaffolding(first, pack, [:], courseDefault: .novice) == .novice)
    }
}
