import SwiftUI
import EpistemicsCore
import EpistemicsLLM

/// The placement test (ipad DESIGN §6.1): a short adaptive test, answered by hand, that settles which
/// concepts the learner already knows so their lessons are skipped. Quiet while it runs (no marks, no
/// answers shown), because it is measuring, not teaching.
@Observable @MainActor
final class PlacementModel {
    enum Phase: Equatable { case intro, answering, reading, confirming(InkReading), grading, result, failed(String) }

    let app: AppModel
    let ctx: CourseContext
    private let service: CourseService
    private let reading: ReadingService
    var phase: Phase = .intro
    private(set) var state: PlacementState
    var probe: PlacementProbe?
    var item: Item?
    var area = InkAreaModel(paper: .squared)
    var confidence: Confidence?
    var result: PlacementResult?
    private var sessionId = ""
    private var startedAt = Date()

    init(app: AppModel, ctx: CourseContext) {
        self.app = app
        self.ctx = ctx
        self.service = CourseService(ctx: ctx, store: app.store)
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
        self.state = createPlacement(ctx.curriculum)
    }

    var questionNumber: Int { state.probes + 1 }
    var conceptCount: Int { state.conceptIds.count }

    private var readingContext: ReadingContext? {
        guard let item else { return nil }
        return ReadingContext(itemType: item.type, paper: area.paper, prompt: item.prompt,
                              metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
    }

    func begin() async {
        let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .diagnostic, startedAt: ctx.now())
        try? await app.store.saveSession(s)
        sessionId = s.id
        await showNext()
    }

    /// "I'm new to this": no test, start at the beginning; the offer stays on Today.
    func skip() async {
        phase = .result
        result = PlacementResult(knownConceptIds: [], notKnownConceptIds: state.conceptIds, probes: 0)
    }

    private func showNext() async {
        guard let p = nextPlacementProbe(state), let it = ctx.curriculum.item(p.itemId) else {
            await finish()
            return
        }
        probe = p
        item = it
        let paper = inkPaper(for: it)
        area = InkAreaModel(paper: paper.paper, minHeight: InkAreaModel.defaultHeight(for: paper.paper, lines: paper.lines))
        confidence = nil
        startedAt = Date()
        phase = .answering
    }

    func inkChanged() {
        if let rc = readingContext { reading.inkChanged(area, context: rc) }
    }

