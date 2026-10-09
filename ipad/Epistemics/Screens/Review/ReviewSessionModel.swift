import SwiftUI
import PencilKit
import EpistemicsCore
import EpistemicsLLM

/// A review session (DESIGN §3.4, ipad DESIGN §6.4): one item per page, answered by hand, the confidence
/// rating as the hand-in, then the reading, the blind grade and a receipt marked on the learner's own ink.
@Observable @MainActor
final class ReviewSessionModel {
    enum Phase: Equatable {
        case loading
        case answering
        case reading
        case confirming(InkReading)
        case grading
        /// Self-graded types: the reference beside the ink, the learner rates.
        case reveal(InkReading)
        case receipt(ReviewResult)
        case done
        case failed(String)
    }

    struct Current {
        var card: Card
        var item: Item
        var area: InkAreaModel
        var typed = ""
        var startedAt = Date()
    }

    struct Previous: Equatable {
        var drawing: PKDrawing
        var paper: Paper
        var marks: [InkMark]
        var daysAgo: Int
        var rating: Rating
    }

    struct ReviewResult: Equatable {
        var reading: InkReading
        var graded: Graded?
        var rating: Rating
        var marks: [InkMark]
        var nextDueText: String
        var previous: Previous?
        var hypercorrection: Bool
        var leech: Bool
        var receiptId: String?
    }

    let app: AppModel
    let ctx: CourseContext
    private let service: CourseService
    private let reading: ReadingService
    var phase: Phase = .loading
    var current: Current?
    var order: [Card] = []
    var index = 0
    var answered = 0
    var minutesLeft = 0
    var confidence: Confidence?
    private var inkId: String?
    private var sessionId = ""
    private var shownConcepts = Set<String>()
    private var reasked = Set<String>()

    init(app: AppModel, ctx: CourseContext) {
        self.app = app
        self.ctx = ctx
        self.service = CourseService(ctx: ctx, store: app.store)
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
    }

