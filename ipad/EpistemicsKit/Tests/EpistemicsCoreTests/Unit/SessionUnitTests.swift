import Foundation
import Testing
@testable import EpistemicsCore

// Ports of web/packages/core/test/session/*.test.ts, over the same fixture curriculum (core-fixture.json).

enum F {
    static let cur = Fixtures.core
    static func c(_ id: String) -> Concept { cur.concept(id)! }
    static var c1: Concept { c("c1") }
    static var c2: Concept { c("c2") }
    static var shortLesson: Lesson { Lesson(id: "LS", ordinal: 0, title: "Short Lesson", concepts: [c1, c2]) }
    static var unit1: EpistemicsCore.Unit { cur.units[0] }
    static var unit2: EpistemicsCore.Unit { cur.units[1] }
}

func observer(attemptMade: Bool = true, offTopic: Bool = false, misconceptionTags: [String] = [], keyIdeaStated: Bool = false,
              priorKnowledgeElicited: Bool = false) -> ObserverResult {
    ObserverResult(attemptMade: attemptMade, offTopic: offTopic, misconceptionTags: misconceptionTags, keyIdeaStated: keyIdeaStated,
                   priorKnowledgeElicited: priorKnowledgeElicited)
}

func grade(_ score: Double, tags: [String] = []) -> GradeResult {
    GradeResult(criteria: [CriterionResult(id: "c1", met: score >= 0.5, evidence: "quoted")], score: score, misconceptionTags: tags,
                feedback: "feedback for score \(jsNumberString(score))", confidence: 0.9)
}

/// Applies events, collects effects, answers grade_item with a scripted grader (as the TS test Driver).
final class Driver {
    typealias Grader = (GradeItemEffect) -> (score: Double, rating: Rating, tags: [String])
    var state: LessonState
    var log: [LessonEffect] = []
    let lesson: Lesson
    let grader: Grader

    init(_ lesson: Lesson, _ scaffolding: Scaffolding = .developing, grader: @escaping Grader = { _ in (0.9, .good, []) }) {
        self.lesson = lesson
        self.grader = grader
        state = createLessonState(CreateLessonStateInput(sessionId: "s1", courseId: "course1", lesson: lesson, scaffolding: scaffolding))
    }

    @discardableResult func send(_ event: LessonEvent) -> [LessonEffect] {
        let r = reduceLesson(state, event, lesson)
        state = r.state
        log += r.effects
        var out = r.effects
        for e in r.effects {
            if case .callTutor(let control) = e { out += send(.tutorTurn(content: "(tutor) \(control.instruction.prefix(40))")) }
            if case .gradeItem(let g) = e {
                let res = grader(g)
                out += send(.grade(itemKind: g.itemKind, itemId: g.itemId, grade: grade(res.score, tags: res.tags), rating: res.rating))
            }
        }
        return out
    }

    @discardableResult func turn(_ content: String, _ obs: ObserverResult = observer(), _ confidence: Confidence? = nil) -> [LessonEffect] {
        let effs = send(.learnerTurn(content: content, confidence: confidence))
        if effs.contains(where: { if case .callObserver = $0 { true } else { false } }) { return effs + send(.observer(obs)) }
        return effs
    }

    var phase: LessonPhase { state.phase }
    var conceptId: String? { state.currentConceptId }
    var lastControl: TutorControl? {
        for e in log.reversed() { if case .callTutor(let c) = e { return c } }
        return nil
    }
}

extension LessonEffect {
    var gradeItem: GradeItemEffect? { if case .gradeItem(let g) = self { g } else { nil } }
    var receipt: RecordReceiptEffect? { if case .recordReceipt(let r) = self { r } else { nil } }
    var message: String? { if case .showMessage(let t) = self { t } else { nil } }
    var control: TutorControl? { if case .callTutor(let c) = self { c } else { nil } }
}

