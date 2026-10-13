import SwiftUI
import PencilKit
import EpistemicsCore
import EpistemicsLLM

enum LessonService {
    static let remediationPrefix = "remediation:"
}

/// One thing on the lesson page, top to bottom (DESIGN §3).
struct LessonEntry: Identifiable {
    enum Kind { case tutor, learner, note }
    let id: String
    var kind: Kind
    var phase: LessonPhase
    var text: String
    /// Learner entries: the handed-in ink, read-only, with any tutor mark.
    var area: InkAreaModel?
    var inkId: String?
}

/// What the lesson page persists besides the reducer state, so a relaunch resumes (web LessonRunner).
struct PersistedLesson: Codable {
    struct Entry: Codable {
        var id: String
        var kind: String
        var phase: LessonPhase
        var text: String
        var inkId: String?
    }
    var version = 1
    var state: LessonState
    var entries: [Entry]
}

/// The lesson runner (port of web/apps/web/src/lib/services/lesson.ts): owns the LessonState, runs the pure
/// reducer, executes its effects against the LLM layer and the store, and persists after every step.
@Observable @MainActor
final class LessonSessionModel {
    enum InputMode: Equatable { case answer, answerConfidence, summary, jol, done }
    enum Busy: Equatable { case tutor, reading, observer, grading, saving, working }

    let app: AppModel
    let ctx: CourseContext
    let lessonId: String
    private(set) var lesson: Lesson?
    private(set) var state: LessonState?
    var entries: [LessonEntry] = []
    var streaming: String?
    var busy: Busy?
    var error: String?
    var activeArea = InkAreaModel(paper: .ruled)
    var lastGrade: Graded?
    let isRemediation: Bool
    /// The learner's completion of each concept's faded worked example, and which have been compared.
    private(set) var workedAreas: [String: InkAreaModel] = [:]
    private(set) var workedRevealed: Set<String> = []

    private let service: CourseService
    private let reading: ReadingService
    private var sessionId = ""
    private var queue: [LessonEvent] = []
    private var pumping = false
    private var pendingEffect: LessonEffect?
    private var previousTurnNoProgress = false
    private var learnerModelText = ""
    private var contextCache: [String: String] = [:]
    private var lastLearnerInkId: String?
    private var lastLearnerConfidence: Confidence?

    init(app: AppModel, ctx: CourseContext, lessonId: String) {
        self.app = app
        self.ctx = ctx
        self.lessonId = lessonId
        self.isRemediation = lessonId.hasPrefix(LessonService.remediationPrefix)
        self.service = CourseService(ctx: ctx, store: app.store)
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
    }

    var concept: Concept? { state.flatMap { s in lesson.flatMap { currentConcept(s, $0) } } }
    var phase: LessonPhase { state?.phase ?? .prime }

    var inputMode: InputMode {
        guard let s = state else { return .answer }
        if s.done { return .done }
        if s.phase == .wrap { return s.jolPending ? .jol : .summary }
        if s.phase == .prime || s.phase == .check { return .answerConfidence }
        return .answer
    }

    /// The learner may write only when the tutor has asked and nothing is running.
    var canWrite: Bool { busy == nil && !pumping && error == nil && inputMode != .done && inputMode != .jol && (entries.last?.kind != .learner) }

    /// Unaided phases fold away everything above the current question (DESIGN §3).
    var foldsPage: Bool { phase.isUnaided }

    // MARK: The concept card and the worked example (UX-AUDIT §3.2, AUDIT #6)

    /// The card is on the page while help is allowed, never while the learner answers alone or restates the idea.
    var showsConceptCard: Bool { concept != nil && conceptCardAllowed(phase) && inputMode != .done }

    /// How the current concept's worked example is shown: whole to study, or faded with the rest to write.
    var workedPlan: WorkedExamplePlan? {
        guard let s = state, let c = concept else { return nil }
        return workedExamplePlan(scaffolding: s.scaffolding, conceptIndex: s.conceptIndex, stepCount: c.script.workedExample.steps.count)
    }

