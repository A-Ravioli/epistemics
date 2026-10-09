import SwiftUI
import PencilKit
import EpistemicsCore
import EpistemicsLLM

/// The checkpoint (DESIGN §3.5, ipad §6.5): a real paper. Every question on one sheet, answered in any order,
/// handed in once; then read, confirmed, blind-graded and returned marked.
@Observable @MainActor
final class CheckpointSessionModel {
    enum Phase: Equatable { case loading, writing, reading, confirming, grading, returned, failed(String) }

    struct Question: Identifiable {
        var id: String { item.id }
        var item: Item
        var area: InkAreaModel
        var confidence: Confidence?
        var reading: InkReading?
        var inkId: String?
        var graded: Graded?
    }

    let app: AppModel
    let ctx: CourseContext
    let unit: Unit?
    private let reading: ReadingService
    private let service: CourseService
    var phase: Phase = .loading
    var questions: [Question] = []
    var result: CheckpointResult?
    private var state: CheckpointState?
    private var sessionId = ""

    init(app: AppModel, ctx: CourseContext, unitId: String) {
        self.app = app
        self.ctx = ctx
        self.unit = ctx.curriculum.units.first { $0.id == unitId }
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
        self.service = CourseService(ctx: ctx, store: app.store)
    }

    var attempted: Int { questions.filter { !$0.area.isEmpty }.count }
    var needsConfirmation: [Int] { questions.indices.filter { questions[$0].reading.map { !$0.uncertain.isEmpty } ?? false } }

