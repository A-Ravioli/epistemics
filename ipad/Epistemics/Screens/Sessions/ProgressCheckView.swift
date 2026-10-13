import SwiftUI
import EpistemicsCore
import EpistemicsLLM

/// A progress check (ipad docs/AUDIT.md #4): about six questions from across everything learned or placed
/// out of, mixed, by hand, no help, no marks until the end. It measures, so it is quiet like the placement.
/// What holds up is evidence towards "mastered"; what slips goes back.
@Observable @MainActor
final class ProgressCheckModel {
    enum Phase: Equatable { case intro, answering, reading, confirming(InkReading), grading, result, failed(String) }

    struct Outcome: Identifiable {
        var id: String { conceptId }
        var conceptId: String
        var name: String
        var held: Bool
        /// Wrong rather than a lucky guess: the concept was sent back.
        var demoted: Bool
        /// It had been placed out of, so its lesson is back on the list rather than a remediation.
        var wasPlaced: Bool
    }

    let app: AppModel
    let ctx: CourseContext
    private let service: CourseService
    private let reading: ReadingService
    var phase: Phase = .intro
    private(set) var questions: [ProgressCheckQuestion] = []
    private(set) var index = 0
    var item: Item?
    private var card: Card?
    private var variantId: String?
    var area = InkAreaModel(paper: .squared)
    var confidence: Confidence?
    private(set) var outcomes: [Outcome] = []
    private var sessionId = ""
    private var inkId: String?
    private var startedAt = Date()
    private var placed: Set<String> = []

    init(app: AppModel, ctx: CourseContext) {
        self.app = app
        self.ctx = ctx
        self.service = CourseService(ctx: ctx, store: app.store)
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
    }

    var questionNumber: Int { index + 1 }
    private var metadata: RequestMetadata { RequestMetadata(sessionId: sessionId, courseId: ctx.course.id) }

    func begin() async {
        do {
            questions = try await service.progressCheckPlan().questions
            placed = Set(await service.placedConcepts())
            let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .diagnostic, startedAt: ctx.now(),
                            summary: ["kind": .string(CourseService.progressKind)])
            try await app.store.saveSession(s)
            sessionId = s.id
            await showCurrent()
        } catch {
            phase = .failed("Couldn't put the check together: \(error.localizedDescription)")
        }
    }

    func notToday() async {
        await service.postponeProgressCheck()
        app.didChangeLearnerState()
        app.dismissSession()
    }

    private func showCurrent() async {
        guard index < questions.count else { await finish(); return }
        let q = questions[index]
        let cards = (try? await app.store.cards(course: ctx.course.id)) ?? []
        guard let base = ctx.curriculum.item(q.itemId), let c = cards.first(where: { $0.itemId == q.itemId }) else {
            index += 1
            await showCurrent()
            return
        }
        let served = await service.serving(base)
        item = served.item
        variantId = served.variantId
        card = c
        let paper = inkPaper(for: served.item)
        area = InkAreaModel(paper: paper.paper, minHeight: InkAreaModel.defaultHeight(for: paper.paper, lines: paper.lines))
        confidence = nil
        inkId = nil
        startedAt = Date()
        phase = .answering
    }

    func inkChanged() {
        guard let item else { return }
        reading.inkChanged(area, context: ReadingContext(itemType: item.type, paper: area.paper, prompt: item.prompt, metadata: metadata))
    }

    func handIn(_ c: Confidence) async {
        guard let item else { return }
        confidence = c
        area.isEditable = false
        phase = .reading
        do {
            let ink = area.record(courseId: ctx.course.id, owner: .progressCheck, ownerId: sessionId, itemId: item.id)
            try await app.store.saveInk(ink)
            inkId = ink.id
            let r = try await reading.read(area, inkId: ink.id, context: ReadingContext(itemType: item.type, paper: area.paper,
                                                                                       prompt: item.prompt, metadata: metadata))
            try await app.store.saveReading(r)
            let mathy = ConfirmPolicy.looksMathematical(r.text) || r.diagram != nil
            if ConfirmPolicy.needsConfirmation(r, context: .review, hasMathOrDiagram: mathy) {
                phase = .confirming(r)
            } else {
                await grade(r)
            }
        } catch {
            area.isEditable = true
            phase = .failed("Couldn't read your answer: \(error.localizedDescription)")
        }
    }

    func confirm(_ r: InkReading, text: String) async {
        var r = r
        r.confirmedText = text
        r.confirmedAt = ctx.now()
        try? await app.store.saveReading(r)
        await grade(r)
    }

    private func grade(_ r: InkReading) async {
        guard let item else { return }
        phase = .grading
        do {
            let graded = try await GradingService.grade(ctx.provider, target: GradingService.target(for: item, in: ctx.curriculum),
                                                        answer: r.gradedText, confidence: confidence, metadata: metadata)
            try await record(rating: graded.rating, wrong: !isCorrect(graded.rawRating), answer: r.gradedText, grade: graded.grade)
        } catch {
            phase = .failed("Couldn't mark your answer: \(error.localizedDescription)")
        }
    }

    func dontKnow() async {
        do { try await record(rating: .again, wrong: true, answer: "(I don't know)", grade: nil) } catch {
            phase = .failed("Couldn't save that: \(error.localizedDescription)")
        }
    }

    private func record(rating: Rating, wrong: Bool, answer: String, grade: GradeResult?) async throws {
        guard let card, let item else { return }
        let duration = Int(Date().timeIntervalSince(startedAt) * 1000)
        _ = try await service.applyProgressCheckAnswer(
            card: card, rating: rating, wrong: wrong, confidence: confidence, durationMs: duration,
            receipt: .init(sessionId: sessionId, answer: answer, grade: grade, inkId: inkId, modality: inkId == nil ? nil : .ink,
                           variantId: variantId))
        outcomes.append(Outcome(conceptId: item.conceptId, name: ctx.curriculum.concept(item.conceptId)?.name ?? item.conceptId,
                                held: isCorrect(rating), demoted: wrong, wasPlaced: placed.contains(item.conceptId)))
        index += 1
        await showCurrent()
    }

    func retry() async {
        area.isEditable = true
        phase = .answering
    }

    private func finish() async {
        if var s = try? await app.store.session(sessionId) {
            s.endedAt = ctx.now()
            s.summary = ["kind": .string(CourseService.progressKind),
                         "held": .number(Double(outcomes.filter(\.held).count)),
                         "asked": .number(Double(outcomes.count))]
            try? await app.store.saveSession(s)
        }
        phase = .result
        app.didChangeLearnerState()
    }
}