    /// The learner has had a go at the tutor's question in this phase (an advanced learner's example opens then).
    var hasAttempted: Bool { (state?.attemptsThisPhase ?? 0) > 0 || (state?.hintLevel ?? 0) > 0 }

    func workedArea(for conceptId: String) -> InkAreaModel {
        if let a = workedAreas[conceptId] { return a }
        let a = InkAreaModel(paper: .ruled, minHeight: InkAreaModel.defaultHeight(for: .ruled, lines: 3))
        workedAreas[conceptId] = a
        return a
    }

    /// Show the steps the learner was completing, beside what they wrote. The ink goes in the notebook.
    func revealWorkedSteps(conceptId: String) async {
        workedRevealed.insert(conceptId)
        guard let area = workedAreas[conceptId], !area.isEmpty else { return }
        area.isEditable = false
        let ink = area.record(courseId: ctx.course.id, owner: .workedExample, ownerId: sessionId, itemId: nil)
        try? await app.store.saveInk(ink)
    }

    var phaseLine: String {
        guard let s = state else { return "" }
        switch s.phase {
        case .prime: return "Before you're taught · no help"
        case .probe: return "What you already know"
        case .develop: return "Working it out · hint \(s.hintLevel) of \(MAX_HINT_LEVEL)"
        case .consolidate: return "In your own words"
        case .extend: return "Somewhere new · hint \(s.hintLevel) of \(MAX_HINT_LEVEL)"
        case .check: return "Check · no help"
        case .remediate: return "Going back over it"
        case .wrap: return "Wrapping up"
        case .done: return "Done"
        }
    }

    // MARK: Opening

    func start() async {
        guard lesson == nil else { return }
        do {
            try await open()
            if let s = state, !s.started {
                await dispatch(.start)
            } else {
                await resume()
            }
        } catch {
            self.error = "Couldn't open the lesson: \(error)"
        }
    }

