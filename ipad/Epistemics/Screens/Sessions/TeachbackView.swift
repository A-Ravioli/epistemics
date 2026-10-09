import SwiftUI
import PencilKit
import EpistemicsCore
import EpistemicsLLM

/// Teach-back (DESIGN §3.6, ipad §6.7): the model plays a curious student who has read nothing; the learner
/// explains on a whiteboard-sized page and may draw. Graded blind afterwards on the confirmed readings.
/// Runner ported from web/apps/web/src/lib/services/teachback.ts.
@Observable @MainActor
final class TeachbackSessionModel {
    struct Entry: Identifiable {
        let id = UUID()
        var isStudent: Bool
        var text: String
        var area: InkAreaModel?
    }

    let app: AppModel
    let ctx: CourseContext
    let concept: Concept?
    private let reading: ReadingService
    private let service: CourseService
    private(set) var state: TeachbackState?
    var entries: [Entry] = []
    var streaming: String?
    var busy = false
    var error: String?
    var activeArea = InkAreaModel(paper: .ruled, minHeight: 340)
    var graded: Graded?
    private var sessionId = ""
    private var queue: [TeachbackEvent] = []
    private var pendingEffect: TeachbackEffect?

    init(app: AppModel, ctx: CourseContext, conceptId: String) {
        self.app = app
        self.ctx = ctx
        self.concept = ctx.curriculum.concept(conceptId)
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
        self.service = CourseService(ctx: ctx, store: app.store)
    }

    var done: Bool { state?.done ?? false }
    var canWrite: Bool { !busy && !done && error == nil && state?.grading != true && entries.last?.isStudent == true }

    func start() async {
        guard state == nil, let concept else { return }
        let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .teachback, startedAt: ctx.now())
        try? await app.store.saveSession(s)
        sessionId = s.id
        state = createTeachbackState(sessionId: s.id, courseId: ctx.course.id, concept: concept)
        await dispatch(.start)
    }

    func inkChanged() {
        reading.inkChanged(activeArea, context: readingContext)
    }

    private var readingContext: ReadingContext {
        ReadingContext(itemType: .teachback, paper: .ruled, prompt: entries.last(where: \.isStudent)?.text ?? "",
                       metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
    }

    /// Hand in this explanation; `finished` says the learner has explained it all.
    func handIn(finished: Bool) async {
        guard !activeArea.isEmpty else {
            if finished { await dispatch(.end) }
            return
        }
        let area = activeArea
        area.isEditable = false
        busy = true
        do {
            let ink = area.record(courseId: ctx.course.id, owner: .teachback, ownerId: sessionId, itemId: state?.itemId)
            try await app.store.saveInk(ink)
            let r = try await reading.read(area, inkId: ink.id, context: readingContext)
            try await app.store.saveReading(r)
            busy = false
            entries.append(Entry(isStudent: false, text: r.gradedText, area: area))
            activeArea = InkAreaModel(paper: .ruled, minHeight: 340)
            await dispatch(.learnerTurn(content: r.gradedText.isEmpty ? "(blank)" : r.gradedText, done: finished))
        } catch {
            area.isEditable = true
            busy = false
            self.error = "Couldn't read your explanation: \(error.localizedDescription)"
        }
    }

    func retry() async {
        guard let e = pendingEffect else { return }
        pendingEffect = nil
        error = nil
        if await run(e) { await pump() }
    }

    private func dispatch(_ e: TeachbackEvent) async {
        queue.append(e)
        await pump()
    }

    private func pump() async {
        while !queue.isEmpty, let s = state {
            let step = reduceTeachback(s, queue.removeFirst())
            state = step.state
            for effect in step.effects where !(await run(effect)) { return }
        }
    }

    private func run(_ effect: TeachbackEffect) async -> Bool {
        guard let concept else { return false }
        do {
            switch effect {
            case .callStudent(let control):
                busy = true
                streaming = ""
                let transcript = (state?.turns ?? []).map { t -> ChatMessage in
                    t.role == .learner ? .user(t.content) : .assistant(t.content)
                }
                let request = Student.buildRequest(StudentInput(
                    conceptName: concept.name, definition: concept.definition,
                    objectives: concept.objectives.map { StudentObjective(id: $0.id, text: $0.text) },
                    transcript: transcript,
                    control: StudentTurnControl(poseWrongBelief: control.move == .wrongBelief,
                                                wrongBelief: control.move == .wrongBelief ? concept.misconceptions.first?.description : nil,
                                                askForExample: control.move == .example, maxWords: control.maxWords,
                                                instruction: control.instruction, turn: control.turn),
                    metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id)))
                let result = try await ctx.provider.streamText(request) { [weak self] text in
                    Task { @MainActor in self?.streaming = text }
                }
                streaming = nil
                busy = false
                let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
                entries.append(Entry(isStudent: true, text: text))
                queue.append(.studentTurn(content: text))
            case .gradeItem(_, _, let answer):
                busy = true
                let g = try await GradingService.grade(ctx.provider, target: target(concept), answer: answer, confidence: nil,
                                                       metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
                graded = g
                busy = false
                queue.append(.grade(grade: g.grade, rating: g.rating))
            case let .recordReceipt(itemId, conceptId, answer, grade, rating):
                try await service.recordReceipt(sessionId: sessionId, itemId: itemId, conceptId: conceptId, answer: answer,
                                                confidence: nil, grade: grade, rating: rating, assisted: false)
            case let .teachbackComplete(conceptId, itemId, score, rating, learnerTurns):
                var card = try await app.store.card(course: ctx.course.id, item: itemId)
                if card == nil || card?.state == .new {
                    card = try await app.store.cards(course: ctx.course.id).first { $0.conceptId == conceptId && $0.state != .new && !$0.suspended }
                }
                if let card {
                    _ = try await service.applyReview(card: card, rating: rating, source: .teachback, assisted: false, confidence: nil,
                                                      durationMs: nil, receipt: nil)
                }
                if var s = try await app.store.session(sessionId) {
                    s.endedAt = ctx.now()
                    s.summary = ["conceptId": .string(conceptId), "score": .number(score), "rating": .number(Double(rating.rawValue)),
                                 "learnerTurns": .number(Double(learnerTurns))]
                    try await app.store.saveSession(s)
                }
                app.didChangeLearnerState()
            }
            return true
        } catch {
            busy = false
            streaming = nil
            pendingEffect = effect
            self.error = error.localizedDescription
            return false
        }
    }

    private func target(_ concept: Concept) -> GradeTarget {
        let item = concept.items.first { $0.type == .teachback }
        let rubric = (item?.rubric.isEmpty == false) ? item!.rubric : concept.objectives.map { RubricCriterion(id: $0.id, text: $0.text) }
        return GradeTarget(conceptId: concept.id, itemType: .teachback,
                           prompt: item?.prompt ?? "Explain \"\(concept.name)\" to a student who has never heard of it.",
                           reference: item.map { GradeReference($0.reference) } ?? GradeReference(answer: concept.definition),
                           rubric: rubric, misconceptions: concept.misconceptions)
    }
}