@Suite struct LessonReducerTests {
    func runAdvancedConcept(_ d: Driver) {
        #expect(d.phase == .prime)
        d.turn("my guess", observer(), .fairlySure)
        d.turn("I know a bit", observer(priorKnowledgeElicited: true))
        d.turn("the key idea is ...", observer(keyIdeaStated: true))
        d.turn("the principle is ...")
        d.turn("transfer attempt", observer(attemptMade: true))
        #expect(d.phase == .check)
        d.turn("check answer", observer(), .certain)
    }

    @Test func advancedLearnerHappyPath() {
        let d = Driver(F.shortLesson, .advanced)
        let start = d.send(.start)
        #expect(d.phase == .prime)
        let first = start[0].control!
        #expect(first.instruction.contains(F.c1.script.pretest.prompt) && first.instruction.contains("verbatim") && first.maxWords == 120)

        let prime = d.turn("my guess", observer(), .fairlySure)
        let gi = prime.compactMap(\.gradeItem).first!
        #expect(gi.itemKind == .pretest && !gi.assisted && gi.rubricSource == .scriptPretest && gi.confidence == .fairlySure && gi.conceptId == "c1")
        #expect(prime.compactMap(\.message).first == LETS_FIND_OUT)
        #expect(d.state.pretestRecord["c1"] == PretestRecord(answer: "my guess", confidence: .fairlySure))
        #expect(d.phase == .probe)
        #expect(d.log.compactMap(\.receipt).filter { $0.itemKind == .pretest }.count == 1)

        d.turn("I know a bit", observer(priorKnowledgeElicited: true))
        #expect(d.phase == .develop && d.lastControl!.instruction.contains("hint level 0"))
        d.turn("the key idea is ...", observer(keyIdeaStated: true))
        #expect(d.phase == .consolidate && d.state.hintLevel == 0)
        let cons = d.turn("the principle is ...").compactMap(\.gradeItem).first!
        #expect(cons.itemKind == .consolidate && cons.itemId == "c1-i1" && cons.rubricSource == .item)
        #expect(d.phase == .extend && d.lastControl!.instruction.contains(F.c1.script.transfer.prompt))
        let ext = d.turn("transfer attempt", observer(attemptMade: true)).compactMap(\.gradeItem).first!
        #expect(ext.itemKind == .transfer && ext.assisted && ext.rubricSource == .scriptTransfer)
        #expect(d.phase == .check && d.lastControl!.instruction.contains(F.c1.script.pretest.isomorph))

        let check = d.send(.learnerTurn(content: "check answer", confidence: .certain))
        #expect(!check.contains { $0.control?.conceptId == "c1" })
        #expect(check.compactMap(\.gradeItem).first!.itemKind == .check && check.compactMap(\.gradeItem).first!.confidence == .certain)
        #expect(check.contains(.activateItems(conceptId: "c1", firstRating: .good)))
        #expect(d.state.checkResults["c1"] == CheckResult(rating: .good, score: 0.9))
        #expect(d.conceptId == "c2" && d.phase == .prime)

        runAdvancedConcept(d)
        #expect(d.phase == .wrap && d.log.last == .requestSummary)
        let sum = d.send(.summarySubmitted(text: "my summary of the lesson"))
        let sc = sum.compactMap(\.control).first!
        #expect(sc.maxWords == 80 && sc.instruction.contains("my summary of the lesson"))
        #expect(sum.contains(.requestJol(conceptIds: ["c1", "c2"])) && d.state.jolPending)
        let jol = d.send(.jolSubmitted(predictions: ["c1": 0.9, "c2": 0.4]))
        guard case .lessonComplete(let results) = jol.last! else { Issue.record("no lesson_complete"); return }
        #expect(results.summaryText == "my summary of the lesson" && Set(results.checkResults.keys) == ["c1", "c2"])
        #expect(results.pretestRecord["c2"] != nil && results.jol == ["c1": 0.9, "c2": 0.4])
        #expect(d.state.done && d.phase == .done)
        #expect(d.send(.learnerTurn(content: "hello?")).isEmpty)
    }