    private func open() async throws {
        var fresh: LessonState
        var lessonValue: Lesson
        var unitId: String?
        if isRemediation {
            let conceptId = String(lessonId.dropFirst(LessonService.remediationPrefix.count))
            guard let concept = ctx.curriculum.concept(conceptId) else { throw ServiceError("Concept not found") }
            unitId = ctx.curriculum.unit(containingConcept: conceptId)?.id
            let cs = try await app.store.conceptStates(course: ctx.course.id)[conceptId]
            // Going back over something that didn't hold: full support, the worked example first.
            let plan = composeRemediation(concept, sessionId: "", courseId: ctx.course.id, scaffolding: .novice,
                                          learnerMisconceptions: cs?.misconceptions)
            lessonValue = plan.lesson
            fresh = plan.state
        } else {
            guard let l = ctx.curriculum.lesson(lessonId) else { throw ServiceError("Lesson not found") }
            lessonValue = l
            unitId = ctx.curriculum.unit(containingLesson: lessonId)?.id
            let states = try await app.store.conceptStates(course: ctx.course.id)
            var misconceptions: [String: [String]] = [:]
            for c in l.concepts { if let m = states[c.id]?.misconceptions, !m.isEmpty { misconceptions[c.id] = m } }
            // Support for this lesson comes from how secure what it builds on is (AUDIT #6), not one course-wide level.
            let scaffolding = lessonScaffolding(l, ctx.curriculum, states.mapValues(\.mastery), courseDefault: ctx.course.scaffolding)
            fresh = createLessonState(CreateLessonStateInput(sessionId: "", courseId: ctx.course.id, lesson: l,
                                                             scaffolding: scaffolding, learnerMisconceptions: misconceptions))
        }
        lesson = lessonValue

        let open = try await app.store.sessions(course: ctx.course.id, type: .lesson).first { $0.endedAt == nil && $0.lessonId == lessonId }
        if let open, let saved = try await app.store.sessionState(open.id, as: PersistedLesson.self), saved.state.lessonId == lessonValue.id {
            sessionId = open.id
            state = saved.state
            entries = try await restore(saved.entries)
        } else {
            let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .lesson, lessonId: lessonId, unitId: unitId, startedAt: ctx.now())
            try await app.store.saveSession(s)
            sessionId = s.id
            fresh.sessionId = s.id
            state = fresh
        }
        learnerModelText = try await learnerModel(focus: lessonValue.concepts.map(\.id))
        prepareActiveArea()
    }

    private func restore(_ saved: [PersistedLesson.Entry]) async throws -> [LessonEntry] {
        var out: [LessonEntry] = []
        for e in saved {
            var area: InkAreaModel?
            if let inkId = e.inkId, let ink = try await app.store.ink(inkId), let d = try? PKDrawing(data: ink.drawing) {
                let a = InkAreaModel(paper: ink.paper, drawing: d)
                a.isEditable = false
                a.marks = (try? await app.store.marks(inkId: inkId)) ?? []
                area = a
            }
            out.append(LessonEntry(id: e.id, kind: e.kind == "tutor" ? .tutor : e.kind == "learner" ? .learner : .note,
                                   phase: e.phase, text: e.text, area: area, inkId: e.inkId))
        }
        return out
    }

    /// Re-issue the effect that was in flight when the app quit (web LessonRunner.start).
    private func resume() async {
        guard let s = state, !s.done else { return }
        if let pending = s.pendingGrades.values.first, entries.last?.kind == .learner {
            // A grade was in flight when the app quit: grade the last answer again.
            let source: RubricSource = pending.kind == .transfer ? .scriptTransfer
                : pending.kind == .consolidate ? (pending.itemId.contains("#") ? .scriptPretest : .item) : .scriptPretest
            do {
                busy = .grading
                let target = try GradingService.target(itemId: pending.itemId, rubricSource: source, kind: pending.kind, in: ctx.curriculum)
                let graded = try await GradingService.grade(ctx.provider, target: target, answer: pending.answer,
                                                            confidence: pending.assisted ? nil : pending.confidence)
                busy = nil
                lastGrade = graded
                await dispatch(.grade(itemKind: pending.kind, itemId: pending.itemId, grade: graded.grade, rating: graded.rating))
            } catch {
                busy = nil
                self.error = error.localizedDescription
            }
            return
        }
        let waitingForTutor = s.lastControl != nil && entries.last?.kind != .tutor && s.phase != .wrap
        if waitingForTutor, let control = s.lastControl {
            await run(.callTutor(control: control))
            await pump()
        }
    }

    private func learnerModel(focus: [String]) async throws -> String {
        let states = try await app.store.conceptStates(course: ctx.course.id)
        let names = Dictionary(ctx.curriculum.allConcepts.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
        let receipts = try await app.store.receipts(course: ctx.course.id)
        let pairs = receipts.filter { !$0.assisted }.suffix(200).compactMap { r in r.confidence.map { CalibrationPair(confidence: $0, correct: r.rating.rawValue >= 3) } }
        let lastSummary = try await app.store.sessions(course: ctx.course.id, type: .lesson)
            .first { $0.endedAt != nil && $0.summary?["summaryText"]?.stringValue != nil }?.summary?["summaryText"]?.stringValue
        let summary = summarizeLearnerModel(SummarizeLearnerModelInput(
            course: ctx.course, conceptStates: Array(states.values), conceptNames: names, calibration: brierScore(Array(pairs)),
            lastLessonSummary: lastSummary))
        return renderLearnerModel(summary, focus)
    }

    private func prepareActiveArea() {
        let paper: Paper = switch phase {
        case .prime, .check, .extend: .squared
        default: .ruled
        }
        activeArea = InkAreaModel(paper: paper)
    }

    // MARK: Learner actions

    func inkChanged() {
        reading.inkChanged(activeArea, context: readingContext)
    }

    private var readingContext: ReadingContext {
        ReadingContext(itemType: phase == .consolidate ? .explain : .apply, paper: activeArea.paper,
                       prompt: entries.last(where: { $0.kind == .tutor })?.text ?? "",
                       metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
    }

    /// Hand in the current ink (with a confidence in PRIME and CHECK).
    func handIn(confidence: Confidence? = nil) async {
        guard !activeArea.isEmpty, busy == nil else { return }
        let area = activeArea
        area.isEditable = false
        busy = .reading
        do {
            let owner: InkOwner = inputMode == .summary ? .lessonSummary : .lessonTurn
            let ink = area.record(courseId: ctx.course.id, owner: owner, ownerId: sessionId, itemId: nil)
            try await app.store.saveInk(ink)
            var r = try await reading.read(area, inkId: ink.id, context: readingContext)
            try await app.store.saveReading(r)
            if phase == .check, !r.uncertain.isEmpty {
                // Unaided checks are graded, so a doubtful reading is confirmed first (DESIGN §5.3).
                busy = nil
                pendingConfirmation = (r, ink.id, confidence)
                return
            }
            r.inkId = ink.id
            await submit(reading: r, inkId: ink.id, area: area, confidence: confidence)
        } catch {
            area.isEditable = true
            busy = nil
            self.error = "Couldn't read your answer: \(error.localizedDescription)"
        }
    }

    var pendingConfirmation: (reading: InkReading, inkId: String, confidence: Confidence?)?

    func confirmPending(text: String) async {
        guard var p = pendingConfirmation else { return }
        pendingConfirmation = nil
        p.reading.confirmedText = text
        p.reading.confirmedAt = ctx.now()
        try? await app.store.saveReading(p.reading)
        await submit(reading: p.reading, inkId: p.inkId, area: activeArea, confidence: p.confidence)
    }

    private func submit(reading r: InkReading, inkId: String, area: InkAreaModel, confidence: Confidence?) async {
        busy = nil
        let text = r.gradedText.isEmpty ? "(blank)" : r.gradedText
        lastLearnerInkId = inkId
        lastLearnerConfidence = confidence
        lastReading = r
        entries.append(LessonEntry(id: inkId, kind: .learner, phase: phase, text: text, area: area, inkId: inkId))
        if inputMode == .summary {
            await dispatch(.summarySubmitted(text: text))
        } else {
            await dispatch(.learnerTurn(content: text, confidence: confidence))
        }
    }

    private var lastReading: InkReading?

    func giveUp() async {
        guard busy == nil else { return }
        entries.append(LessonEntry(id: UUID().uuidString, kind: .note, phase: phase, text: "You gave up on this one. It costs the question an Again, and that's fine."))
        await dispatch(.giveUp)
    }

    func submitJol(_ predictions: [String: Double]) async {
        await dispatch(.jolSubmitted(predictions: predictions))
    }

    func retry() async {
        guard let eff = pendingEffect else { return }
        pendingEffect = nil
        error = nil
        await run(eff)
        await pump()
    }

    /// "That's not what I wrote": the learner corrects a lesson turn's reading by writing it again.
    func misread(_ entry: LessonEntry) {
        entries.append(LessonEntry(id: UUID().uuidString, kind: .note, phase: phase,
                                   text: "Read as “\(entry.text)”. If that's wrong, write it again more plainly below; the tutor will take the new reading."))
    }

    // MARK: Engine

    private func dispatch(_ event: LessonEvent) async {
        queue.append(event)
        await pump()
    }

    private func pump() async {
        guard !pumping, let lesson else { return }
        pumping = true
        defer {
            pumping = false
            if busy == .working { busy = nil }
        }
        while !queue.isEmpty, let s = state {
            let event = queue.removeFirst()
            let step = reduceLesson(s, event, lesson)
            let phaseChanged = step.state.phase != s.phase
            state = step.state
            await persist()
            for effect in step.effects {
                if !(await run(effect)) { break }
            }
            if phaseChanged || entries.last?.kind == .tutor { prepareActiveArea() }
        }
    }

    /// Execute one effect. Returns false when it failed and was parked for `retry()`.
    @discardableResult
    private func run(_ effect: LessonEffect) async -> Bool {
        do {
            switch effect {
            case .callTutor(let control):
                try await callTutor(control)
            case .callObserver(let learnerTurn, let conceptId, _):
                try await callObserver(learnerTurn: learnerTurn, conceptId: conceptId)
            case .gradeItem(let g):
                busy = .grading
                let target = try GradingService.target(itemId: g.itemId, rubricSource: g.rubricSource, kind: g.itemKind, in: ctx.curriculum)
                let graded = try await GradingService.grade(ctx.provider, target: target, answer: g.answer,
                                                            confidence: g.assisted ? nil : g.confidence,
                                                            metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
                lastGrade = graded
                busy = nil
                queue.append(.grade(itemKind: g.itemKind, itemId: g.itemId, grade: graded.grade, rating: graded.rating))
            case .recordReceipt(let r):
                try await service.recordReceipt(sessionId: sessionId, itemId: r.itemId, conceptId: r.conceptId, answer: r.answer,
                                                confidence: r.confidence, grade: r.grade, rating: r.rating, assisted: r.assisted,
                                                inkId: lastLearnerInkId)
                if let grade = r.grade, let inkId = lastLearnerInkId, !r.assisted, r.itemKind == .check,
                   let entry = entries.last(where: { $0.inkId == inkId }), let area = entry.area {
                    // The unaided check comes back marked like a review receipt.
                    let rubric = (try? GradingService.target(itemId: r.itemId, rubricSource: .scriptPretest, kind: .check, in: ctx.curriculum).rubric) ?? []
                    area.marks = await MarkPlacement.receiptMarks(grade: grade, rubric: rubric, drawing: area.drawing, reading: reading)
                    try? await app.store.saveMarks(inkId: inkId, area.marks)
                }
            case .activateItems(let conceptId, let firstRating):
                try await service.activateConcept(conceptId, firstRating: firstRating)
                if firstRating.rawValue >= 3 { try await service.grantImplicitCredit(passedConceptId: conceptId) }
            case .showMessage(let text):
                if !text.trimmingCharacters(in: .whitespaces).isEmpty {
                    entries.append(LessonEntry(id: UUID().uuidString, kind: .note, phase: phase, text: text))
                    await persist()
                }
            case .requestSummary, .requestJol:
                break // derived from state.phase / state.jolPending
            case .scheduleRemediation(let conceptId):
                await service.addPendingRemediation(conceptId)
            case .lessonComplete(let results):
                try await complete(results)
            }
            return true
        } catch {
            busy = nil
            streaming = nil
            pendingEffect = effect
            self.error = error.localizedDescription
            return false
        }
    }

    private func callTutor(_ control: TutorControl) async throws {
        guard let lesson else { return }
        let conceptId = control.conceptId.isEmpty ? (concept?.id ?? lesson.concepts[0].id) : control.conceptId
        let context: String
        if let cached = contextCache[conceptId] { context = cached } else {
            context = try Tutor.buildCurriculumContext(lesson, focusConceptId: conceptId)
            contextCache[conceptId] = context
        }
        busy = .tutor
        streaming = ""
        // iPad: the concept card and the worked example are on the learner's page in these phases.
        let pageNote = conceptCardAllowed(control.phase)
            ? " The concept card and the worked example (numbered steps) are on the learner's page beside this dialogue: point to a step by its number rather than restating the example."
            : ""
        let input = TutorInput(curriculumContext: context, learnerModelText: learnerModelText, transcript: transcriptMessages(),
                               control: TutorTurnControl(phase: control.phase, conceptId: control.conceptId, hintLevel: control.hintLevel,
                                                         maxWords: control.maxWords, instruction: control.instruction + pageNote,
                                                         allowHintContent: control.allowHintContent != nil,
                                                         objectiveId: control.objectiveIds.first),
                               metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
        let refs = Tutor.leakReferences(for: currentConcept(state!, lesson), phase: control.phase)
        let outcome = try await Tutor.runTurn(ctx.provider, input: input, leakReferences: refs) { [weak self] text in
            Task { @MainActor in self?.streaming = text }
        }
        streaming = nil
        busy = nil
        switch outcome {
        case .turn(let text, _, _, _):
            entries.append(LessonEntry(id: UUID().uuidString, kind: .tutor, phase: control.phase, text: text))
            queue.append(.tutorTurn(content: text))
        case .leaked:
            queue.append(.leakDetected)
        }
    }

    /// The transcript as chat; the latest learner turn carries its image when it contains a drawing (DESIGN §13.3).
    private func transcriptMessages() -> [ChatMessage] {
        guard let s = state else { return [] }
        var out: [ChatMessage] = []
        let lastLearner = s.transcript.lastIndex { $0.role == .learner }
        for (i, t) in s.transcript.enumerated() {
            switch t.role {
            case .learner:
                var images: [ImageContent] = []
                if i == lastLearner, lastReading?.diagram != nil, let area = entries.last(where: { $0.kind == .learner })?.area,
                   let png = InkRenderer.png(area.drawing) {
                    images = [.png(png)]
                }
                out.append(.user(t.content, images: images))
            case .tutor: out.append(.assistant(t.content))
            case .system: break
            }
        }
        return out
    }

    private func callObserver(learnerTurn: String, conceptId: String) async throws {
        guard let lesson, let concept = lesson.concepts.first(where: { $0.id == conceptId }) else { return }
        busy = .observer
        let tutorBefore = state?.transcript.last(where: { $0.role == .tutor })?.content ?? ""
        let entry = entries.last { $0.kind == .learner }
        let area = entry?.area
        let ink = area.map { a in
            InkSummary(secondsToFirstStroke: a.firstStrokeMs.map { Double($0) / 1000 }, secondsWriting: Double(a.writingMs) / 1000,
                       crossedOut: lastReading?.crossedOut ?? [], drewDiagram: lastReading?.diagram != nil)
        }
        let result = try await Observer.observe(ctx.provider, InkObserveInput(
            ObserveInput(learnerTurn: learnerTurn, tutorTurnBefore: tutorBefore, concept: ObserverConcept(concept),
                         sourcesLoaded: !concept.spans.isEmpty, previousTurnNoProgress: previousTurnNoProgress,
                         metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id)),
            phase: phase, ink: ink)).value
        previousTurnNoProgress = !result.observation.attemptMade || result.observation.objectiveProgress.allSatisfy { $0.status == .none }
        // At most one mark per dialogue turn, and none in unaided phases (DESIGN §5.5).
        if let mark = result.mark, !phase.isUnaided, let area, let inkId = entry?.inkId,
           let placed = await MarkPlacement.turnMark(quote: mark.quote, note: mark.note, drawing: area.drawing, reading: reading) {
            area.marks = [placed]
            try? await app.store.saveMarks(inkId: inkId, [placed])
        }
        busy = nil
        queue.append(.observer(result.observation))
    }

    private func complete(_ results: LessonResults) async throws {
        busy = .saving
        let n = ctx.now()
        for (conceptId, p) in results.jol ?? [:] {
            try await app.store.saveJOL(JudgmentOfLearning(id: uuidv7(n), sessionId: sessionId, courseId: ctx.course.id, conceptId: conceptId,
                                                           predictedRecall: p, createdAt: n))
        }
        if var s = try await app.store.session(sessionId) {
            s.endedAt = n
            var summary: [String: JSONValue] = ["lessonId": .string(lesson?.id ?? lessonId), "remediation": .bool(isRemediation)]
            if let text = results.summaryText { summary["summaryText"] = .string(text) }
            summary["checks"] = .object(results.checkResults.mapValues { .number(Double($0.rating.rawValue)) })
            s.summary = summary
            try await app.store.saveSession(s)
        }
        try await app.store.deleteSessionState(sessionId)
        if isRemediation, let id = lesson?.concepts.first?.id { await service.removePendingRemediation(id) }
        busy = nil
        app.didChangeLearnerState()
    }

    private func persist() async {
        guard let s = state, !s.done else { return }
        let saved = PersistedLesson(state: s, entries: entries.map {
            .init(id: $0.id, kind: $0.kind == .tutor ? "tutor" : $0.kind == .learner ? "learner" : "note", phase: $0.phase, text: $0.text, inkId: $0.inkId)
        })
        try? await app.store.saveSessionState(sessionId, saved)
    }
}