struct ProgressCheckView: View {
    @Environment(AppModel.self) private var app
    @State private var model: ProgressCheckModel
    init(model: ProgressCheckModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: model.phase == .intro || model.phase == .result ? "Progress check"
                                 : "Progress check · \(min(model.questionNumber, max(model.questions.count, 1))) of \(max(model.questions.count, 1))",
                          closeLabel: "Leave", onClose: { app.dismissSession() })
            switch model.phase {
            case .intro, .result:
                ScrollView {
                    PageColumn { if model.phase == .intro { intro } else { result } }
                        .padding(.horizontal, 32).padding(.top, 16).padding(.bottom, 60)
                }
            default:
                question
            }
        }
        .background(Theme.paper.ignoresSafeArea())
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("A progress check").font(.display).foregroundStyle(Theme.graphite)
            MaterialText("A handful of questions from everything so far, mixed together, by hand and with no help. Nothing says which idea each one is about: telling which idea a problem needs is part of knowing it.")
            Text("What holds up counts towards \"mastered\". What slips goes back for another pass, so you don't build on it before it's solid.")
                .font(.body15).foregroundStyle(Theme.muted)
            HStack(spacing: 12) {
                Button("Start the check") { Task { await model.begin() } }.buttonStyle(.primaryLarge)
                Button("Not today") { Task { await model.notToday() } }.buttonStyle(.ghost)
            }
        }
    }

    private var question: some View {
        WritingPage(handedness: app.settings.handedness) {
            if let item = model.item { MaterialText(item.prompt, font: .readingLarge) }
        } paper: {
            InkArea(area: model.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                .onChange(of: model.area.revision) { model.inkChanged() }
            switch model.phase {
            case .reading: WorkingLine(text: "Reading your answer…")
            case .grading: WorkingLine(text: "Marking it…")
            case .confirming(let r): ConfirmReadingView(reading: r) { text in Task { await model.confirm(r, text: text) } }
            case .failed(let m): Banner(text: m, actionTitle: "Try again") { Task { await model.retry() } }
            default: EmptyView()
            }
        } rail: {
            if model.phase == .answering {
                ToolTray(tools: app.tools, showsLasso: model.area.paper != .short)
                ConfidenceHandIn(enabled: !model.area.isEmpty,
                                 onHandIn: { c in Task { await model.handIn(c) } },
                                 onDontKnow: { Task { await model.dontKnow() } })
            }
        }
    }

    private var result: some View {
        VStack(alignment: .leading, spacing: 18) {
            let held = model.outcomes.filter(\.held)
            Text(model.outcomes.isEmpty ? "Nothing to check yet"
                 : held.count == model.outcomes.count ? "All \(held.count) held up"
                 : "\(held.count) of \(model.outcomes.count) held up")
                .font(.display).foregroundStyle(Theme.graphite)
            if !held.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Held up").font(.heading).foregroundStyle(Theme.graphite)
                    Text(held.map(\.name).joined(separator: " · ")).font(.body15).foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            let slipped = model.outcomes.filter { !$0.held }
            if !slipped.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Going back").font(.heading).foregroundStyle(Theme.graphite)
                    ForEach(slipped) { o in
                        Text("\(o.name): " + (!o.demoted ? "right, but a guess, so it comes back sooner in your reviews."
                                              : o.wasPlaced ? "you placed out of this, but it didn't hold, so its lesson is back on your list."
                                              : "a short lesson goes back over it, and what builds on it waits until it's solid."))
                            .font(.body15).foregroundStyle(Theme.graphite).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            Button("Done") { app.dismissSession() }.buttonStyle(.primaryLarge)
        }
    }
}
