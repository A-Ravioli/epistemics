import Foundation
import PencilKit
import Testing
import EpistemicsCore
import EpistemicsLLM
@testable import Epistemics

/// End-to-end flows through the real session models, the store, the core reducers and the demo (mock)
/// tutor, with synthetic Pencil strokes standing in for the learner.
@MainActor
@Suite(.serialized) struct SessionFlowTests {
    static func scribble(_ seed: Int = 0) -> PKDrawing {
        let start = Date()
        func stroke(_ pts: [CGPoint]) -> PKStroke {
            let points = pts.enumerated().map { i, p in
                PKStrokePoint(location: p, timeOffset: Double(i) * 0.016, size: CGSize(width: 3, height: 3), opacity: 1,
                              force: 1, azimuth: 0, altitude: .pi / 2)
            }
            return PKStroke(ink: PKInk(.pen, color: .black), path: PKStrokePath(controlPoints: points, creationDate: start))
        }
        let x = CGFloat(40 + (seed % 5) * 30)
        return PKDrawing(strokes: [
            stroke([CGPoint(x: x, y: 30), CGPoint(x: x, y: 90)]),
            stroke([CGPoint(x: x + 20, y: 95), CGPoint(x: x + 50, y: 25)]),
        ])
    }

    static func enrolledApp() async throws -> AppModel {
        let app = AppModel(store: try Store(url: nil))
        app.settings.tutorMode = .demo
        let url = try #require(Bundle.main.url(forResource: "probability-basics.epistemics", withExtension: "json", subdirectory: "Packs"))
        let pack = try JSONDecoder().decode(Curriculum.self, from: Data(contentsOf: url))
        try await app.enroll(pack: pack, recall: "", minutesPerDay: 20, recallDrawing: nil)
        app.settings.onboarded = true
        return app
    }

    /// Drives a lesson to the end, answering every prompt with ink. Returns the number of learner turns.
    @discardableResult
    static func runLesson(_ model: LessonSessionModel) async throws -> Int {
        await model.start()
        var turns = 0
        for step in 0..<400 {
            if let error = model.error { Issue.record("lesson error at step \(step): \(error)"); return turns }
            if model.pendingConfirmation != nil {
                await model.confirmPending(text: model.pendingConfirmation!.reading.text)
                continue
            }
            switch model.inputMode {
            case .done:
                return turns
            case .jol:
                await model.submitJol(Dictionary(uniqueKeysWithValues: (model.lesson?.concepts ?? []).map { ($0.id, 0.5) }))
            case .answer, .summary:
                model.activeArea.drawing = scribble(step)
                await model.handIn()
                turns += 1
            case .answerConfidence:
                model.activeArea.drawing = scribble(step)
                await model.handIn(confidence: .fairlySure)
                turns += 1
            }
        }
        Issue.record("lesson did not finish in 400 steps (phase \(model.phase))")
        return turns
    }

