import Foundation
import Testing
import EpistemicsCore
@testable import EpistemicsLLM

// MARK: - Tutor

@Suite("Tutor")
struct TutorTests {
    let lesson = Fixtures.lesson()

    @Test func curriculumContextRendersTheFocusConcept() throws {
        let ctx = try Tutor.buildCurriculumContext(lesson, focusConceptId: "c-indep")
        for needle in ["Independent events", "O1 [understand]", "conflates-independent-and-disjoint", "Two coin flips", "p. 42",
                       "What does it mean for one event to give you information", "level 3: For the deck",
                       "Pretest question (pose it; never answer it)", "Other concepts in this lesson", "Conditional probability"] {
            #expect(ctx.contains(needle), "\(needle)")
        }
    }

    @Test func curriculumContextNeverContainsAReference() throws {
        let ctx = try Tutor.buildCurriculumContext(lesson, focusConceptId: "c-indep")
        for ref in [Fixtures.pretestReference, Fixtures.transferReference, Fixtures.itemReference] { #expect(!ctx.contains(ref)) }
        for ref in Tutor.hiddenReferences(lesson) { #expect(!ctx.contains(ref)) }
        #expect(!ctx.contains("Accept the multiplication rule"))
        #expect(Tutor.referenceLeaks(ctx, lesson: lesson).isEmpty)
    }

    @Test func toldWhetherSourcesAreLoaded() throws {
        #expect(try Tutor.buildCurriculumContext(lesson, focusConceptId: "c-indep").contains("a source is loaded"))
        #expect(try Tutor.buildCurriculumContext(Fixtures.lesson(spans: false), focusConceptId: "c-indep").contains("no source is loaded"))
    }

    @Test func throwsIfATemplateWouldLeakAReference() {
        let poisoned = Fixtures.lesson(hint0: Fixtures.pretestReference)
        #expect(throws: TutorError.self) { try Tutor.buildCurriculumContext(poisoned, focusConceptId: "c-indep") }
    }

    func request() throws -> LlmRequest {
        Tutor.buildRequest(TutorInput(
            curriculumContext: try Tutor.buildCurriculumContext(lesson, focusConceptId: "c-indep"),
            learnerModelText: "scaffolding=developing; mastered: sample spaces; shaky: conditional probability",
            transcript: [.assistant("Is drawing a red card and drawing a king independent?"), .user("I think yes because they are different things.")],
            control: TutorTurnControl(phase: .develop, conceptId: "c-indep", hintLevel: 1, maxWords: 120,
                                      instruction: "Ask guiding question 1.", objectiveId: "O1")))
    }

    @Test func systemBlocksAreTheInkCharterAndTheContext() throws {
        let req = try request()
        #expect(req.role == .tutor)
        #expect(req.system.count == 2)
        #expect(req.system[0].text == Prompts.tutorCharterInk)
        #expect(req.system[0].cache && req.system[1].cache)
        #expect(req.system[1].text.contains("Independent events"))
    }

    @Test func learnerModelThenTranscriptThenTrailingControl() throws {
        let req = try request()
        #expect(req.messages[0].role == .user && req.messages[0].cache)
        #expect(req.messages[0].content.contains("scaffolding=developing"))
        #expect(req.messages[1].role == .assistant && req.messages[2].role == .user)
        let last = req.messages.last!
        #expect(last.role == .system && !last.cache)
        for needle in ["phase=DEVELOP", "hint_level=1", "max_words=120", "objective=O1", "Ask guiding question 1."] { #expect(last.content.contains(needle)) }
        #expect(req.messages.filter(\.cache).count == 1)
        #expect(req.effort == .medium && req.maxTokens == nil)
        let all = (req.system.map(\.text) + req.messages.map(\.content)).joined(separator: "\n")
        for ref in Tutor.hiddenReferences(lesson) { #expect(!all.contains(ref)) }
    }

    @Test func roundTripsThroughTheMockWithOneQuestion() async throws {
        let mock = MockProvider()
        let req = try request()
        let out = try await mock.text(req)
        #expect(out.text.filter { $0 == "?" }.count == 1)
        #expect(mock.calls == [req])
    }

    @Test func renderControl() {
        let c = Tutor.renderControl(TutorTurnControl(phase: .prime, conceptId: "x", hintLevel: 0, maxWords: 60, instruction: "Pose the pretest."))
        for needle in ["reveal=forbidden", "No hint yet", "Do not state the answer", "At most 60 words"] { #expect(c.contains(needle)) }
        #expect(c.hasPrefix("phase=PRIME concept=x hint_level=0 max_words=60 reveal=forbidden\nPose the pretest.\n"))
        #expect(Tutor.renderControl(.init(phase: .develop, conceptId: "x", hintLevel: 2, maxWords: 120, instruction: "go")).contains("You may use hint level 2"))
        #expect(Tutor.renderControl(.init(phase: .develop, conceptId: "x", hintLevel: 2, maxWords: 120, instruction: "go", allowHintContent: false)).contains("do not quote"))
        let reveal = Tutor.renderControl(.init(phase: .consolidate, conceptId: "x", hintLevel: 3, maxWords: 200, instruction: "Reveal: ...", revealAllowed: true))
        #expect(reveal.contains("reveal=allowed") && !reveal.contains("Do not state the answer"))
        let marked = Tutor.renderControl(.init(phase: .develop, conceptId: "x", hintLevel: 1, maxWords: 120, instruction: "go", markedQuote: "P(A) + P(B)"))
        #expect(marked.contains("A mark is shown on the learner's ink at: \"P(A) + P(B)\"."))
    }

    @Test func runTurnRegeneratesOnceOnABadShape() async throws {
        let mock = MockProvider(.init(queue: [.tutor: ["Why? And what is P(A)?", "What is P(A and B) here?"]]))
        let snapshots = Box<String>()
        let out = try await Tutor.runTurn(mock, input: TutorInput(curriculumContext: "ctx", learnerModelText: "lm", transcript: [.user("hm")],
                                                                    control: .init(phase: .develop, conceptId: "c", hintLevel: 0, maxWords: 120, instruction: "Ask.")),
                                          leakReferences: [LeakReference(answer: Fixtures.pretestReference)], onText: { snapshots.append($0) })
        guard case .turn(let text, _, let shape, let regenerated) = out else { Issue.record("expected a turn"); return }
        #expect(text == "What is P(A and B) here?" && shape.ok && regenerated)
        #expect(mock.calls.count == 2)
        #expect(mock.calls[1].messages.last!.content.contains("REGENERATE: your previous reply had 2 questions and 5 words"))
        #expect(snapshots.all.last == "What is P(A and B) here?")
    }

    @Test func runTurnKeepsTheSecondAttemptWhateverItsShape() async throws {
        let mock = MockProvider(.init(queue: [.tutor: ["A? B?", "C? D?"]]))
        let out = try await Tutor.runTurn(mock, input: TutorInput(curriculumContext: "ctx", learnerModelText: "lm", transcript: [],
                                                                    control: .init(phase: .develop, conceptId: "c", hintLevel: 0, maxWords: 120, instruction: "Ask.")),
                                          leakReferences: [])
        guard case .turn(let text, _, let shape, _) = out else { Issue.record("expected a turn"); return }
        #expect(text == "C? D?" && !shape.ok && mock.calls.count == 2)
    }

    @Test func runTurnReportsALeak() async throws {
        let mock = MockProvider(.init(queue: [.tutor: ["Remember: two events are independent when P(A and B) equals P(A) times P(B)."]]))
        let out = try await Tutor.runTurn(mock, input: TutorInput(curriculumContext: "ctx", learnerModelText: "lm", transcript: [],
                                                                    control: .init(phase: .prime, conceptId: "c", hintLevel: 0, maxWords: 120, instruction: "Pose.")),
                                          leakReferences: Tutor.leakReferences(for: Fixtures.concept(), phase: .prime))
        guard case .leaked(_, let verdict, _) = out else { Issue.record("expected a leak"); return }
        #expect(verdict.reason == .phrase)
    }

    @Test func leakReferencesPerPhase() {
        #expect(Tutor.leakReferences(for: Fixtures.concept(), phase: .develop).count == 1)
        #expect(Tutor.leakReferences(for: Fixtures.concept(), phase: .extend).count == 2)
        #expect(Tutor.leakReferences(for: nil, phase: .extend).isEmpty)
    }
}

// MARK: - Leak and turn shape

@Suite("Leak detector and turn shape")
struct LeakTests {
    let reference = LeakReference(answer: Fixtures.pretestReference)
    static let fragmentary = "Independent... P(A)... times... P(B)... equals... knowing... nothing... other... events?"

    @Test func flagsTheExactAnswerNormalised() async throws {
        let v = try await Leak.detect("So the answer is: MITOCHONDRIA.", reference: .init(answer: "The mitochondria.", exact: "mitochondria"))
        #expect(v.leaked && v.reason == .exact)
        #expect(try await Leak.detect("You should get 42 here.", reference: .init(answer: "forty-two", exact: "42")).leaked)
        #expect(try await !Leak.detect("Try 142 next.", reference: .init(answer: "x", exact: "42")).leaked)
    }

    @Test func flagsALongDistinctivePhrase() async throws {
        let v = try await Leak.detect("Remember: two events are independent when P(A and B) equals P(A) times P(B).", reference: reference)
        #expect(v.leaked && v.reason == .phrase)
        #expect(try await Leak.detect("KNOWING ONE tells you NOTHING about the other!!", reference: reference).leaked)
    }

    @Test func doesNotFlagQuestionsHintsOrShortOverlaps() async throws {
        let q = try await Leak.detect("What happens to the chance of a king once you know the card is red?", reference: reference)
        #expect(!q.leaked && q.reason == .none)
        #expect(try await !Leak.detect("Think about whether learning one event changes the odds of the other.", reference: reference).leaked)
        #expect(try await !Leak.detect("Good. Now, is P(A) the same as before?", reference: .init(answer: "P(A) is unchanged.")).leaked)
    }

    @Test func asksTheModelOnlyWhenInconclusive() async throws {
        let h = Leak.heuristic(Self.fragmentary, reference: reference)
        #expect(h.reason == .inconclusive && !h.leaked)
        let mock = MockProvider(.init(queue: [.leakcheck: [.value(LeakCheckResult(leaked: true, reason: "it lists the whole rule"))]]))
        let v = try await Leak.detect(Self.fragmentary, reference: reference, provider: mock)
        #expect(v == LeakVerdict(leaked: true, reason: .model, detail: "it lists the whole rule"))
        #expect(mock.calls[0].role == .leakcheck && mock.calls[0].effort == .low)
        #expect(try await !Leak.detect(Self.fragmentary, reference: reference).leaked)

        let no = MockProvider(.init(queue: [.leakcheck: [.value(LeakCheckResult(leaked: false, reason: "fragments only"))]]))
        let v2 = try await Leak.detect(Self.fragmentary, reference: reference, provider: no)
        #expect(!v2.leaked && v2.reason == .none)
    }

    @Test func turnShape() {
        #expect(Leak.checkTurnShape("Good start. What is P(A and B) for disjoint events?", maxWords: 120) == TurnShape(ok: true, questions: 1, words: 10))
        let two = Leak.checkTurnShape("Why? And what is P(A)?", maxWords: 120)
        #expect(!two.ok && two.questions == 2)
        let long = Leak.checkTurnShape(Array(repeating: "word", count: 130).joined(separator: " "), maxWords: 120)
        #expect(!long.ok && long.words == 130)
        let code = Leak.checkTurnShape("Try this:\n```js\nconst x = a ? b : c;\nconst y = d ? e : f;\n```\nWhat does `x ? 1 : 0` give?", maxWords: 120)
        #expect(code.questions == 1 && code.ok && code.words < 10)
        #expect(Leak.checkTurnShape("Really??", maxWords: 10).questions == 1)
    }
}

// MARK: - Observer

@Suite("Observer")
struct ObserverTests {
    let concept = Fixtures.observerConcept()
    var base: ObserveInput {
        ObserveInput(learnerTurn: "", tutorTurnBefore: "What does it mean for one event to give you information about another?",
                     concept: concept, sourcesLoaded: false)
    }
    func input(_ learner: String) -> ObserveInput { var b = base; b.learnerTurn = learner; return b }

    struct Payload: Decodable { struct C: Decodable { struct O: Decodable { var id: String }; var objectives: [O] }; var concept: C; var sourcesLoaded: Bool; var learnerTurn: String }

    @Test func buildsACompactLowEffortRequest() {
        let req = Observer.buildRequest(input("It means knowing one changes the probability of the other."))
        #expect(req.role == .observer && req.effort == .low && req.system[0].cache)
        #expect(req.system[0].text == Prompts.observer)
        let p = RoleInput.decode(req, as: Payload.self)
        #expect(p?.concept.objectives.map(\.id) == ["O1", "O2"])
        #expect(p?.sourcesLoaded == false)
        // key order as on the web
        let content = req.messages[0].content
        #expect(content.hasPrefix("```json\n{\n  \"tutorTurnBefore\": "))
        #expect(content.range(of: "\"learnerTurn\"")!.lowerBound < content.range(of: "\"concept\"")!.lowerBound)
    }

    @Test func mockHeuristics() async throws {
        let mock = MockProvider()
        let tried = try await Observer.observe(mock, input("Knowing one event changes the probability of the other one, I think.")).value
        #expect(tried.attemptMade && !tried.gaveUp && tried.keyIdeaStated)
        #expect(tried.objectiveProgress.map(\.objectiveId) == ["O1", "O2"])
        let idk = try await Observer.observe(mock, input("idk")).value
        #expect(!idk.attemptMade && idk.gaveUp)
        #expect(mock.calls.count == 2)
    }

    @Test func sanitisesAQueuedResponse() async throws {
        let raw = ObserverResult(attemptMade: true, objectiveProgress: [.init(objectiveId: "O2", status: .met), .init(objectiveId: "ghost", status: .met)],
                                 misconceptionTags: ["conflates-independent-and-disjoint", "made-up"], priorKnowledgeElicited: true)
        let mock = MockProvider(.init(queue: [.observer: [.value(raw)]]))
        let r = try await Observer.observe(mock, input("x"))
        #expect(r.value.objectiveProgress == [.init(objectiveId: "O2", status: .met), .init(objectiveId: "O1", status: .none)])
        #expect(r.value.misconceptionTags == ["conflates-independent-and-disjoint"])
        #expect(r.usage.inputTokens > 0)
    }

    @Test func rejectsAnInvalidQueuedResponse() async {
        let mock = MockProvider(.init(queue: [.observer: [.json(json(#"{"attemptMade":"yes"}"#))]]))
        await #expect { _ = try await Observer.observe(mock, input("x")) } throws: { e in
            (e as? LlmError)?.kind == .parse && (e as? LlmError)?.message.contains("ObserverResult") == true
        }
    }

    @Test func offTopicIsNotAnAttempt() {
        let r = Observer.sanitise(ObserverResult(attemptMade: true, offTopic: true), concept: concept)
        #expect(!r.attemptMade)
    }

    // iPad mark

    @Test func inkRequestCarriesPhaseMarksAndInkSummary() {
        let req = Observer.buildRequest(InkObserveInput(input("x"), phase: .develop, ink: InkSummary(secondsToFirstStroke: 4.5, crossedOut: ["add"], drewDiagram: true)))
        #expect(req.system[0].text == Prompts.observerWithInk)
        let content = req.messages[0].content
        #expect(content.contains("\"phase\": \"DEVELOP\"") && content.contains("\"marksAllowed\": true"))
        #expect(content.contains("\"crossedOut\": [\n      \"add\"\n    ]") && content.contains("\"secondsToFirstStroke\": 4.5"))
        #expect(!content.contains("secondsWriting"))
        let prime = Observer.buildRequest(InkObserveInput(input("x"), phase: .prime))
        #expect(prime.messages[0].content.contains("\"marksAllowed\": false") && !prime.messages[0].content.contains("\"ink\""))
    }

    @Test func inkSchemaAddsANullableMark() {
        let s = Observer.inkSchema.json.jsonValue
        #expect(s["required"]?.arrayValue?.contains(.string("mark")) == true)
        #expect(s["properties"]?["mark"]?["anyOf"]?.arrayValue?.count == 2)
    }

    @Test func markIsValidatedAgainstTheLearnerTurn() {
        let turn = "So P(A and B) = P(A) + P(B) because they are separate."
        func s(_ m: TutorMark?, _ phase: LessonPhase = .develop, attempt: Bool = true) -> TutorMark? {
            Observer.sanitiseMark(m, learnerTurn: turn, phase: phase, attemptMade: attempt)
        }
        #expect(s(TutorMark(quote: "P(A) + P(B)", note: "sum, not product")) == TutorMark(quote: "P(A) + P(B)", note: "sum, not product"))
        #expect(s(TutorMark(quote: "p(a)   +  p(b)")) == TutorMark(quote: "P(A) + P(B)"))  // case/whitespace repaired to the exact span
        #expect(s(TutorMark(quote: "P(A) times P(B)")) == nil)                              // not in the answer
        #expect(s(TutorMark(quote: "P(A) + P(B)"), .prime) == nil)
        #expect(s(TutorMark(quote: "P(A) + P(B)"), .probe) == nil)
        #expect(s(TutorMark(quote: "P(A) + P(B)"), .check) == nil)
        #expect(s(TutorMark(quote: "P(A) + P(B)"), attempt: false) == nil)
        #expect(s(TutorMark(quote: "P(A) + P(B)", note: "why a sum?"))?.note == nil)        // a question
        #expect(s(TutorMark(quote: "P(A) + P(B)", note: "one two three four five six seven eight nine"))?.note == nil)
        #expect(s(TutorMark(quote: "  ")) == nil)
    }

    @Test func inkObserveWithModelOutput() async throws {
        let raw = #"{"attemptMade":true,"gaveUp":false,"offTopic":false,"objectiveProgress":[],"misconceptionTags":["conflates-independent-and-disjoint"],"keyIdeaStated":false,"priorKnowledgeElicited":false,"stuck":false,"unsourcedClaims":[],"mark":{"quote":"they can't both happen","note":"disjoint is not independent"}}"#
        let mock = MockProvider(.init(queue: [.observer: [.text(raw), .text(raw)]]))
        let learner = "They are independent because they can't both happen."
        let r = try await Observer.observe(mock, InkObserveInput(input(learner), phase: .develop))
        #expect(r.value.mark == TutorMark(quote: "they can't both happen", note: "disjoint is not independent"))
        #expect(r.value.attemptMade)            // dynamic member lookup into the observation
        #expect(r.value.objectiveProgress.count == 2)
        let unaided = try await Observer.observe(mock, InkObserveInput(input(learner), phase: .check))
        #expect(unaided.value.mark == nil)
    }

    @Test func mockProducesAMarkOnlyWhenAllowed() async throws {
        let mock = MockProvider()
        let learner = "Disjoint events are independent, since they never overlap."
        let dev = try await Observer.observe(mock, InkObserveInput(input(learner), phase: .develop)).value
        #expect(dev.mark?.quote == "Disjoint events are independent")
        #expect(dev.mark?.note == "Look again at this step.") // a misconception was tagged
        let prime = try await Observer.observe(mock, InkObserveInput(input(learner), phase: .prime)).value
        #expect(prime.mark == nil)
        let idk = try await Observer.observe(mock, InkObserveInput(input("idk"), phase: .develop)).value
        #expect(idk.mark == nil)
    }

    @Test func inkResultRoundTripsAsOneFlatObject() throws {
        let v = InkObserverResult(observation: ObserverResult(attemptMade: true), mark: TutorMark(quote: "q"))
        let data = try JSONEncoder().encode(v)
        let j = try JSONDecoder().decode(JSONValue.self, from: data)
        #expect(j["attemptMade"] == .bool(true) && j["mark"]?["quote"] == .string("q") && j["mark"]?["note"] == .null)
        #expect(try JSONDecoder().decode(InkObserverResult.self, from: data) == v)
    }
}

// MARK: - Grader

@Suite("Grader")
struct GraderTests {
    let concept = Fixtures.concept()
    var input: GradeInput {
        let item = concept.items[0]
        return GradeInput(prompt: item.prompt, reference: GradeReference(answer: Fixtures.itemReference), rubric: item.rubric,
                          answer: "Independence means the occurrence of B does not change the probability of A, so P(A|B) = P(A).",
                          misconceptions: concept.misconceptions.map { .init(tag: $0.tag, description: $0.description) })
    }

    func sample(_ score: Double, _ confidence: Double = 0.9, _ met: (Bool, Bool) = (true, true), _ tags: [String] = []) -> GradeResult {
        GradeResult(criteria: [CriterionResult(id: "c1", met: met.0, evidence: "e1"), CriterionResult(id: "c2", met: met.1, evidence: "e2")],
                    score: score, misconceptionTags: tags, feedback: "fb \(score)", confidence: confidence)
    }

    @Test func mockHeuristicsAndBlindRequest() async throws {
        let mock = MockProvider()
        let good = try await Grader.grade(mock, input).grade
        #expect(good.score == 0.9 && good.criteria.allSatisfy(\.met) && good.samples == 1)
        var bad = input
        bad.answer = "Bananas are yellow fruit."
        #expect(try await Grader.grade(mock, bad).grade.score == 0.3)
        #expect(mock.calls.count == 2)
        #expect(mock.calls[0].role == .grader && mock.calls[0].messages.count == 1)
        #expect(mock.calls[0].system[0].text == Prompts.grader)
        let content = mock.calls[0].messages[0].content
        #expect(content.contains("\"reference\": ") && !content.contains("exactAnswer") && !content.contains("evidenceHint"))
    }

    @Test func needsConsensus() {
        #expect(!Grader.needsConsensus(score: 0.9, confidence: 0.9))
        #expect(Grader.needsConsensus(score: 0.9, confidence: 0.6))
        #expect(Grader.needsConsensus(score: 0.76, confidence: 0.95))
        #expect(Grader.needsConsensus(score: 0.42, confidence: 0.95))
        #expect(Grader.needsConsensus(score: 0.95, confidence: 0.95))
        #expect(!Grader.needsConsensus(score: 0.6, confidence: 0.95))
        #expect(!Grader.needsConsensus(score: 0.35, confidence: 0.95)) // exactly 0.05 away
        #expect(Grader.needsConsensus(score: 0.36, confidence: 0.95))
        #expect(!Grader.needsConsensus(score: 0.9, confidence: 0.75))
        #expect(Grader.needsConsensus(score: 0.9, confidence: 0.75, confidenceBar: 0.8))
    }

    @Test func borderlineFirstSampleDrawsThree() async throws {
        let mock = MockProvider(.init(queue: [.grader: [.value(sample(0.76, 0.9, (true, true))), .value(sample(0.5, 0.8, (true, false))),
                                                        .value(sample(0.9, 0.7, (true, false), ["conflates-independent-and-disjoint"]))]]))
        let out = try await Grader.grade(mock, input)
        #expect(mock.calls.count == 3)
        #expect(out.grade.samples == 3 && out.grade.score == 0.76)
        #expect(out.grade.criteria == [CriterionResult(id: "c1", met: true, evidence: "e1"), CriterionResult(id: "c2", met: false, evidence: "e2")])
        #expect(out.grade.misconceptionTags.isEmpty)
        #expect(abs(out.grade.confidence - 0.8) < 1e-9)
        #expect(out.grade.feedback == "fb 0.76")
        #expect(out.disagreement)
        #expect(out.usage.inputTokens > 0)
    }

    @Test func aConfidentMidBandSampleIsNotEscalated() async throws {
        let mock = MockProvider(.init(queue: [.grader: [.value(sample(0.6, 0.95))]]))
        let g = try await Grader.grade(mock, input).grade
        #expect(mock.calls.count == 1 && g.samples == 1)
    }

    @Test func forcedSamples() async throws {
        let mock = MockProvider(.init(queue: [.grader: [.value(sample(0.6, 0.95)), .value(sample(0.6, 0.95))]]))
        var i = input
        i.samples = 2
        let g = try await Grader.grade(mock, i).grade
        #expect(mock.calls.count == 2 && g.samples == 2)
    }

    @Test func sanitisesUnknownCriteriaTagsAndRange() async throws {
        var raw = sample(1.7, -2)
        raw.criteria = [CriterionResult(id: "c2", met: true, evidence: "x"), CriterionResult(id: "zzz", met: true, evidence: "")]
        raw.misconceptionTags = ["nope"]
        let mock = MockProvider(.init(queue: [.grader: [.value(raw), .value(raw), .value(raw)]]))
        let g = try await Grader.grade(mock, input).grade
        #expect(g.criteria == [CriterionResult(id: "c1", met: false, evidence: ""), CriterionResult(id: "c2", met: true, evidence: "x")])
        #expect(g.misconceptionTags.isEmpty && g.score == 1 && g.confidence == 0)
    }

    @Test func combineMajorityWithTwoSamples() {
        let g = Grader.combine([sample(0.5, 0.9, (true, false)), sample(0.9, 0.9, (true, true))], rubric: concept.items[0].rubric)
        #expect(abs(g.score - 0.7) < 1e-9)
        #expect(g.criteria.map(\.met) == [true, false])
    }

    @Test func ratingMap() {
        #expect(Grader.rating(score: 0.3, confidence: 1) == .again)
        #expect(Grader.rating(score: 0.5, confidence: 1) == .hard)
        #expect(Grader.rating(score: 0.8, confidence: 1) == .good)
        #expect(Grader.rating(score: 0.97, confidence: 0.9) == .easy)
        #expect(Grader.rating(score: 0.97, confidence: 0.5) == .good)
        #expect(!Grader.samplesDisagree([sample(0.8), sample(0.9)]))
    }

    @Test func exactMatches() {
        #expect(Grader.exactMatches("  The answer is 42. ", exact: "42"))
        #expect(Grader.exactMatches("x = 3.50", exact: "3.5"))
        #expect(!Grader.exactMatches("142", exact: "42"))
        #expect(Grader.exactMatches("Mitochondria!", exact: "mitochondria"))
        #expect(Grader.exactMatches("I think it is the Krebs cycle", exact: "krebs cycle"))
        #expect(!Grader.exactMatches("Golgi", exact: "mitochondria"))
        #expect(!Grader.exactMatches("anything", exact: "!!"))
    }

    @Test func gradeExactShortCircuits() async throws {
        let yes = Grader.gradeExact("42", exact: "42", rubric: concept.items[0].rubric)
        #expect(yes.score == 1 && yes.confidence == 1 && yes.criteria.allSatisfy(\.met) && yes.samples == 0)
        let no = Grader.gradeExact("41", exact: "42")
        #expect(no.score == 0 && no.confidence == 1)

        let mock = MockProvider()
        var hit = input
        hit.reference = GradeReference(answer: Fixtures.itemReference, exact: "42")
        hit.answer = "it is 42"
        #expect(try await Grader.grade(mock, hit).grade.score == 1)
        #expect(mock.calls.isEmpty)

        var miss = input
        miss.reference = GradeReference(answer: Fixtures.itemReference, exact: "42")
        let capped = try await Grader.grade(mock, miss).grade
        #expect(mock.calls.count == 1 && capped.score == 0.5 && capped.feedback.contains("does not match"))
        #expect(!mock.calls[0].messages[0].content.contains("exactAnswer"))

        var bare = miss
        bare.rubric = []
        bare.answer = "41"
        #expect(try await Grader.grade(mock, bare).grade.score == 0)
        #expect(mock.calls.count == 1)
    }
}

// MARK: - Student and warm-up

@Suite("Student and warm-up")
struct StudentWarmupTests {
    @Test func studentRequest() {
        let req = Student.buildRequest(StudentInput(
            conceptName: "Independent events",
            definition: "Two events are independent when one does not change the probability of the other.",
            objectives: [StudentObjective(id: "O1", text: "State the multiplication rule.")],
            transcript: [.user("So independence means the events cannot happen together.")],
            control: StudentTurnControl(poseWrongBelief: true, wrongBelief: "Disjoint events are independent.", turn: 2)))
        #expect(req.role == .student && req.effort == .low)
        #expect(req.system[0].text == Prompts.student && req.system[0].cache)
        #expect(req.system[1].text.contains("Independent events") && req.system[1].text.contains("- O1: State the multiplication rule."))
        #expect(req.messages[0].role == .user && req.messages[0].cache)
        #expect(req.messages[1].content.contains("cannot happen together"))
        let ctl = req.messages.last!
        #expect(ctl.role == .system)
        for needle in ["pose_wrong_belief=yes", "Disjoint events are independent.", "At most 80 words", "turn=2"] { #expect(ctl.content.contains(needle)) }
    }

    @Test func studentControlDefaults() {
        let c = Student.renderControl(StudentTurnControl())
        #expect(c.contains("pose_wrong_belief=no") && c.contains("ask_for_example=no") && c.contains("Exactly one question. At most 80 words."))
        #expect(Student.renderControl(StudentTurnControl(askForExample: true, maxWords: 50)).contains("concrete example"))
    }

    @Test func mockStudentTurnHasOneQuestion() async throws {
        let mock = MockProvider()
        let r = try await mock.text(Student.buildRequest(StudentInput(conceptName: "x", definition: "y", transcript: [])))
        #expect(Leak.checkTurnShape(r.text, maxWords: 80).ok)
    }

    let concepts = [
        WarmupConcept(id: "c1", name: "Independent events", definition: "Two events are independent when one does not change the probability of the other."),
        WarmupConcept(id: "c2", name: "Conditional probability", definition: "The probability of A given B is P(A and B) divided by P(B)."),
        WarmupConcept(id: "c3", name: "Bayes theorem", definition: "P(A|B) = P(B|A) P(A) / P(B)."),
    ]

    @Test func warmupRequest() {
        let req = Warmup.buildRequest(WarmupInput(dump: "stuff", concepts: concepts))
        #expect(req.role == .grader && req.effort == .low && req.system[0].text == Prompts.warmup)
        #expect(req.messages[0].content.contains("\"c3\""))
    }

    @Test func warmupMockHeuristics() async throws {
        let r = try await Warmup.grade(MockProvider(), WarmupInput(
            dump: "Independent events: one event does not change the probability of the other. I also remember conditional probability but not the formula.",
            concepts: concepts)).value
        #expect(r == WarmupResult(recalledConceptIds: ["c1"], partial: ["c2"]))
    }

    @Test func warmupSanitises() async throws {
        let mock = MockProvider(.init(queue: [.grader: [.value(WarmupResult(recalledConceptIds: ["c1", "zzz"], partial: ["c1", "c2"]))]]))
        #expect(try await Warmup.grade(mock, WarmupInput(dump: "x", concepts: concepts)).value == WarmupResult(recalledConceptIds: ["c1"], partial: ["c2"]))
    }

    @Test func warmupShortCircuitsOnAnEmptyDump() async throws {
        let mock = MockProvider()
        #expect(try await Warmup.grade(mock, WarmupInput(dump: "   ", concepts: concepts)).value == WarmupResult(recalledConceptIds: [], partial: []))
        #expect(mock.calls.isEmpty)
    }
}

// MARK: - Reader

@Suite("Reader")
struct ReaderTests {
    let png = Data([0x89, 0x50, 0x4E, 0x47, 1, 2, 3])

    @Test func requestCarriesImageAndDraftButNoAnswerKey() {
        let req = Reader.buildRequest(ReaderInput(image: png, draft: "5O4O", itemType: .apply, paper: .squared, prompt: "How many orderings of 7 books?"))
        #expect(req.role == .reader && req.effort == .medium && req.maxTokens == 8192)
        #expect(req.system == [CacheableBlock(Prompts.reader, cache: true)])
        #expect(req.messages.count == 1 && req.messages[0].images == [.png(png)])
        let content = req.messages[0].content
        for needle in ["\"itemType\": \"apply\"", "\"paper\": \"squared\"", "\"prompt\": \"How many orderings of 7 books?\"", "\"draft\": \"5O4O\""] {
            #expect(content.contains(needle))
        }
        for banned in ["reference", "rubric", "misconception"] { #expect(!content.lowercased().contains(banned)) }
        // and on the wire: the image block precedes the text
        let body = buildAnthropicBody(req, models: .defaults, schema: Reader.schema, stream: false).json.jsonValue
        let blocks = body["messages"]!.arrayValue![0]["content"]!.arrayValue!
        #expect(blocks[0]["type"] == .string("image") && blocks[1]["type"] == .string("text"))
        #expect(body["model"] == .string("claude-sonnet-5-5"))
    }

    @Test func schemaShape() {
        let s = Reader.schema.json.jsonValue
        #expect(s["required"] == json(#"["text","boxed","diagram","crossedOut","uncertain"]"#))
        #expect(s["properties"]?["boxed"] == json(#"{"anyOf":[{"type":"string"},{"type":"null"}]}"#))
        let diagram = s["properties"]?["diagram"]?["anyOf"]?.arrayValue?[0]
        #expect(diagram?["properties"]?["edges"]?["items"]?["required"] == json(#"["from","to","label"]"#))
        // property order is kept in the serialised schema (the model writes `text` first)
        #expect(Reader.schema.json.serialized().hasPrefix(#"{"type":"object","properties":{"text":"#))
    }

    @Test func mockEchoesTheDraft() async throws {
        let mock = MockProvider()
        let plain = try await Reader.read(mock, ReaderInput(image: png, draft: "The answer is 5040", itemType: .explain, paper: .ruled, prompt: "p")).value
        #expect(plain == ReaderOutput(text: "The answer is 5040"))

        let rich = try await Reader.read(mock, ReaderInput(image: png, draft: "~~add~~ multiply: 7! = 504?0\n$\\boxed{5040}$", itemType: .apply, paper: .squared, prompt: "p")).value
        #expect(rich.text == "multiply: 7! = 504?0\n$\\boxed{5040}$")
        #expect(rich.crossedOut == ["add"])
        #expect(rich.boxed == "5040")
        #expect(rich.uncertain == [ReaderOutput.Uncertain(span: "504?0", alternatives: ["5040"])])
        #expect(rich.diagram == nil)

        let tree = try await Reader.read(mock, ReaderInput(image: png, draft: "start -> H\nstart -> T : tails", itemType: .sketch, paper: .dotted, prompt: "p")).value
        #expect(tree.diagram == ReaderOutput.Diagram(
            nodes: [.init(id: "n1", label: "start"), .init(id: "n2", label: "H"), .init(id: "n3", label: "T")],
            edges: [.init(from: "n1", to: "n2", label: nil), .init(from: "n1", to: "n3", label: "tails")]))
        #expect(tree.uncertain.isEmpty)
    }

    @Test func sanitise() {
        let raw = ReaderOutput(
            text: "  x = 5  ", boxed: "  ",
            diagram: .init(nodes: [.init(id: "a", label: "A"), .init(id: "a", label: "dup"), .init(id: " ", label: "blank")],
                           edges: [.init(from: "a", to: "zzz"), .init(from: "a", to: "a", label: " ")]),
            crossedOut: ["", " y "],
            uncertain: [.init(span: "5", alternatives: ["5", "8", "8", ""]), .init(span: "not there", alternatives: ["x"])])
        let s = Reader.sanitise(raw)
        #expect(s.text == "x = 5" && s.boxed == nil)
        #expect(s.diagram == .init(nodes: [.init(id: "a", label: "A")], edges: [.init(from: "a", to: "a", label: nil)]))
        #expect(s.crossedOut == ["y"])
        #expect(s.uncertain == [.init(span: "5", alternatives: ["8"])])
        #expect(Reader.sanitise(ReaderOutput(text: "t", diagram: .init(nodes: [], edges: []))).diagram == nil)
    }

    @Test func decodesModelOutputWithNulls() throws {
        let raw = #"{"text":"$x^2$","boxed":null,"diagram":null,"crossedOut":[],"uncertain":[{"span":"x^2","alternatives":["x2"]}]}"#
        let r = try JSONDecoder().decode(ReaderOutput.self, from: Data(raw.utf8))
        #expect(r.boxed == nil && r.diagram == nil && r.hasDoubt)
        let back = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(r))
        #expect(back["boxed"] == .null && back["diagram"] == .null)
    }
}