    @Test func noviceSeesAWorkedExampleFirst() {
        let d = Driver(F.shortLesson, .novice)
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("nothing really", observer(priorKnowledgeElicited: true))
        let ctl = d.lastControl!
        #expect(d.phase == .develop && ctl.maxWords == 220 && ctl.instruction.contains("Present the worked example steps"))
        #expect(ctl.instruction.contains("explain step 1") && ctl.instruction.contains(F.c1.script.workedExample.steps[0]))
        d.turn("step one means...", observer(attemptMade: true))
        #expect(d.lastControl!.maxWords == 120 && d.lastControl!.instruction.contains("Guiding question") && d.state.workedExampleShown)
    }

    @Test func hintLadderClimbsOnlyOnAttempts() {
        let d = Driver(F.shortLesson)
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("hmm")
        d.turn("hmm again")
        #expect(d.phase == .develop && d.state.hintLevel == 0)
        d.turn("what do you mean?", observer(attemptMade: false))
        #expect(d.state.hintLevel == 0 && d.phase == .develop)
        var levels: [Int] = []
        for i in 0..<3 {
            d.turn("wrong attempt \(i)", observer(attemptMade: true))
            levels.append(d.state.hintLevel)
            #expect(d.phase == .develop && d.lastControl!.hintLevel == d.state.hintLevel)
            #expect(d.lastControl!.allowHintContent == F.c1.script.hints[d.state.hintLevel - 1])
        }
        #expect(levels == [1, 2, 3] && d.lastControl!.instruction.contains("Bottom-out hint"))
        d.turn("final attempt", observer(attemptMade: true))
        #expect(d.phase == .consolidate)
        #expect(d.log.compactMap(\.control).map(\.hintLevel).max() == MAX_HINT_LEVEL)
    }

    @Test func advancedWithholdsHintsForTwoAttempts() {
        let d = Driver(F.shortLesson, .advanced)
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("yes", observer(priorKnowledgeElicited: true))
        d.turn("attempt 1", observer(attemptMade: true))
        #expect(d.state.hintLevel == 0)
        d.turn("attempt 2", observer(attemptMade: true))
        #expect(d.state.hintLevel == 1)
    }

    @Test func giveUpPaths() {
        let d = Driver(F.shortLesson)
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("prior", observer(priorKnowledgeElicited: true))
        let effs = d.send(.giveUp)
        #expect(d.phase == .consolidate && effs.compactMap(\.message).isEmpty)
        #expect(effs.compactMap(\.control).first!.instruction.contains("Do not reveal the answer"))
        #expect(!effs.compactMap(\.control).contains { $0.instruction.contains("REFERENCE(") })

        let a = Driver(F.shortLesson, .advanced)
        a.send(.start)
        a.turn("guess", observer(), .guess)
        a.turn("prior", observer(priorKnowledgeElicited: true))
        a.turn("key idea", observer(keyIdeaStated: true))
        a.turn("principle")
        #expect(a.phase == .extend)
        let r1 = a.send(.giveUp).compactMap(\.receipt).first!
        #expect(r1.itemKind == .transfer && r1.rating == .again && r1.assisted && a.phase == .check)
        let r2 = a.send(.giveUp).compactMap(\.receipt).first!
        #expect(r2.itemKind == .check && r2.rating == .again && !r2.assisted)
        #expect(a.state.checkResults["c1"] == CheckResult(rating: .again, score: 0) && a.phase == .remediate)
    }

    @Test func checkFailRemediatesOnceThenSchedules() {
        let d = Driver(F.shortLesson, .advanced) { g in g.itemKind == .check ? (0.2, .again, ["c1-mc-a"]) : (0.9, .good, []) }
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("prior", observer(priorKnowledgeElicited: true))
        d.turn("key idea", observer(keyIdeaStated: true))
        d.turn("principle")
        d.turn("transfer", observer(attemptMade: true))
        let fail1 = d.turn("wrong check answer", observer(), .certain)
        #expect(fail1.compactMap(\.message).contains("feedback for score 0.2"))
        #expect(d.phase == .remediate && d.conceptId == "c1" && d.state.remediationCount["c1"] == 1)
        #expect(d.state.misconceptions["c1"]!.contains("c1-mc-a"))
        #expect(d.lastControl!.instruction.contains("c1-mc-a") && d.lastControl!.instruction.contains(F.c1.misconceptions[0].remedy))
        #expect(!fail1.contains { if case .activateItems = $0 { true } else { false } })
        d.turn("oh I see, it is ...", observer(keyIdeaStated: true))
        #expect(d.phase == .check && d.lastControl!.instruction.contains(F.c1.script.pretest.isomorph))
        let fail2 = d.turn("still wrong", observer(), .fairlySure)
        #expect(fail2.contains(.scheduleRemediation(conceptId: "c1")) && fail2.contains(.activateItems(conceptId: "c1", firstRating: .again)))
        #expect(d.conceptId == "c2" && d.phase == .prime && d.state.remediationCount["c1"] == 1)
    }

