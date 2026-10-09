import Foundation
import Testing
@testable import EpistemicsCore

/// Session reducers replayed against the TypeScript (lesson.json, sessions.json). Every lesson state is
/// compared by digest (sha256 of canonical JSON, nulls dropped) and every 12th one field by field;
/// every effect is compared exactly.
@Suite struct SessionConformanceTests {
    struct Step: Decodable {
        var event: LessonEvent
        var stateDigest: String
        var state: LessonState?
        var effects: [LessonEffect]
    }
    struct Script: Decodable {
        var lessonId: String?
        var conceptId: String?
        var lesson: Lesson?
        var `init`: LessonState
        var steps: [Step]
    }
    struct Control: Decodable {
        var lessonId: String
        var conceptIndex: Int
        var phase: LessonPhase
        var hintLevel: Int
        var control: TutorControl
    }
    struct LessonFixture: Decodable {
        var scripts: [Script]
        var remediations: [Script]
        var controls: [Control]
    }

    static let lessonFx = try! Fixtures.decode(LessonFixture.self, "lesson.json")

    func replay(_ script: Script, _ lesson: Lesson) throws {
        var state = script.`init`
        for (i, step) in script.steps.enumerated() {
            let r = reduceLesson(state, step.event, lesson)
            #expect(r.effects == step.effects, "\(lesson.id) step \(i) \(step.event): effects differ")
            if let expected = step.state { #expect(r.state == expected, "\(lesson.id) step \(i): state differs") }
            #expect(try digest(r.state) == step.stateDigest, "\(lesson.id) step \(i): state digest differs")
            state = r.state
            if r.effects != step.effects { return }
        }
    }

    @Test func scriptedLessonsOverTheBundledPack() throws {
        #expect(Self.lessonFx.scripts.count == 16)
        var phases = Set<LessonPhase>()
        for script in Self.lessonFx.scripts {
            let lesson = Fixtures.pack.lesson(script.lessonId!)!
            try replay(script, lesson)
            for s in script.steps { if let st = s.state { phases.insert(st.phase) } }
            #expect(script.steps.last?.state?.done == true)
        }
        #expect(phases.contains(.remediate) && phases.contains(.wrap))
        let effects = Self.lessonFx.scripts.flatMap { $0.steps.flatMap(\.effects) }
        #expect(effects.contains { if case .scheduleRemediation = $0 { true } else { false } })
        #expect(Self.lessonFx.scripts.flatMap(\.steps).contains { $0.event == .leakDetected })
    }

    @Test func remediationMiniLessons() throws {
        for script in Self.lessonFx.remediations {
            let concept = Fixtures.pack.concept(script.conceptId!)!
            let ix = Self.lessonFx.remediations.firstIndex { $0.conceptId == script.conceptId }!
            let plan = composeRemediation(concept, sessionId: "r\(ix)", courseId: "course", scaffolding: [Scaffolding.novice, .developing, .advanced][ix % 3],
                                          learnerMisconceptions: ix % 2 == 1 ? [concept.misconceptions.first?.tag ?? "x"] : nil)
            #expect(plan.lesson == script.lesson)
            #expect(plan.state == script.`init`)
            try replay(script, plan.lesson)
        }
    }

    @Test func tutorControlForEveryPhaseAndHintLevel() {
        for c in Self.lessonFx.controls {
            let lesson = Fixtures.pack.lesson(c.lessonId)!
            var state = createLessonState(CreateLessonStateInput(sessionId: "s", courseId: "c", lesson: lesson, scaffolding: .novice))
            state.conceptIndex = c.conceptIndex
            state.phase = c.phase
            state.hintLevel = c.hintLevel
            state.guidingIndex = c.hintLevel + 1
            state.workedExampleShown = c.hintLevel > 1
            state.summaryText = c.hintLevel > 0 ? " a\n summary " : nil
            state.misconceptions = [lesson.concepts[0].id: [lesson.concepts[0].misconceptions[0].tag]]
            let got = buildTutorControl(state, lesson, c.hintLevel == 2 ? ControlOptions(preamble: "  Feedback first.  ") : ControlOptions())
            #expect(got == c.control, "\(c.lessonId) #\(c.conceptIndex) \(c.phase) h\(c.hintLevel)")
        }
    }

    // MARK: sessions.json

    static let fx = try! Fixtures.json("sessions.json")

    @Test func checkpointComposition() throws {
        for c in Self.fx["compositions"]!.array {
            let unit = Fixtures.pack.units.first { $0.id == c["unitId"]!.string }!
            let previous = c["previousUnitIds"]!.array.map { id in Fixtures.pack.units.first { $0.id == id.string }! }
            let items = composeCheckpoint(ComposeCheckpointInput(
                unit: unit, previousUnits: previous, conceptMastery: try c["mastery"]!.decoded([String: Double].self),
                size: c["size"] == .null ? nil : c["size"]!.int, rng: seededRng(c["seed"]!.int)))
            #expect(items.map(\.id) == c["itemIds"]!.array.map(\.string), "seed \(c["seed"]!.int)")
        }
    }

    @Test func checkpointRuns() throws {
        for run in Self.fx["checkpointRuns"]!.array {
            let items = run["itemIds"]!.array.map { Fixtures.pack.item($0.string)! }
            var state = createCheckpointState(sessionId: "s", courseId: "c", unitId: Fixtures.pack.units[1].id, items: items)
            for (i, step) in run["steps"]!.array.enumerated() {
                let r = reduceCheckpoint(state, try step["event"]!.decoded(CheckpointEvent.self))
                #expect(r.effects == (try step["effects"]!.decoded([CheckpointEffect].self)), "step \(i)")
                #expect(r.state == (try step["state"]!.decoded(CheckpointState.self)), "step \(i)")
                state = r.state
            }
            #expect(state.done)
        }
    }

    @Test func diagnosticRuns() throws {
        for d in Self.fx["diagnostics"]!.array {
            let cur = d["curriculum"]!.string == "pack" ? Fixtures.pack : Fixtures.core
            var s = createDiagnostic(cur)
            #expect(s == (try d["initial"]!.decoded(DiagnosticState.self)))
            for p in d["probes"]!.array {
                #expect(nextProbe(s) == (try p[0].decoded(DiagnosticProbe.self)))
                s = recordResult(s, p[0]["conceptId"]!.string, p[1].bool)
            }
            #expect(nextProbe(s) == nil)
            #expect(s == (try d["final"]!.decoded(DiagnosticState.self)))
            #expect(diagnosticResult(s) == (try d["result"]!.decoded(DiagnosticResult.self)))
        }
    }

    @Test func teachbackRuns() throws {
        for t in Self.fx["teachbacks"]!.array {
            var state = createTeachbackState(sessionId: "s", courseId: "c", concept: Fixtures.pack.concept(t["conceptId"]!.string)!)
            for (i, step) in t["steps"]!.array.enumerated() {
                let r = reduceTeachback(state, try step["event"]!.decoded(TeachbackEvent.self))
                #expect(r.effects == (try step["effects"]!.decoded([TeachbackEffect].self)), "step \(i)")
                #expect(r.state == (try step["state"]!.decoded(TeachbackState.self)), "step \(i)")
                state = r.state
            }
        }
    }

    @Test func learnerModelSummaryAndRendering() throws {
        for m in Self.fx["learnerModels"]!.array {
            let i = m["input"]!
            let cal = i["calibration"]!, recent = i["recent"]!, prefs = i["preferences"]
            let input = SummarizeLearnerModelInput(
                course: try i["course"]!.decoded(Course.self), conceptStates: try i["conceptStates"]!.decoded([ConceptState].self),
                conceptNames: try i["conceptNames"]!.decoded([String: String].self),
                calibration: CalibrationSummary(brier: cal["brier"]!.double, overconfidenceBias: cal["overconfidenceBias"]!.double, n: cal["n"]!.int),
                lastLessonSummary: recent["lastLessonSummary"]?.string, openQuestions: recent["openQuestions"]!.array.map(\.string),
                verbosity: prefs?["verbosity"].map { LearnerModelSummary.Preferences.Verbosity(rawValue: $0.string)! },
                examplesDomain: prefs?["examplesDomain"]?.string)
            let summary = summarizeLearnerModel(input)
            #expect(summary == (try m["summary"]!.decoded(LearnerModelSummary.self)))
            #expect(renderLearnerModel(summary, m["focus"]!.array.map(\.string)) == m["text"]!.string)
        }
    }

    @Test func onboardingConceptMatcher() {
        for c in Self.fx["conceptsNamed"]!.array {
            let cur = c[0].string == "pack" ? Fixtures.pack : Fixtures.tiny
            #expect(conceptsNamed(cur, c[1].string, limit: c[2].int) == c[3].array.map(\.string), "\(c[0].string): \(c[1].string)")
        }
    }
}