    func handIn(_ c: Confidence) async {
        guard let rc = readingContext, let item else { return }
        confidence = c
        area.isEditable = false
        phase = .reading
        do {
            let ink = area.record(courseId: ctx.course.id, owner: .placement, ownerId: sessionId, itemId: item.id)
            try await app.store.saveInk(ink)
            inkId = ink.id
            let r = try await reading.read(area, inkId: ink.id, context: rc)
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

    private var inkId: String?

    func confirm(_ r: InkReading, text: String) async {
        var r = r
        r.confirmedText = text
        r.confirmedAt = ctx.now()
        try? await app.store.saveReading(r)
        await grade(r)
    }

    private func grade(_ r: InkReading) async {
        guard let item, let probe else { return }
        phase = .grading
        do {
            let graded = try await GradingService.grade(ctx.provider, target: GradingService.target(for: item, in: ctx.curriculum),
                                                        answer: r.gradedText, confidence: confidence,
                                                        metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
            try await service.recordReceipt(sessionId: sessionId, itemId: item.id, conceptId: probe.conceptId, answer: r.gradedText,
                                            confidence: confidence, grade: graded.grade, rating: graded.rating, assisted: false,
                                            inkId: inkId)
            // A lucky guess is not knowing: the confidence-adjusted rating has to be Good or better.
            state = recordPlacementResult(state, probe.conceptId, isCorrect(graded.rating))
            await showNext()
        } catch {
            phase = .failed("Couldn't mark your answer: \(error.localizedDescription)")
        }
    }

    /// "I don't know" settles the concept, and everything built on it, as not known yet.
    func dontKnow() async {
        guard let item, let probe else { return }
        try? await service.recordReceipt(sessionId: sessionId, itemId: item.id, conceptId: probe.conceptId, answer: "(I don't know)",
                                         confidence: nil, grade: nil, rating: .again, assisted: false)
        state = recordPlacementResult(state, probe.conceptId, false)
        await showNext()
    }

    func retry() async {
        area.isEditable = true
        phase = .answering
    }

    private func finish() async {
        let r = placementResult(state)
        do {
            try await service.applyPlacement(knownConceptIds: r.knownConceptIds)
            var course = ctx.course
            // Scaffolding from evidence rather than self-report (web DESIGN §3.3).
            let share = Double(r.knownConceptIds.count) / Double(max(1, conceptCount))
            course.scaffolding = share >= 0.5 ? .advanced : share > 0 ? .developing : .novice
            course.updatedAt = ctx.now()
            try await app.store.saveCourse(course)
            if var s = try await app.store.session(sessionId) {
                s.endedAt = ctx.now()
                s.summary = ["known": .array(r.knownConceptIds.map { .string($0) }), "probes": .number(Double(r.probes))]
                try await app.store.saveSession(s)
            }
            result = r
            phase = .result
            app.didChangeLearnerState()
        } catch {
            phase = .failed("Couldn't save the placement: \(error.localizedDescription)")
        }
    }

    /// Where the learner starts: the first lesson not placed out of.
    var startingLesson: Lesson? {
        let known = Set(result?.knownConceptIds ?? [])
        let placed = Set(lessonsPlacedOut(ctx.curriculum, knownConceptIds: known).map(\.id))
        return ctx.curriculum.allLessons.first { !placed.contains($0.id) }
    }
    var placedOutLessons: [Lesson] { lessonsPlacedOut(ctx.curriculum, knownConceptIds: Set(result?.knownConceptIds ?? [])) }
}

/// The placement test's page. Used inside the first run and as a session from Today.
struct PlacementView: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: PlacementModel
    var onDone: () -> Void

    var body: some View {
        switch model.phase {
        case .intro: intro
        case .result: result
        default: question
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Let's find out what you already know").font(.display).foregroundStyle(Theme.graphite)
            MaterialText("A short test, by hand, with no help: usually between five and twelve questions. Each answer tells the app which ideas you can already use, and the ones they depend on, so it can skip the lessons you don't need.")
            Text("Answer what you can and say how sure you are. “I don't know” is a fine answer: it ends that branch quickly. Nothing here counts against you.")
                .font(.body15).foregroundStyle(Theme.muted)
            HStack(spacing: 12) {
                Button("Start the test") { Task { await model.begin() } }.buttonStyle(.primaryLarge)
                Button("I'm new to this, start at the beginning") { Task { await model.skip() } }.buttonStyle(.ghost)
            }
        }
    }

    private var question: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Placement · question \(model.questionNumber)\(model.state.estimatedRemaining > 0 ? " · about \(model.state.estimatedRemaining) to go" : "")")
                .font(.secondary).foregroundStyle(Theme.muted)
            if let item = model.item {
                MaterialText(item.prompt, font: .readingLarge)
                HStack(alignment: .top, spacing: 16) {
                    if model.phase == .answering {
                        ToolTray(tools: app.tools, showsLasso: model.area.paper != .short)
                    }
                    InkArea(area: model.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                        .onChange(of: model.area.revision) { model.inkChanged() }
                }
                .environment(\.layoutDirection, app.settings.handedness == .left ? .rightToLeft : .leftToRight)
            }
            switch model.phase {
            case .answering:
                ConfidenceHandIn(enabled: !model.area.isEmpty,
                                 onHandIn: { c in Task { await model.handIn(c) } },
                                 onDontKnow: { Task { await model.dontKnow() } })
                    .environment(\.layoutDirection, app.settings.handedness == .left ? .rightToLeft : .leftToRight)
            case .reading: WorkingLine(text: "Reading your answer…")
            case .grading: WorkingLine(text: "Marking it…")
            case .confirming(let r): ConfirmReadingView(reading: r) { text in Task { await model.confirm(r, text: text) } }
            case .failed(let m): Banner(text: m, actionTitle: "Try again") { Task { await model.retry() } }
            default: EmptyView()
            }
        }
    }

    private var result: some View {
        VStack(alignment: .leading, spacing: 18) {
            let known = model.result?.knownConceptIds.count ?? 0
            Text(known == 0 ? "You'll start at the beginning" : "You already know \(known) of \(model.conceptCount) ideas")
                .font(.display).foregroundStyle(Theme.graphite)
            if let start = model.startingLesson {
                MaterialText(model.placedOutLessons.isEmpty
                             ? "Your first lesson is \(start.title)."
                             : "You can skip \(model.placedOutLessons.count) lesson\(model.placedOutLessons.count == 1 ? "" : "s"). Your first lesson is \(start.title).")
            } else {
                MaterialText("You placed out of every lesson in this course. Everything comes back as reviews.")
            }
            if !model.placedOutLessons.isEmpty {
                Text("Skipped: " + model.placedOutLessons.map(\.title).joined(separator: " · "))
                    .font(.body15).foregroundStyle(Theme.muted)
            }
            if known > 0 {
                Text("What you placed out of still comes back in your reviews, spaced out, and has to hold up there. If it doesn't, it's scheduled again like anything else.")
                    .font(.body15).foregroundStyle(Theme.muted)
            }
            Button("Continue", action: onDone).buttonStyle(.primaryLarge)
        }
    }
}

/// Placement as a session from Today, for a learner who skipped it during the first run.
struct PlacementSessionView: View {
    @Environment(AppModel.self) private var app
    @State private var model: PlacementModel
    init(model: PlacementModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: "Placement test", closeLabel: "Leave", onClose: { app.dismissSession() })
            ScrollView {
                PageColumn { PlacementView(model: model) { app.dismissSession() } }
                    .padding(.horizontal, 32).padding(.top, 16).padding(.bottom, 60)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
    }
}