    var total: Int { max(order.count, answered) }
    var typedMode: Bool { app.settings.typedAnswers && !(current.map { [.sketch, .map].contains($0.item.type) } ?? false) }
    var readingContext: ReadingContext? {
        current.map { ReadingContext(itemType: $0.item.type, paper: $0.area.paper, prompt: $0.item.prompt,
                                     metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id)) }
    }

    // MARK: Flow

    func start() async {
        guard phase == .loading else { return }
        do {
            let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .review, startedAt: ctx.now())
            sessionId = s.id
            try await app.store.saveSession(s)
            try await loadQueue()
        } catch {
            phase = .failed("Couldn't load your reviews: \(error)")
        }
    }

    private func loadQueue() async throws {
        let q = try await service.loadQueue(recentlyShown: shownConcepts, queueFirst: await service.queueFirst())
        order = q.order
        index = 0
        minutesLeft = q.minutes
        try showCurrent()
    }

    private func showCurrent() throws {
        guard index < order.count else {
            Task { await finish() }
            return
        }
        let card = order[index]
        guard let item = ctx.curriculum.item(card.itemId) else { index += 1; try showCurrent(); return }
        let ink = inkPaper(for: item)
        current = Current(card: card, item: item, area: InkAreaModel(paper: ink.paper, minHeight: InkAreaModel.defaultHeight(for: ink.paper, lines: ink.lines)))
        confidence = nil
        inkId = nil
        phase = .answering
    }

    func inkChanged() {
        guard let current, let rc = readingContext, !typedMode else { return }
        reading.inkChanged(current.area, context: rc)
    }

    /// The confidence buttons hand in (DESIGN §4).
    func handIn(_ c: Confidence) async {
        guard var cur = current, let rc = readingContext else { return }
        confidence = c
        cur.area.isEditable = false
        current = cur
        phase = .reading
        do {
            let r: InkReading
            if typedMode {
                r = InkReading(id: uuidv7(ctx.now()), inkId: "", source: .typed, text: cur.typed, crossedOut: [], uncertain: [],
                               createdAt: ctx.now())
            } else {
                let record = cur.area.record(courseId: ctx.course.id, owner: .review, ownerId: sessionId, itemId: cur.item.id)
                try await app.store.saveInk(record)
                inkId = record.id
                r = try await reading.read(cur.area, inkId: record.id, context: rc)
                try await app.store.saveReading(r)
            }
            let mathy = ConfirmPolicy.looksMathematical(r.text) || r.diagram != nil
            if !typedMode && ConfirmPolicy.needsConfirmation(r, context: .review, hasMathOrDiagram: mathy) {
                phase = .confirming(r)
            } else {
                await proceed(with: r)
            }
        } catch {
            cur.area.isEditable = true
            current = cur
            phase = .failed("Couldn't read your answer: \(error.localizedDescription)")
        }
    }

    func confirm(_ reading: InkReading, text: String) async {
        var r = reading
        r.confirmedText = text
        r.confirmedAt = ctx.now()
        try? await app.store.saveReading(r)
        await proceed(with: r)
    }

    private func proceed(with r: InkReading) async {
        guard let cur = current else { return }
        if cur.item.type.isSelfGraded {
            phase = .reveal(r)
            return
        }
        phase = .grading
        do {
            let target = GradingService.target(for: cur.item, in: ctx.curriculum)
            let graded = try await GradingService.grade(ctx.provider, target: target, answer: r.gradedText, confidence: confidence,
                                                        metadata: RequestMetadata(sessionId: sessionId, courseId: ctx.course.id))
            try await record(rating: graded.rating, reading: r, graded: graded, hypercorrection: graded.hypercorrection)
        } catch {
            phase = .failed("Couldn't grade your answer: \(error.localizedDescription)")
        }
    }

    /// Self-graded types: the learner's rating, then the confidence adjustment (DESIGN §3.4).
    func selfRate(_ rating: Rating, reading r: InkReading) async {
        var final = rating
        var hyper = false
        if let confidence {
            let adj = adjustRatingForConfidence(rating, confidence, isCorrect(rating))
            final = adj.rating
            hyper = adj.hypercorrection
        }
        do { try await record(rating: final, reading: r, graded: nil, hypercorrection: hyper) } catch {
            phase = .failed("Couldn't save the review: \(error.localizedDescription)")
        }
    }

    func dontKnow() async {
        guard let cur = current else { return }
        let r = InkReading(id: uuidv7(ctx.now()), inkId: "", source: .typed, text: "(I don't know)", crossedOut: [], uncertain: [],
                           createdAt: ctx.now())
        confidence = nil
        cur.area.isEditable = false
        do { try await record(rating: .again, reading: r, graded: nil, hypercorrection: false) } catch {
            phase = .failed("Couldn't save the review: \(error.localizedDescription)")
        }
    }

    private func record(rating: Rating, reading r: InkReading, graded: Graded?, hypercorrection: Bool) async throws {
        guard let cur = current else { return }
        let duration = Int(Date().timeIntervalSince(cur.startedAt) * 1000)
        let applied = try await service.applyReview(
            card: cur.card, rating: rating, source: .review, assisted: false, confidence: confidence, durationMs: duration,
            receipt: .init(sessionId: sessionId, answer: r.gradedText, grade: graded?.grade, inkId: inkId,
                           modality: typedMode ? .typed : (inkId == nil ? nil : .ink)))
        var marks: [InkMark] = []
        if let graded, let inkId, !typedMode {
            marks = await MarkPlacement.receiptMarks(grade: graded.grade, rubric: GradingService.target(for: cur.item, in: ctx.curriculum).rubric,
                                                     drawing: cur.area.drawing, reading: reading)
            cur.area.marks = marks
            try? await app.store.saveMarks(inkId: inkId, marks)
        }
        let previous = await previousAttempt(item: cur.item, before: applied.receipt?.createdAt ?? ctx.now())
        if hypercorrection && !reasked.contains(cur.card.id) {
            // A confident miss is asked again today (DESIGN §3.4).
            reasked.insert(cur.card.id)
            order.append(applied.card)
        }
        answered += 1
        shownConcepts.insert(cur.item.conceptId)
        phase = .receipt(ReviewResult(reading: r, graded: graded, rating: rating, marks: marks,
                                      nextDueText: Self.dueText(applied.card.due - ctx.now()), previous: previous,
                                      hypercorrection: hypercorrection, leech: applied.leech, receiptId: applied.receipt?.id))
        app.didChangeLearnerState()
    }

    private func previousAttempt(item: Item, before: EpochMs) async -> Previous? {
        guard let receipt = try? await app.store.previousReceipt(course: ctx.course.id, item: item.id, before: before),
              let inkId = receipt.inkId, let ink = try? await app.store.ink(inkId),
              let drawing = try? PKDrawing(data: ink.drawing) else { return nil }
        let marks = (try? await app.store.marks(inkId: inkId)) ?? []
        let days = max(0, (ctx.now() - receipt.createdAt) / 86_400_000)
        return Previous(drawing: drawing, paper: ink.paper, marks: marks, daysAgo: days, rating: receipt.rating)
    }

    /// Re-grade with three samples and log the dispute (DESIGN §6.2).
    func dispute(_ result: ReviewResult) async {
        guard let cur = current, let receiptId = result.receiptId else { return }
        phase = .grading
        do {
            let target = GradingService.target(for: cur.item, in: ctx.curriculum)
            let graded = try await GradingService.grade(ctx.provider, target: target, answer: result.reading.gradedText,
                                                        confidence: confidence, samples: 3)
            if var r = try await app.store.receipts(session: sessionId).first(where: { $0.id == receiptId }) {
                r.disputed = true
                r.grade = graded.grade
                try await app.store.saveReceipt(r)
            }
            var updated = result
            updated.graded = graded
            phase = .receipt(updated)
        } catch {
            phase = .receipt(result)
        }
    }

    func next() async {
        index += 1
        if index < order.count {
            try? showCurrent()
        } else {
            do { try await loadQueue() } catch { phase = .failed("\(error)") }
        }
    }

    func retry() async {
        guard let cur = current else { return }
        cur.area.isEditable = true
        phase = .answering
    }

    private func finish() async {
        if var s = try? await app.store.session(sessionId) {
            s.endedAt = ctx.now()
            s.summary = ["answered": .number(Double(answered))]
            try? await app.store.saveSession(s)
        }
        current = nil
        phase = .done
        app.didChangeLearnerState()
    }

    static func dueText(_ ms: Int) -> String {
        if ms < 3_600_000 { return "again in \(max(1, ms / 60_000)) minutes" }
        if ms < 86_400_000 { return "again in \(ms / 3_600_000) hours" }
        let d = Int((Double(ms) / 86_400_000).rounded())
        return d == 1 ? "next due tomorrow" : "next due in \(d) days"
    }
}