    func start() async {
        guard phase == .loading, let unit else { return }
        do {
            let open = try await app.store.sessions(course: ctx.course.id, type: .checkpoint).first { $0.endedAt == nil && $0.unitId == unit.id }
            if let open, let saved = try await app.store.sessionState(open.id, as: CheckpointState.self), !saved.done {
                sessionId = open.id
                state = saved
            } else {
                let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .checkpoint, unitId: unit.id, startedAt: ctx.now())
                try await app.store.saveSession(s)
                sessionId = s.id
                let mastery = try await app.store.conceptStates(course: ctx.course.id).mapValues(\.mastery)
                let previous = ctx.curriculum.units.filter { $0.ordinal < unit.ordinal }
                let items = composeCheckpoint(ComposeCheckpointInput(unit: unit, previousUnits: previous, conceptMastery: mastery,
                                                                     rng: mulberry32(UInt32(truncatingIfNeeded: ctx.now() % 2_147_483_647))))
                state = createCheckpointState(sessionId: s.id, courseId: ctx.course.id, unitId: unit.id, items: items)
                try await app.store.saveSessionState(s.id, state!)
            }
            questions = (state?.items ?? []).compactMap { ref in
                ctx.curriculum.item(ref.itemId).map { item in
                    let paper = inkPaper(for: item)
                    return Question(item: item, area: InkAreaModel(paper: paper.paper, minHeight: InkAreaModel.defaultHeight(for: paper.paper, lines: paper.lines)))
                }
            }
            phase = .writing
        } catch {
            phase = .failed("Couldn't set the paper: \(error)")
        }
    }

    func setConfidence(_ c: Confidence, for index: Int) { questions[index].confidence = c }

    /// Hand in the paper: read every answer, then ask about any doubtful reading, then grade.
    func handIn() async {
        phase = .reading
        do {
            for i in questions.indices {
                let q = questions[i]
                q.area.isEditable = false
                guard !q.area.isEmpty else { continue }
                let ink = q.area.record(courseId: ctx.course.id, owner: .checkpoint, ownerId: sessionId, itemId: q.item.id)
                try await app.store.saveInk(ink)
                let r = try await reading.read(q.area, inkId: ink.id,
                                               context: ReadingContext(itemType: q.item.type, paper: q.area.paper, prompt: q.item.prompt,
                                                                       metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id)))
                try await app.store.saveReading(r)
                questions[i].reading = r
                questions[i].inkId = ink.id
            }
            phase = .confirming
        } catch {
            for q in questions { q.area.isEditable = true }
            phase = .failed("Couldn't read the paper: \(error.localizedDescription)")
        }
    }

    func confirm(index: Int, text: String) {
        guard var r = questions[index].reading else { return }
        r.confirmedText = text
        r.confirmedAt = ctx.now()
        questions[index].reading = r
        Task { try? await app.store.saveReading(r) }
    }

    /// Feeds the reducer every answer in order, executing its effects (port of the web CheckpointRunner).
    func grade() async {
        guard var s = state else { return }
        phase = .grading
        do {
            var events: [CheckpointEvent] = s.started ? [] : [.start]
            for q in questions {
                events.append(.answerSubmitted(itemId: q.item.id, answer: q.reading?.gradedText ?? "(no answer)",
                                               confidence: q.confidence ?? .guess))
            }
            while !events.isEmpty {
                let step = reduceCheckpoint(s, events.removeFirst())
                s = step.state
                if !s.done { try await app.store.saveSessionState(sessionId, s) }
                for effect in step.effects {
                    switch effect {
                    case .presentItem:
                        break
                    case let .gradeItem(itemId, _, answer, confidence):
                        guard let i = questions.firstIndex(where: { $0.item.id == itemId }) else { continue }
                        let target = GradingService.target(for: questions[i].item, in: ctx.curriculum)
                        let graded = try await GradingService.grade(ctx.provider, target: target, answer: answer, confidence: confidence,
                                                                    metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
                        questions[i].graded = graded
                        events.insert(.grade(itemId: itemId, grade: graded.grade, rating: graded.rating), at: 0)
                    case let .recordReceipt(itemId, conceptId, answer, confidence, grade, rating):
                        let inkId = questions.first { $0.item.id == itemId }?.inkId
                        try await service.recordReceipt(sessionId: sessionId, itemId: itemId, conceptId: conceptId, answer: answer,
                                                        confidence: confidence, grade: grade, rating: rating, assisted: false, inkId: inkId)
                        // The checkpoint answer is a real unaided retrieval of the item: log it as a review.
                        if let card = try await app.store.card(course: ctx.course.id, item: itemId), card.state != .new {
                            _ = try await service.applyReview(card: card, rating: rating, source: .checkpoint, assisted: false,
                                                              confidence: confidence, durationMs: nil, receipt: nil,
                                                              implicitCredit: rating.rawValue >= 3)
                        }
                    case let .checkpointComplete(r):
                        result = r
                        for conceptId in r.reopen {
                            try await service.rescheduleConceptAgain(conceptId)
                            await service.addPendingRemediation(conceptId)
                        }
                        if var session = try await app.store.session(sessionId) {
                            session.endedAt = ctx.now()
                            session.summary = ["passed": .array(r.perConcept.filter(\.value.passed).map { .string($0.key) }),
                                               "reopen": .array(r.reopen.map { .string($0) })]
                            try await app.store.saveSession(session)
                        }
                        try await app.store.deleteSessionState(sessionId)
                    }
                }
            }
            state = s
            await placeMarks()
            phase = .returned
            app.didChangeLearnerState()
        } catch {
            state = s
            phase = .failed("Couldn't finish grading: \(error.localizedDescription)")
        }
    }

    private func placeMarks() async {
        for i in questions.indices {
            guard let graded = questions[i].graded, let inkId = questions[i].inkId else { continue }
            let marks = await MarkPlacement.receiptMarks(grade: graded.grade, rubric: GradingService.target(for: questions[i].item, in: ctx.curriculum).rubric,
                                                         drawing: questions[i].area.drawing, reading: reading)
            questions[i].area.marks = marks
            try? await app.store.saveMarks(inkId: inkId, marks)
        }
    }
}