    @Test func consolidateLoopsAtMostTwice() {
        let d = Driver(F.shortLesson, .advanced) { g in g.itemKind == .consolidate ? (0.3, .again, []) : (0.9, .good, []) }
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("prior", observer(priorKnowledgeElicited: true))
        d.turn("key idea", observer(keyIdeaStated: true))
        d.turn("bad principle 1")
        #expect(d.phase == .consolidate && d.lastControl!.instruction.contains("corrective feedback"))
        d.turn("bad principle 2")
        #expect(d.phase == .consolidate)
        d.turn("bad principle 3")
        #expect(d.phase == .extend)
    }

    @Test func leakRegenerationThenCannedHint() {
        let d = Driver(F.shortLesson)
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("prior", observer(priorKnowledgeElicited: true))
        d.turn("attempt", observer(attemptMade: true))
        #expect(d.state.hintLevel == 1)
        let original = d.lastControl!
        let leak1 = reduceLesson(d.state, .leakDetected, F.shortLesson)
        #expect(leak1.effects.count == 1)
        let re = leak1.effects[0].control!
        #expect(re.instruction.contains("STRICT REGENERATION 1") && re.instruction.contains(original.instruction) && re.hintLevel == 1)
        #expect(leak1.state.regenerations == 1)
        let leak2 = reduceLesson(leak1.state, .leakDetected, F.shortLesson)
        #expect(leak2.effects == [.showMessage(text: F.c1.script.hints[0])] && leak2.state.regenerations == 0)
        #expect(reduceLesson(leak2.state, .tutorTurn(content: "ok"), F.shortLesson).state.regenerations == 0)
    }

    @Test func stateRoundTripsThroughJSONAndResumes() throws {
        let d = Driver(F.shortLesson, .novice)
        d.send(.start)
        d.turn("guess", observer(), .fairlySure)
        d.turn("prior", observer(priorKnowledgeElicited: true))
        d.turn("step one is", observer(attemptMade: true))
        let revived = try JSONDecoder().decode(LessonState.self, from: JSONEncoder().encode(d.state))
        #expect(revived == d.state)
        let a = reduceLesson(d.state, .observer(observer(keyIdeaStated: true)), F.shortLesson)
        let b = reduceLesson(revived, .observer(observer(keyIdeaStated: true)), F.shortLesson)
        #expect(a == b && b.state.phase == .consolidate)
        let effects = try JSONDecoder().decode([LessonEffect].self, from: JSONEncoder().encode(d.log))
        #expect(effects == d.log)
    }

    @Test func defensiveAgainstStrayEvents() {
        let d = Driver(F.shortLesson)
        let s0 = d.state
        #expect(reduceLesson(s0, .learnerTurn(content: "before start"), F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(s0, .observer(observer()), F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(s0, .summarySubmitted(text: "x"), F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(s0, .jolSubmitted(predictions: [:]), F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(s0, .leakDetected, F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(s0, .grade(itemKind: .check, itemId: "nope", grade: grade(1), rating: .easy), F.shortLesson).effects.isEmpty)
        d.send(.start)
        let started = d.state
        #expect(reduceLesson(started, .observer(observer()), F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(started, .start, F.shortLesson).effects.isEmpty)
        #expect(reduceLesson(started, .grade(itemKind: .pretest, itemId: "c1#pretest", grade: grade(1), rating: .easy), F.shortLesson).effects.isEmpty)
        #expect(started != s0)
    }