    @Test(.timeLimit(.minutes(5))) func aWholeLessonActivatesItsConceptsAndEndsTheSession() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let lesson = try #require(ctx.curriculum.allLessons.first)
        let model = LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id)
        let clock = ContinuousClock()
        var turns = 0
        let elapsed = try await clock.measure { turns = try await Self.runLesson(model) }
        print("lesson: \(turns) turns in \(elapsed); on-device reads ok \(await app.onDevice.answered), timed out \(await app.onDevice.timedOut)")
        let timedOut = await app.onDevice.timedOut
        let answered = await app.onDevice.answered
        #expect(timedOut == 0, "on-device reads: \(answered) answered, \(timedOut) timed out over \(turns) turns in \(elapsed)")
        #expect(model.state?.done == true)
        #expect(turns > lesson.concepts.count * 3, "expected several handwritten turns per concept, got \(turns)")

        let sessions = try await app.store.sessions(course: ctx.course.id, type: .lesson)
        #expect(sessions.first?.endedAt != nil)
        let cards = try await app.store.cards(course: ctx.course.id)
        let lessonConcepts = Set(lesson.concepts.map(\.id))
        let activated = cards.filter { lessonConcepts.contains($0.conceptId) && $0.state != .new }
        #expect(activated.count == cards.filter { lessonConcepts.contains($0.conceptId) }.count,
                "every item of the lesson's concepts enters FSRS after CHECK")
        #expect(cards.filter { !lessonConcepts.contains($0.conceptId) }.allSatisfy { $0.state == .new })
        let receipts = try await app.store.receipts(course: ctx.course.id)
        #expect(!receipts.isEmpty)
        #expect(receipts.contains { !$0.assisted }, "the unaided CHECK is recorded as unassisted")
        let inks = try await app.store.ink(owner: sessions.first!.id)
        #expect(inks.count == turns, "every handed-in turn keeps its ink")
        #expect(try await app.store.sessionState(sessions.first!.id, as: PersistedLesson.self) == nil, "a finished lesson leaves no resumable state")
    }

    @Test(.timeLimit(.minutes(5))) func aLessonResumesWhereItStopped() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let lesson = try #require(ctx.curriculum.allLessons.first)
        let first = LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id)
        await first.start()
        first.activeArea.drawing = Self.scribble()
        await first.handIn(confidence: .guess)
        let entriesBefore = first.entries.count
        let phaseBefore = first.phase

        let second = LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id)
        await second.start()
        #expect(second.phase == phaseBefore)
        #expect(second.entries.count == entriesBefore)
        #expect(second.entries.contains { $0.kind == .learner && $0.area != nil }, "the learner's ink comes back from the store")
    }

    @Test(.timeLimit(.minutes(8))) func reviewsAfterALessonAreAnsweredGradedAndRescheduled() async throws {
        let app = try await Self.enrolledApp()
        var ctx = try #require(app.context)
        let lesson = try #require(ctx.curriculum.allLessons.first)
        try await Self.runLesson(LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id))

        // Learning steps are minutes long: look at the queue from an hour later.
        let later = AppModel.now() + 3_600_000
        ctx.now = { later }
        let review = ReviewSessionModel(app: app, ctx: ctx)
        await review.start()
        var answered = 0
        var sawReceiptMarksOrReference = false
        for i in 0..<300 {
            switch review.phase {
            case .answering:
                review.current?.area.drawing = Self.scribble(i)
                await review.handIn(.certain)
            case .confirming(let r):
                await review.confirm(r, text: r.text)
            case .reveal(let r):
                await review.selfRate(.good, reading: r)
            case .receipt(let result):
                answered += 1
                if result.graded != nil || result.previous == nil { sawReceiptMarksOrReference = true }
                await review.next()
            case .done:
                break
            case .failed(let m):
                Issue.record("review failed: \(m)")
                return
            case .loading, .reading, .grading:
                try await Task.sleep(for: .milliseconds(50))
            }
            if review.phase == .done { break }
        }
        #expect(review.phase == .done)
        #expect(answered > 0, "the lesson's items come back as reviews")
        #expect(sawReceiptMarksOrReference)
        let log = try await app.store.reviewLog(course: ctx.course.id)
        #expect(log.filter { $0.source == .review }.count >= answered)
        let receipts = try await app.store.receipts(course: ctx.course.id).filter { $0.modality == .ink }
        #expect(!receipts.isEmpty, "review receipts record that they were answered in ink")
    }

    @Test(.timeLimit(.minutes(2))) func todaySaysWhatToDoFirst() async throws {
        let app = try await Self.enrolledApp()
        let service = try #require(app.service)
        let today = try await service.loadToday()
        #expect(today.nextLesson?.id == app.context?.curriculum.allLessons.first?.id)
        #expect(today.dueCount == 0)
        #expect(today.lessonLocked == false)
        #expect(today.warmup == nil)
    }

    @Test(.timeLimit(.minutes(5))) func theWarmupAfterALessonCountsRecallAndQueuesTheRest() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let lesson = try #require(ctx.curriculum.allLessons.first)
        try await Self.runLesson(LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id))

        let today = try await app.service!.loadToday()
        #expect(today.warmup?.id == lesson.id, "the next day starts with a blank page about the last lesson")
        let warmup = WarmupModel(app: app, ctx: ctx, lessonId: lesson.id)
        warmup.area.drawing = Self.scribble()
        await warmup.done()
        if case .confirming(let r) = warmup.phase { await warmup.confirm(r, text: r.text) }
        #expect(warmup.phase == .result)
        #expect(warmup.recalled.count + warmup.missed.count == lesson.concepts.count)
        let service = try #require(app.service)
        #expect(await service.warmupDay() == service.studyDayKey())
        #expect(Set(await service.queueFirst()) == Set(lesson.concepts.filter { c in !warmup.recalled.contains(c.name) }.map(\.id)))
        #expect(try await app.service!.loadToday().warmup == nil, "one warm-up a day")
    }

    @Test(.timeLimit(.minutes(5))) func aCheckpointPaperIsHandedInOnceAndComesBackMarked() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let unit = try #require(ctx.curriculum.units.first)
        let paper = CheckpointSessionModel(app: app, ctx: ctx, unitId: unit.id)
        await paper.start()
        #expect(paper.phase == .writing)
        #expect(paper.questions.count >= 8, "a checkpoint is 8-15 questions")
        for i in paper.questions.indices.dropLast() {
            paper.questions[i].area.drawing = Self.scribble(i)
            paper.setConfidence(.fairlySure, for: i)
        }
        await paper.handIn()
        #expect(paper.phase == .confirming)
        await paper.grade()
        #expect(paper.phase == .returned)
        let result = try #require(paper.result)
        #expect(!result.perConcept.isEmpty)
        let session = try #require(try await app.store.sessions(course: ctx.course.id, type: .checkpoint).first)
        #expect(session.endedAt != nil)
        let receipts = try await app.store.receipts(session: session.id)
        #expect(receipts.count == paper.questions.count, "every question gets a receipt, the blank one included")
        #expect(receipts.allSatisfy { !$0.assisted })
        let pending = await app.service!.pendingRemediation()
        #expect(Set(pending) == Set(result.reopen), "every failed concept is queued for a remediation lesson")
    }

    @Test(.timeLimit(.minutes(2))) func aMapFromMemoryIsComparedWithThePrerequisiteGraph() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let unit = try #require(ctx.curriculum.units.first)
        let map = MapSessionModel(app: app, ctx: ctx, unitId: unit.id)
        map.area.drawing = Self.scribble()
        await map.done()
        guard case .confirming(let r) = map.phase else { Issue.record("maps always confirm their reading"); return }
        // What the learner confirmed they drew: two ideas and the link between them.
        await map.confirm(r, text: "Sample spaces and events -> Probability from equally likely outcomes")
        #expect(map.phase == .result)
        let cmp = try #require(map.comparison)
        #expect(cmp.placed.count == 2)
        #expect(cmp.correctEdges.count == 1)
        #expect(cmp.missing.count == cmp.conceptCount - 2)
        #expect(map.area.marks.contains { if case .ghost = $0.kind { true } else { false } }, "missed ideas come back as ghosts")
        let queued = Set(await app.service!.queueFirst())
        #expect(queued.isSuperset(of: cmp.missing))
    }

    @Test(.timeLimit(.minutes(5))) func aTeachbackIsExplainedInInkAndGradedAfterwards() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let lesson = try #require(ctx.curriculum.allLessons.first)
        try await Self.runLesson(LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id))
        let concept = try #require(lesson.concepts.first)
        let model = TeachbackSessionModel(app: app, ctx: ctx, conceptId: concept.id)
        await model.start()
        #expect(model.entries.first?.isStudent == true, "the student opens with a question")
        for i in 0..<12 where !model.done {
            #expect(model.error == nil)
            model.activeArea.drawing = Self.scribble(i)
            await model.handIn(finished: i == 2)
        }
        #expect(model.done)
        #expect(model.graded != nil)
        let session = try #require(try await app.store.sessions(course: ctx.course.id, type: .teachback).first)
        #expect(session.endedAt != nil)
        #expect(try await app.store.ink(owner: session.id).count >= 3, "each explanation keeps its ink")
        #expect(try await app.store.receipts(session: session.id).count == 1)
    }

    // MARK: Placement

    /// A tutor under which every placement answer is right: the reader reads the reference, the grader passes it.
    static func allKnowingProvider(_ pack: Curriculum) -> MockProvider {
        let answers = pack.allItems.map { ($0.prompt, $0.reference.exact ?? $0.reference.answer) }
        return MockProvider(.init(respond: { req in
            let text = req.messages.map(\.content).joined(separator: "\n")
            switch req.role {
            case .reader:
                let answer = answers.first { text.contains($0.0) }?.1 ?? "(blank)"
                return .value(ReaderOutput(text: answer))
            case .grader:
                return .value(GradeResult(criteria: [], score: 1, feedback: "Right.", confidence: 1))
            default:
                return nil
            }
        }))
    }

    @Test(.timeLimit(.minutes(2))) func aNewcomerWhoKnowsNothingStartsAtTheBeginning() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let placement = PlacementModel(app: app, ctx: ctx)
        await placement.begin()
        var questions = 0
        while placement.phase == .answering {
            questions += 1
            await placement.dontKnow()
        }
        #expect(placement.phase == .result)
        #expect(questions <= 8, "a novice is placed in a handful of questions, took \(questions)")
        #expect(placement.result?.knownConceptIds.isEmpty == true)
        #expect(placement.startingLesson?.id == ctx.curriculum.allLessons.first?.id)
        let service = try #require(app.service)
        #expect(await service.placementDecided())
        #expect(try await service.loadToday().nextLesson?.id == ctx.curriculum.allLessons.first?.id)
        #expect(try await app.store.course(ctx.course.id)?.scaffolding == .novice)
    }

    @Test(.timeLimit(.minutes(3))) func someoneWhoKnowsItAllPlacesOutOfEveryLesson() async throws {
        let app = try await Self.enrolledApp()
        var ctx = try #require(app.context)
        ctx.provider = Self.allKnowingProvider(ctx.curriculum)
        let placement = PlacementModel(app: app, ctx: ctx)
        await placement.begin()
        var i = 0
        while i < 40 {
            switch placement.phase {
            case .answering:
                placement.area.drawing = Self.scribble(i)
                await placement.handIn(.certain)
            case .confirming(let r):
                await placement.confirm(r, text: r.text)
            case .failed(let m):
                Issue.record("placement failed: \(m)"); return
            default:
                break
            }
            if placement.phase == .result { break }
            i += 1
        }
        #expect(placement.phase == .result)
        let known = Set(placement.result?.knownConceptIds ?? [])
        #expect(known == Set(ctx.curriculum.allConcepts.map(\.id)))
        #expect((placement.result?.probes ?? 99) <= PLACEMENT_DEFAULT_MAX_PROBES)

        let service = try #require(app.service)
        #expect(try await service.completedLessons() == Set(ctx.curriculum.allLessons.map(\.id)), "every lesson is placed out of")
        let cards = try await app.store.cards(course: ctx.course.id)
        #expect(cards.allSatisfy { $0.state == .review && $0.provisional }, "placed concepts enter review provisionally")
        #expect(cards.allSatisfy { $0.due > AppModel.now() }, "and are not due today")
        let states = try await app.store.conceptStates(course: ctx.course.id)
        #expect(states.values.allSatisfy { $0.successfulSessions >= 3 })
        #expect(try await app.store.course(ctx.course.id)?.scaffolding == .advanced)
    }

    @Test(.timeLimit(.minutes(1))) func skippingThePlacementKeepsTheOfferOnToday() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let placement = PlacementModel(app: app, ctx: ctx)
        await placement.skip()
        #expect(placement.phase == .result)
        #expect(try await app.store.cards(course: ctx.course.id).allSatisfy { $0.state == .new })
        #expect(try await app.service!.loadToday().offersPlacement)
    }

    // MARK: Variants, the first wrong line and fix-it, progress checks (docs/AUDIT.md #1-#4)

    @Test(.timeLimit(.minutes(1))) func reviewsServeEachVersionOfAProblemInTurn() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let service = try #require(app.service)
        let item = try #require(ctx.curriculum.allItems.first { ($0.variants ?? []).count == 2 }, "the bundled pack carries variants")
        var seen: [String?] = []
        for _ in 0..<4 {
            let served = await service.serving(item)
            seen.append(served.variantId)
            #expect(served.item.id == item.id && served.item.prompt != "" )
            if let v = served.variantId { #expect(served.item.prompt == item.variants!.first { $0.id == v }!.prompt) }
            try await service.recordReceipt(sessionId: "s", itemId: item.id, conceptId: item.conceptId, answer: "x", confidence: nil,
                                            grade: nil, rating: .good, assisted: false, variantId: served.variantId)
            try await Task.sleep(for: .milliseconds(5))
        }
        #expect(seen == [nil, item.variants![0].id, item.variants![1].id, nil], "each version once, then the oldest")
    }

    /// Reads every ink as `readings[stage]` (the test moves `stage` on); grades an answer as right when it
    /// contains `right`, otherwise wrong with the first wrong line at `wrongLine`.
    final class StepProvider: @unchecked Sendable {
        private let lock = NSLock()
        private var _stage = 0
        let readings: [String]
        init(readings: [String]) { self.readings = readings }
        var stage: Int {
            get { lock.lock(); defer { lock.unlock() }; return _stage }
            set { lock.lock(); _stage = newValue; lock.unlock() }
        }
        func nextReading() -> String { readings[min(stage, readings.count - 1)] }
        func provider(right: String, wrongLine: String) -> MockProvider {
            MockProvider(.init(respond: { req in
                switch req.role {
                case .reader:
                    return .value(ReaderOutput(text: self.nextReading()))
                case .grader:
                    let text = req.messages.map(\.content).joined()
                    if text.contains(right) { return .value(GradeResult(criteria: [], score: 1, feedback: "Right.", confidence: 1)) }
                    return .value(GradeResult(criteria: [], score: 0.2, feedback: "Not quite.", confidence: 0.95,
                                              firstError: StepError(quote: wrongLine, why: "This counts the defective chips, not the good ones.")))
                default:
                    return nil
                }
            }))
        }
    }

    @Test(.timeLimit(.minutes(3))) func aWrongStepIsMarkedAndFixedBeforeTheAnswerIsShown() async throws {
        let app = try await Self.enrolledApp()
        var ctx = try #require(app.context)
        let itemId = "i-equally-likely-outcomes-03"
        let item = try #require(ctx.curriculum.item(itemId))
        // Only this item's card is in play: a learning card, due again a few minutes after a lesson.
        let n = AppModel.now()
        var card = try #require(try await app.store.card(course: ctx.course.id, item: itemId))
        card.due = n
        card = ctx.scheduler.applyRating(card, .again, n, ReviewContext(source: .lesson, assisted: false)).card
        try await app.store.saveCards([card])
        let later = n + 3_600_000
        ctx.now = { later }
        // "right" must be something only the learner's rewrite says: the grader's request also holds the reference.
        let steps = StepProvider(readings: ["40 chips, 6 are defective\nP = 6/40\n= 0.15", "P(good) = 34 out of 40 = 17/20"])
        ctx.provider = steps.provider(right: "34 out of 40", wrongLine: "P = 6/40")
        let review = ReviewSessionModel(app: app, ctx: ctx)
        await review.start()
        #expect(review.current?.item.id == item.id)
        review.current?.area.drawing = Self.scribble(1)
        await review.handIn(.fairlySure)
        if case .confirming(let r) = review.phase { await review.confirm(r, text: r.text) }
        guard case .receipt(let result) = review.phase else { Issue.record("no receipt: \(review.phase)"); return }
        #expect(result.firstError?.quote == "P = 6/40")
        #expect(result.canFix && !result.answerShown, "the answer waits while the learner fixes the working")
        let cardAfterReview = try #require(try await app.store.card(course: ctx.course.id, item: itemId))

        review.startFix()
        let fix = try #require(review.fix)
        #expect(fix.combinedAnswer(rewrite: "R") == "40 chips, 6 are defective\nR", "the grader sees the working up to the wrong line, then the rewrite")
        steps.stage = 1
        fix.area.drawing = Self.scribble(2)
        await fix.check()
        #expect(fix.phase == .fixed)
        let receipts = try await app.store.receipts(course: ctx.course.id).filter { $0.itemId == itemId }
        #expect(receipts.count == 2 && receipts.filter(\.assisted).count == 1, "the fix is logged as practice with help")
        #expect(try await app.store.card(course: ctx.course.id, item: itemId) == cardAfterReview, "and does not touch the schedule")
        let state = try #require(try await app.store.conceptStates(course: ctx.course.id)[item.conceptId])
        #expect(state.mixedN == 1 && state.mixedPass == 0, "only the unaided review is mixed evidence")
    }

    @Test(.timeLimit(.minutes(3))) func aProgressCheckConfirmsWhatHoldsAndSendsBackWhatSlips() async throws {
        let app = try await Self.enrolledApp()
        var ctx = try #require(app.context)
        let all = ctx.curriculum.allConcepts.map(\.id)
        try await CourseService(ctx: ctx, store: app.store).applyPlacement(knownConceptIds: all)
        let n = AppModel.now()
        #expect(try await CourseService(ctx: ctx, store: app.store).progressCheckPlan().due == false, "not on the day of placement")

        // A week later, placed-out concepts that nothing has confirmed are checked.
        let later = n + 8 * 86_400_000
        ctx.now = { later }
        ctx.provider = Self.allKnowingProvider(ctx.curriculum)
        let service = CourseService(ctx: ctx, store: app.store)
        let plan = try await service.progressCheckPlan()
        #expect(plan.due && plan.questions.count == PROGRESS_CHECK_SIZE)

        let check = ProgressCheckModel(app: app, ctx: ctx)
        await check.begin()
        let slipped = try #require(check.item?.conceptId)
        await check.dontKnow()
        var i = 0
        while check.phase != .result && i < 40 {
            switch check.phase {
            case .answering:
                check.area.drawing = Self.scribble(i)
                await check.handIn(.certain)
            case .confirming(let r):
                await check.confirm(r, text: r.text)
            case .failed(let m):
                Issue.record("check failed: \(m)"); return
            default: break
            }
            i += 1
        }
        #expect(check.phase == .result)
        #expect(check.outcomes.count == PROGRESS_CHECK_SIZE)
        #expect(check.outcomes.filter(\.held).count == PROGRESS_CHECK_SIZE - 1)
        let back = try #require(check.outcomes.first { !$0.held })
        #expect(back.conceptId == slipped && back.demoted && back.wasPlaced)

        #expect(!(await service.placedConcepts()).contains(slipped), "it is no longer placed out of")
        let lesson = try #require(ctx.curriculum.allLessons.first { $0.concepts.contains { $0.id == slipped } })
        #expect(!(try await service.completedLessons()).contains(lesson.id), "so its lesson is taught")
        let states = try await app.store.conceptStates(course: ctx.course.id)
        #expect((states[slipped]?.successfulSessions ?? 9) <= 1)
        let held = check.outcomes.filter(\.held).map(\.conceptId)
        #expect(held.allSatisfy { (states[$0]?.mixedPass ?? 0) >= 1 }, "what held up is mixed evidence")
        let cards = try await app.store.cards(course: ctx.course.id)
        let askedItems = Set(plan.questions.map(\.itemId))
        #expect(cards.filter { askedItems.contains($0.itemId) }.allSatisfy { !$0.provisional }, "asked cards are confirmed or demoted")
        #expect(try await service.progressCheckPlan().due == false, "and the next one is weeks away")
    }

    // MARK: The concept card and the worked example (UX-AUDIT §3.2, AUDIT #6)

    /// Answers a lesson until it reaches `phase` (or gives up after 40 steps).
    static func runLesson(_ model: LessonSessionModel, until phase: LessonPhase) async {
        await model.start()
        for step in 0..<40 where model.phase != phase {
            if let p = model.pendingConfirmation { await model.confirmPending(text: p.reading.text); continue }
            model.activeArea.drawing = scribble(step)
            switch model.inputMode {
            case .answer, .summary: await model.handIn()
            case .answerConfidence: await model.handIn(confidence: .fairlySure)
            default: return
            }
        }
    }

    @Test(.timeLimit(.minutes(3))) func theConceptCardIsOnThePageOnlyWhileHelpIsAllowed() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        let model = LessonSessionModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[0].id)
        await model.start()
        #expect(model.phase == .prime && !model.showsConceptCard, "nothing to lean on before you're taught")
        await Self.runLesson(model, until: .develop)
        try #require(model.phase == .develop)
        #expect(model.showsConceptCard)
        let plan = try #require(model.workedPlan)
        let concept = try #require(model.concept)
        #expect(plan.typesetSteps + plan.learnerSteps == concept.script.workedExample.steps.count)
        #expect(plan == workedExamplePlan(scaffolding: model.state!.scaffolding, conceptIndex: 0,
                                          stepCount: concept.script.workedExample.steps.count))

        // Completing the faded steps by hand, then comparing: the page keeps what was written.
        let area = model.workedArea(for: concept.id)
        area.drawing = Self.scribble(7)
        await model.revealWorkedSteps(conceptId: concept.id)
        #expect(model.workedRevealed.contains(concept.id) && !area.isEditable)
        let inks = try await app.store.ink(course: ctx.course.id)
        #expect(inks.contains { $0.ownerKind == .workedExample }, "it goes in the notebook")
    }

    @Test(.timeLimit(.minutes(1))) func aLessonsSupportComesFromWhatItBuildsOn() async throws {
        let app = try await Self.enrolledApp()
        let ctx = try #require(app.context)
        // Everything placed out of: secure prerequisites, so a later lesson starts with little support.
        try await CourseService(ctx: ctx, store: app.store).applyPlacement(knownConceptIds: ctx.curriculum.allConcepts.map(\.id))
        let later = try #require(ctx.curriculum.allLessons.last)
        let model = LessonSessionModel(app: app, ctx: ctx, lessonId: later.id)
        await model.start()
        let states = try await app.store.conceptStates(course: ctx.course.id)
        #expect(model.state?.scaffolding == lessonScaffolding(later, ctx.curriculum, states.mapValues(\.mastery),
                                                              courseDefault: ctx.course.scaffolding))
        #expect(model.state?.scaffolding != .novice)
    }
}