struct CheckpointView: View {
    @Environment(AppModel.self) private var app
    @State private var model: CheckpointSessionModel
    init(model: CheckpointSessionModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: "\(model.unit?.title ?? "Unit") checkpoint",
                          subtitle: model.phase == .writing ? "No help on this paper · \(model.attempted) of \(model.questions.count) attempted" : nil,
                          closeLabel: "Put the paper away", onClose: { app.dismissSession() }) {
                if model.phase == .writing {
                    Button("Hand in the paper") { Task { await model.handIn() } }.buttonStyle(.secondary)
                }
            }
            ScrollViewReader { proxy in
                HStack(alignment: .top, spacing: 0) {
                    if app.settings.handedness == .right, model.phase == .writing { ToolTray(tools: app.tools).frame(width: 84).padding(.top, 16) }
                    ScrollView {
                        paper.padding(.vertical, 8)
                    }
                    .frame(maxWidth: .infinity)
                    if model.phase == .writing {
                        QuestionIndex(questions: model.questions) { id in withAnimation { proxy.scrollTo(id, anchor: .top) } }
                            .frame(width: 72)
                    }
                    if app.settings.handedness == .left, model.phase == .writing { ToolTray(tools: app.tools).frame(width: 84).padding(.top, 16) }
                }
            }
        }
        .background(Theme.desk.ignoresSafeArea())
        .task { await model.start() }
    }

    private var paper: some View {
        VStack(alignment: .leading, spacing: 30) {
            switch model.phase {
            case .loading: WorkingLine(text: "Setting the paper…")
            case .failed(let m): Banner(text: m)
            case .reading: WorkingLine(text: "Reading your paper…")
            case .grading: WorkingLine(text: "Marking. The grader sees only the words, never your page.")
            case .confirming: confirmation
            case .returned: summary
            case .writing: EmptyView()
            }
            ForEach(Array(model.questions.enumerated()), id: \.element.id) { index, q in
                question(index, q).id(q.id)
            }
        }
        .padding(.horizontal, 56)
        .padding(.vertical, 40)
        .frame(maxWidth: 860)
        .background(RoundedRectangle(cornerRadius: 6).fill(Theme.sheet).shadow(color: .black.opacity(0.08), radius: 2, y: 1).shadow(color: .black.opacity(0.06), radius: 18, y: 10))
        .frame(maxWidth: .infinity)
    }

    private func question(_ index: Int, _ q: CheckpointSessionModel.Question) -> some View {
        HStack(alignment: .top, spacing: 18) {
            Text("\(index + 1)").font(.system(size: 19, weight: .semibold, design: .serif)).frame(width: 28, alignment: .leading)
            VStack(alignment: .leading, spacing: 10) {
                MaterialText(q.item.prompt, font: .system(size: 19, design: .serif))
                InkArea(area: q.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                if model.phase == .writing {
                    HStack(spacing: 8) {
                        Text("How sure?").font(.secondary).foregroundStyle(Theme.muted)
                        ForEach(Confidence.allCases, id: \.self) { c in
                            let selected = q.confidence == c
                            Button(c.label) { model.setConfidence(c, for: index) }
                                .font(.secondary)
                                .foregroundStyle(selected ? Theme.onGraphite : Theme.graphite)
                                .padding(.horizontal, 12).frame(minHeight: 36)
                                .background(Capsule().fill(selected ? Theme.graphite : Theme.fill))
                                .buttonStyle(.plain)
                        }
                    }
                }
                if model.phase == .confirming, let r = q.reading, !r.uncertain.isEmpty {
                    ConfirmReadingView(reading: r) { text in model.confirm(index: index, text: text) }
                }
                if model.phase == .returned, let g = q.graded {
                    Text(g.rating.label).font(.heading).foregroundStyle(Theme.graphite)
                    CriteriaList(rubric: GradingService.target(for: q.item, in: model.ctx.curriculum).rubric, grade: g.grade, marks: q.area.marks)
                    MaterialText(g.grade.feedback, font: .readingSmall)
                }
            }
        }
    }

    private var confirmation: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Before it's marked").font(.title2x).foregroundStyle(Theme.graphite)
            Text(model.needsConfirmation.isEmpty
                 ? "Every answer read cleanly. The grader will see these readings, never your page."
                 : "A few words were hard to read. Check them below, then send the paper for marking.")
                .font(.body15).foregroundStyle(Theme.muted)
            Button("Send for marking") { Task { await model.grade() } }.buttonStyle(.primaryLarge)
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let r = model.result {
                let passed = r.perConcept.values.filter(\.passed).count
                Text("Passed \(passed) of \(r.perConcept.count) concepts").font(.title2x).foregroundStyle(Theme.graphite)
                if !r.reopen.isEmpty {
                    Text("Going back over: " + r.reopen.compactMap { model.ctx.curriculum.concept($0)?.name }.joined(separator: ", ") + ". A short lesson on each comes before the next unit.")
                        .font(.body15).foregroundStyle(Theme.muted)
                }
            }
            Button("Back to Today") { app.dismissSession() }.buttonStyle(.primaryLarge)
        }
    }
}

/// The column of question numbers on the free-hand side.
struct QuestionIndex: View {
    let questions: [CheckpointSessionModel.Question]
    let jump: (String) -> Void
    var body: some View {
        VStack(spacing: 6) {
            ForEach(Array(questions.enumerated()), id: \.element.id) { i, q in
                Button { jump(q.id) } label: {
                    Text("\(i + 1)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(q.area.isEmpty ? Theme.muted : Theme.onGraphite)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(q.area.isEmpty ? Color.clear : Theme.graphite))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Question \(i + 1)\(q.area.isEmpty ? "" : ", attempted")")
            }
        }
        .padding(.top, 24)
    }
}