    @Test func neverEmitsReferenceText() throws {
        let d = Driver(F.shortLesson, .novice) { g in g.itemKind == .check ? (0.1, .again, []) : (0.5, .hard, []) }
        d.send(.start)
        for cid in ["c1", "c2"] {
            d.turn("guess", observer(), .guess)
            d.turn("hmm")
            d.turn("hmm")
            for _ in 0..<5 where d.phase == .develop { d.turn("try", observer(attemptMade: true)) }
            for _ in 0..<4 where d.phase == .consolidate { d.turn("principle?") }
            d.turn("transfer", observer(attemptMade: true))
            d.turn("check", observer(), .certain)
            #expect(d.phase == .remediate)
            d.turn("a")
            d.turn("b")
            #expect(d.phase == .check)
            d.turn("check again", observer(), .guess)
            #expect(d.conceptId != cid)
        }
        #expect(d.phase == .wrap)
        let text = String(decoding: try JSONEncoder().encode(d.log), as: UTF8.self)
        #expect(!text.contains("REFERENCE(") && !text.contains("reference 1 for"))
        for (i, e) in d.log.enumerated() where e.gradeItem?.itemKind == .check {
            #expect(d.log[i + 1].receipt != nil)
        }
    }

    @Test func tutorControlBudgets() {
        let state = createLessonState(CreateLessonStateInput(sessionId: "s", courseId: "c", lesson: F.shortLesson, scaffolding: .novice))
        let prime = buildTutorControl(state, F.shortLesson)
        #expect(prime.phase == .prime && prime.conceptId == "c1" && prime.hintLevel == 0 && prime.objectiveIds == ["c1-o1", "c1-o2"] && prime.maxWords == 120)
        var dev = state
        dev.phase = .develop
        #expect(buildTutorControl(dev, F.shortLesson).maxWords == 220)
        dev.workedExampleShown = true
        dev.hintLevel = 2
        let dev2 = buildTutorControl(dev, F.shortLesson)
        #expect(dev2.maxWords == 120 && dev2.allowHintContent == F.c1.script.hints[1] && dev2.instruction.contains("hint level 2 of 3"))
        var wrap = state
        wrap.phase = .wrap
        wrap.conceptIndex = 2
        wrap.summaryText = "sum"
        #expect(buildTutorControl(wrap, F.shortLesson).maxWords == 80)
        var check = state
        check.phase = .check
        check.conceptIndex = 1
        #expect(buildTutorControl(check, F.shortLesson).instruction.contains(F.c2.script.pretest.isomorph))
    }

    @Test func misconceptionsMergeMostRecentFirst() {
        let d = Driver(F.shortLesson)
        d.state = createLessonState(CreateLessonStateInput(sessionId: "s", courseId: "c", lesson: F.shortLesson, scaffolding: .developing,
                                                           learnerMisconceptions: ["c1": ["old-tag"]]))
        d.send(.start)
        d.turn("guess", observer(), .guess)
        d.turn("prior", observer(misconceptionTags: ["c1-mc-b"], priorKnowledgeElicited: true))
        #expect(d.state.misconceptions["c1"] == ["c1-mc-b", "old-tag"])
    }
}

