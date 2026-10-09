import SwiftUI
import EpistemicsCore
import EpistemicsLLM

/// The warm-up brain dump (DESIGN §3.2, ipad §6.2): a blank page, free recall of the last lesson, graded
/// blind. Recalled concepts count as a Good review; missed ones go first in today's queue.
@Observable @MainActor
final class WarmupModel {
    enum Phase: Equatable { case writing, reading, confirming(InkReading), grading, result, failed(String) }

    let app: AppModel
    let ctx: CourseContext
    let lesson: Lesson?
    let area = InkAreaModel(paper: .dotted, minHeight: 520)
    private let reading: ReadingService
    var phase: Phase = .writing
    var recalled: [String] = []
    var partial: [String] = []
    var missed: [String] = []

    init(app: AppModel, ctx: CourseContext, lessonId: String) {
        self.app = app
        self.ctx = ctx
        self.lesson = ctx.curriculum.lesson(lessonId)
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
    }

    var prompt: String { lesson.map(buildWarmupPrompt) ?? "" }
    private var readingContext: ReadingContext { ReadingContext(itemType: .explain, paper: .dotted, prompt: prompt) }

    func inkChanged() { reading.inkChanged(area, context: readingContext) }

    func done() async {
        guard let lesson else { return }
        area.isEditable = false
        phase = .reading
        do {
            let session = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .warmup, lessonId: lesson.id, startedAt: ctx.now())
            try await app.store.saveSession(session)
            let ink = area.record(courseId: ctx.course.id, owner: .warmup, ownerId: session.id, itemId: nil)
            try await app.store.saveInk(ink)
            let r = try await reading.read(area, inkId: ink.id, context: readingContext)
            try await app.store.saveReading(r)
            sessionId = session.id
            if r.uncertain.isEmpty { await grade(r) } else { phase = .confirming(r) }
        } catch {
            area.isEditable = true
            phase = .failed("Couldn't read the page: \(error.localizedDescription)")
        }
    }

    private var sessionId = ""

    func confirm(_ r: InkReading, text: String) async {
        var r = r
        r.confirmedText = text
        r.confirmedAt = ctx.now()
        try? await app.store.saveReading(r)
        await grade(r)
    }

    private func grade(_ r: InkReading) async {
        guard let lesson else { return }
        phase = .grading
        let service = CourseService(ctx: ctx, store: app.store)
        do {
            let result = try await Warmup.grade(ctx.provider, WarmupInput(
                dump: r.gradedText,
                concepts: lesson.concepts.map { WarmupConcept(id: $0.id, name: $0.name, definition: $0.definition) },
                metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))).value
            let outcome = mapWarmupResult(result.recalledConceptIds, lesson)
            let n = ctx.now()
            let ids = Set(outcome.reviewed.map(\.conceptId))
            let targets = try await app.store.cards(course: ctx.course.id).filter {
                ids.contains($0.conceptId) && CourseService.isActivated($0, now: n) && $0.state != .new && !$0.suspended
            }
            let outs = targets.map { ctx.scheduler.applyRating($0, WARMUP_RATING, n, ReviewContext(source: .warmup, assisted: false)) }
            try await app.store.saveCards(outs.map(\.card))
            try await app.store.appendReviewLog(outs.map(\.log))
            await service.setQueueFirst(outcome.queuedFirst)
            await service.setWarmupDay(service.studyDayKey())
            if var s = try await app.store.session(sessionId) {
                s.endedAt = ctx.now()
                s.summary = ["recalled": .array(result.recalledConceptIds.map { .string($0) }),
                             "missed": .array(outcome.queuedFirst.map { .string($0) }), "dump": .string(r.gradedText)]
                try await app.store.saveSession(s)
            }
            let name = { (id: String) in self.ctx.curriculum.concept(id)?.name ?? id }
            recalled = outcome.reviewed.map { name($0.conceptId) }
            partial = result.partial.map(name)
            missed = outcome.queuedFirst.map(name)
            phase = .result
            app.didChangeLearnerState()
        } catch {
            phase = .failed("Couldn't check the page: \(error.localizedDescription)")
        }
    }

    func skip() async {
        await CourseService(ctx: ctx, store: app.store).setWarmupDay(CourseService(ctx: ctx, store: app.store).studyDayKey())
        app.dismissSession()
    }
}

struct WarmupView: View {
    @Environment(AppModel.self) private var app
    @State private var model: WarmupModel
    init(model: WarmupModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: "Warm-up", subtitle: model.lesson?.title, closeLabel: "Leave the warm-up", onClose: { app.dismissSession() })
            ScrollView {
                FreeHandLayout(handedness: app.settings.handedness) {
                    if model.phase == .writing { ToolTray(tools: app.tools) }
                } page: {
                    PageColumn {
                        MaterialText(model.prompt, font: .readingLarge)
                        Text("Two or three minutes. Order and neatness don't matter; a sketch counts.")
                            .font(.secondary).foregroundStyle(Theme.muted)
                        InkArea(area: model.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                            .onChange(of: model.area.revision) { model.inkChanged() }
                        switch model.phase {
                        case .writing:
                            HStack(spacing: 12) {
                                Button("Done writing") { Task { await model.done() } }
                                    .buttonStyle(.primaryLarge).disabled(model.area.isEmpty)
                                Button("Skip today") { Task { await model.skip() } }.buttonStyle(.ghost)
                            }
                        case .reading: WorkingLine(text: "Reading your page…")
                        case .grading: WorkingLine(text: "Checking which ideas you recalled…")
                        case .confirming(let r):
                            ConfirmReadingView(reading: r) { text in Task { await model.confirm(r, text: text) } }
                        case .failed(let m):
                            Banner(text: m, actionTitle: "Try again") { Task { await model.done() } }
                        case .result:
                            result
                        }
                    }
                    .padding(.top, 16).padding(.bottom, 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
    }

    private var result: some View {
        VStack(alignment: .leading, spacing: 14) {
            let total = model.recalled.count + model.missed.count
            Text("You recalled \(model.recalled.count) of \(total) ideas.").font(.title2x).foregroundStyle(Theme.graphite)
            if !model.recalled.isEmpty {
                Text(model.recalled.joined(separator: " · ")).font(.body15).foregroundStyle(Theme.graphite)
                Text("Each counts as a review today.").font(.secondary).foregroundStyle(Theme.muted)
            }
            if !model.missed.isEmpty {
                Text("Not on the page: " + model.missed.joined(separator: ", ") + ". They go first in today's reviews.")
                    .font(.body15).foregroundStyle(Theme.muted)
            }
            Button("Continue") { app.dismissSession() }.buttonStyle(.primaryLarge).padding(.top, 6)
        }
    }
}