struct TeachbackView: View {
    @Environment(AppModel.self) private var app
    @State private var model: TeachbackSessionModel
    init(model: TeachbackSessionModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: "Explain \(model.concept?.name ?? "it")", subtitle: "To a student who has read nothing",
                          closeLabel: "Leave", onClose: { app.dismissSession() })
            ScrollViewReader { proxy in
                ScrollView {
                    FreeHandLayout(handedness: app.settings.handedness) {
                        if model.canWrite { ToolTray(tools: app.tools) }
                    } page: {
                        PageColumn {
                            ForEach(model.entries) { e in
                                if e.isStudent {
                                    MaterialText(e.text)
                                } else if let area = e.area {
                                    InkSnapshot(drawing: area.drawing, paper: area.paper, maxHeight: 420, showsPaper: false)
                                        .accessibilityLabel("Your explanation, read as: \(e.text)")
                                }
                            }
                            if let s = model.streaming { MaterialText(s.isEmpty ? "…" : s) }
                            if let error = model.error {
                                Banner(text: error, actionTitle: "Try again") { Task { await model.retry() } }
                            } else if model.busy && model.streaming == nil {
                                WorkingLine(text: model.state?.grading == true ? "Grading your explanation…" : "Reading…")
                            }
                            if model.canWrite {
                                InkArea(area: model.activeArea, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                                    .onChange(of: model.activeArea.revision) { model.inkChanged() }
                                HStack(spacing: 12) {
                                    Button("Hand in") { Task { await model.handIn(finished: false) } }
                                        .buttonStyle(.primary).disabled(model.activeArea.isEmpty)
                                    Button("That's everything") { Task { await model.handIn(finished: true) } }
                                        .buttonStyle(.ghost)
                                    Spacer()
                                }
                            }
                            if model.done, let g = model.graded, let concept = model.concept {
                                VStack(alignment: .leading, spacing: 14) {
                                    Text(g.rating.label).font(.title2x).foregroundStyle(Theme.graphite)
                                    CriteriaList(rubric: concept.items.first { $0.type == .teachback }?.rubric.nonEmpty
                                                 ?? concept.objectives.map { RubricCriterion(id: $0.id, text: $0.text) },
                                                 grade: g.grade, marks: [])
                                    MaterialText(g.grade.feedback, font: .readingSmall)
                                    Button("Done") { app.dismissSession() }.buttonStyle(.primaryLarge)
                                }
                                .padding(.top, 10)
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.top, 8).padding(.bottom, 60)
                    }
                    .padding(.horizontal, 20)
                }
                .onChange(of: model.entries.count) { withAnimation { proxy.scrollTo("bottom") } }
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .task { await model.start() }
    }
}

private extension Array {
    var nonEmpty: Self? { isEmpty ? nil : self }
}