@Suite struct CheckpointTests {
    @Test func compositionSplitsSeventyThirty() {
        let mastery = ["c1": 0.9, "c2": 0.3, "c3": 0.6, "c4": 0.95, "c5": 0.2]
        let items = composeCheckpoint(ComposeCheckpointInput(unit: F.unit2, previousUnits: [F.unit1], conceptMastery: mastery, size: 10, rng: seededRng(7)))
        let unitConcepts: Set = ["c6", "c7", "c8"]
        let fromUnit = items.filter { unitConcepts.contains($0.conceptId) }, fromPrev = items.filter { !unitConcepts.contains($0.conceptId) }
        #expect(items.count == 10 && fromUnit.count == 7 && fromPrev.count == 3)
        #expect(items.allSatisfy { !CHECKPOINT_EXCLUDED_TYPES.contains($0.type) })
        #expect(Set(fromUnit.map(\.conceptId)) == unitConcepts)
        #expect(fromPrev.contains { $0.conceptId == "c5" } && fromPrev.contains { $0.conceptId == "c2" } && !fromPrev.contains { $0.conceptId == "c4" })
        #expect(fromPrev.allSatisfy { $0.type == .discriminate || $0.type == .apply })
        #expect(Set(items.map(\.id)).count == items.count)
        let a = composeCheckpoint(ComposeCheckpointInput(unit: F.unit1, previousUnits: [], conceptMastery: [:], size: 12, rng: seededRng(1)))
        let b = composeCheckpoint(ComposeCheckpointInput(unit: F.unit1, previousUnits: [], conceptMastery: [:], size: 12, rng: seededRng(1)))
        #expect(a.map(\.id) == b.map(\.id) && a.count == 9)
    }

    @Test func reducerGradesAndScores() {
        let items = composeCheckpoint(ComposeCheckpointInput(unit: F.unit1, previousUnits: [], conceptMastery: [:], size: 6, rng: seededRng(3)))
        var r = reduceCheckpoint(createCheckpointState(sessionId: "s", courseId: "c", unitId: "U1", items: items), .start)
        #expect(r.effects == [.presentItem(itemId: items[0].id, conceptId: items[0].conceptId, index: 0, total: 6)])
        let scores = ["c1": 1.0, "c2": 0.5, "c3": 0.9, "c4": 0.7, "c5": 0.85]
        var completed = false
        for item in items {
            let r1 = reduceCheckpoint(r.state, .answerSubmitted(itemId: item.id, answer: "ans", confidence: .fairlySure))
            #expect(r1.effects == [.gradeItem(itemId: item.id, conceptId: item.conceptId, answer: "ans", confidence: .fairlySure)])
            #expect(reduceCheckpoint(r1.state, .grade(itemId: "nope", grade: grade(1), rating: .easy)).effects.isEmpty)
            let score = scores[item.conceptId]!
            r = reduceCheckpoint(r1.state, .grade(itemId: item.id, grade: grade(score), rating: score >= 0.75 ? .good : .again))
            if case .recordReceipt(let id, _, _, _, _, let rating) = r.effects[0] { #expect(id == item.id && rating == (score >= 0.75 ? .good : .again)) }
            completed = completed || r.effects.contains { if case .checkpointComplete = $0 { true } else { false } }
        }
        #expect(r.state.done && completed)
        let result = scoreCheckpoint(r.state)
        for (id, res) in result.perConcept { #expect(abs(res.score - scores[id]!) < 1e-9 && res.passed == (scores[id]! >= 0.8)) }
        #expect(result.reopen == scores.keys.filter { scores[$0]! < 0.8 && result.perConcept[$0] != nil }.sorted())
        #expect(reduceCheckpoint(r.state, .finish).effects.isEmpty)

        let few = composeCheckpoint(ComposeCheckpointInput(unit: F.unit1, previousUnits: [], conceptMastery: [:], size: 4, rng: seededRng(9)))
        let s0 = reduceCheckpoint(createCheckpointState(sessionId: "s", courseId: "c", unitId: "U1", items: few), .start).state
        guard case .checkpointComplete(let done) = reduceCheckpoint(s0, .finish).effects[0] else { Issue.record("no completion"); return }
        #expect(done.reopen.count == done.perConcept.count && done.perConcept.values.allSatisfy { !$0.passed && $0.score == 0 })
    }

    @Test func remediationMiniLesson() {
        let plan = composeRemediation(F.c("c4"), sessionId: "s", courseId: "c", learnerMisconceptions: ["c4-mc-b"])
        #expect(plan.state.phasePlan == [.develop, .consolidate, .check] && plan.state.conceptIds == ["c4"] && plan.state.misconceptions["c4"] == ["c4-mc-b"])
        var r = reduceLesson(plan.state, .start, plan.lesson)
        #expect(r.state.phase == .develop)
        r = reduceLesson(r.state, .learnerTurn(content: "idea"), plan.lesson)
        r = reduceLesson(r.state, .observer(observer(keyIdeaStated: true)), plan.lesson)
        #expect(r.state.phase == .consolidate)
        r = reduceLesson(r.state, .learnerTurn(content: "principle"), plan.lesson)
        let g = r.effects.compactMap(\.gradeItem).first!
        #expect(g.itemKind == .consolidate && g.itemId == "c4-i2" && g.rubricSource == .item)
        r = reduceLesson(r.state, .grade(itemKind: .consolidate, itemId: "c4-i2", grade: grade(0.9), rating: .good), plan.lesson)
        #expect(r.state.phase == .check)
        r = reduceLesson(r.state, .learnerTurn(content: "check", confidence: .certain), plan.lesson)
        r = reduceLesson(r.state, .grade(itemKind: .check, itemId: "c4#check", grade: grade(0.95), rating: .easy), plan.lesson)
        #expect(r.effects.count == 4 && r.effects[0].receipt != nil && r.effects[1].message != nil && r.state.done)
        #expect(r.effects[2] == .activateItems(conceptId: "c4", firstRating: .easy))
    }
}

@Suite struct DiagnosticTeachbackLearnerModelTests {
    @Test func diagnosticPlacement() {
        #expect(conceptDepths(F.cur) == ["c1": 0, "c2": 1, "c3": 2, "c4": 3, "c5": 1, "c6": 4, "c7": 5, "c8": 6])
        let s = createDiagnostic(F.cur)
        #expect(s.probeDepth == 2 && nextProbe(s) == DiagnosticProbe(conceptId: "c3", itemId: "c3-i1", depth: 2))
        #expect(s.probeItem["c2"] == "c2-i1" && s.probeItem["c5"] == "c5-i1")
        var st = s
        var probed: [String] = []
        while let p = nextProbe(st) {
            probed.append("\(p.conceptId)@\(p.depth)")
            st = recordResult(st, p.conceptId, (st.depth[p.conceptId] ?? 0) <= 2)
        }
        #expect(st.done && st.probes <= 4 && probed[0] == "c3@2")
        let r = diagnosticResult(st)
        #expect(r.frontierDepth == 3 && r.knownConceptIds == ["c1", "c2", "c3", "c5"])
        var n = s
        while let p = nextProbe(n) { n = recordResult(n, p.conceptId, false) }
        #expect(diagnosticResult(n).knownConceptIds.isEmpty && diagnosticResult(n).frontierDepth == 0)
        var e = s
        while let p = nextProbe(e) { e = recordResult(e, p.conceptId, true) }
        #expect(diagnosticResult(e).frontierDepth == 7 && diagnosticResult(e).knownConceptIds.count == 8)
        #expect(recordResult(s, "zzz", true) == s)
        let s1 = recordResult(s, "c3", true)
        #expect(recordResult(s1, "c3", false) == s1)
    }

    @Test func teachbackPosesOneWrongBelief() {
        var s = createTeachbackState(sessionId: "s", courseId: "c", concept: F.c1)
        #expect(s.itemId == "c1-i4")
        var all: [TeachbackEffect] = []
        var r = reduceTeachback(s, .start)
        all += r.effects
        s = r.state
        for i in 1...TEACHBACK_MAX_LEARNER_TURNS {
            s = reduceTeachback(s, .studentTurn(content: "student \(i)")).state
            r = reduceTeachback(s, .learnerTurn(content: "explanation part \(i)"))
            all += r.effects
            s = r.state
        }
        let moves = all.compactMap { if case .callStudent(let c) = $0 { c.move } else { nil } }
        #expect(moves.filter { $0 == .wrongBelief }.count == 1 && moves.firstIndex(of: .wrongBelief) == 2)
        #expect(moves.filter { $0 == .example }.count == 1 && moves.last == .closing && s.wrongBeliefPosed)
        #expect(all.contains(.gradeItem(itemId: "c1-i4", conceptId: "c1", answer: learnerExplanation(s))))
        #expect(learnerExplanation(s).contains("explanation part 1") && learnerExplanation(s).contains("explanation part 6"))
        #expect(reduceTeachback(s, .learnerTurn(content: "more")).effects.isEmpty)
        r = reduceTeachback(s, .grade(grade: grade(0.8), rating: .good))
        #expect(r.effects.count == 2 && r.effects[1] == .teachbackComplete(conceptId: "c1", itemId: "c1-i4", score: 0.8, rating: .good, learnerTurns: 6))
        #expect(r.state.done)

        var t = createTeachbackState(sessionId: "s", courseId: "c", concept: F.c2)
        #expect(t.itemId == "c2#teachback")
        t = reduceTeachback(t, .start).state
        t = reduceTeachback(t, .learnerTurn(content: "one")).state
        let end = reduceTeachback(t, .learnerTurn(content: "two, and I am done", done: true))
        #expect(end.effects.count == 2 && !end.state.wrongBeliefPosed && end.state.grading)
    }

    @Test func learnerModelRendersDeterministically() {
        let course = Course(id: "course1", curriculumId: "fixture", curriculumVersion: 1, title: "Fixture course",
                            goals: CourseGoals(purpose: .understand, weeklyMinutes: 120, background: "some stats"), settings: testSettings,
                            scaffolding: .developing, createdAt: 1, updatedAt: 2)
        let states = (0..<60).map { i in
            ConceptState(courseId: "course1", conceptId: "k" + String(format: "%02d", i), mastery: Double(i % 10) / 10, successfulSessions: i % 4,
                         misconceptions: i % 7 == 0 ? ["mc-\(i)", "mc-\(i)b", "x", "y"] : [], assistedPass: 1, assistedN: 2, unassistedPass: 1,
                         unassistedN: 2, updatedAt: 1_773_144_000_000)
        }
        let names = Dictionary(uniqueKeysWithValues: states.map { ($0.conceptId, "Concept number \($0.conceptId) with a fairly long descriptive name") })
        let cal = CalibrationSummary(brier: 0.123456, overconfidenceBias: 0.04567, n: 150)
        let input = SummarizeLearnerModelInput(course: course, conceptStates: states.reversed(), conceptNames: names, calibration: cal,
                                               lastLessonSummary: String(repeating: "I learned about things. ", count: 40),
                                               openQuestions: ["why?", "how?", "when?", "who?", "where?"])
        let focus = states.prefix(30).map(\.conceptId)
        let a = renderLearnerModel(summarizeLearnerModel(input), focus)
        var other = input
        other.conceptStates = states.map { var s = $0; s.updatedAt = 0; return s }
        #expect(a == renderLearnerModel(summarizeLearnerModel(other), focus.reversed()))
        #expect(a.count < 4000 && !a.contains(/\d{13}/))
        #expect(a.contains("concepts: total=60") && a.contains("related concepts (12):") && a.contains("scaffolding: developing") && a.contains("brier=0.12"))
        #expect(a.split(separator: "\n").filter { $0.hasPrefix("- ") }.count == 16)
        #expect(!a.contains("k59") && a.contains("misconceptions=[mc-0,mc-0b,x]") && !a.contains(",y]"))

        let empty = summarizeLearnerModel(SummarizeLearnerModelInput(course: course, conceptStates: [], conceptNames: [:],
                                                                     calibration: CalibrationSummary(brier: 0, overconfidenceBias: 0, n: 0)))
        #expect(empty.concepts.isEmpty && empty.preferences.verbosity == .normal && empty.preferences.examplesDomain == nil)
        let text = renderLearnerModel(empty, ["c1"])
        #expect(text.contains("calibration: no data") && text.contains("related concepts not yet started: 1"))
    }

    @Test func warmup() {
        let l1 = F.cur.lesson("L1")!
        let p = buildWarmupPrompt(l1)
        #expect(p.contains("Lesson One") && l1.concepts.allSatisfy { !p.contains($0.name) })
        #expect(mapWarmupResult(["c2", "zzz"], l1) == WarmupOutcome(reviewed: [.init(conceptId: "c2", rating: .good)], queuedFirst: ["c1", "c3"]))
    }
}
