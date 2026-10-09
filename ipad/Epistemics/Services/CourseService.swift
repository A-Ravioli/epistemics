import Foundation
import EpistemicsCore

/// Course-level persistence, ported from web/apps/web/src/lib/services/{courses,queue,receipts}.ts.
/// Pure decisions live in EpistemicsCore; this file only moves state between the core and the store.
struct CourseService {
    let ctx: CourseContext
    let store: Store

    var course: Course { ctx.course }
    var now: EpochMs { ctx.now() }

    // MARK: Activation

    /// Cards are created at enrolment far in the future and "activated" when their concept is taught,
    /// exactly as the web schema does it, so the two can sync.
    static let unactivatedOffsetMs = Int(100 * 365.25 * 86_400_000)
    static let unactivatedThresholdMs = Int(50 * 365.25 * 86_400_000)

    static func isActivated(_ card: Card, now: EpochMs) -> Bool { card.due < now + unactivatedThresholdMs }

    var dayConfig: DayConfig { DayConfig(timezone: course.settings.timezone, dayStartHour: course.settings.dayStartHour) }

    func studyDayKey(_ at: EpochMs? = nil) -> String {
        studyDay(at ?? now, dayConfig)
    }

    func dayStart() -> EpochMs {
        studyDayStart(now, dayConfig)
    }

    // MARK: Queue

    struct LoadedQueue {
        var queue: Queue
        var cards: [Card]
        var items: [String: Item]
        var reviewsDoneToday: Int
        /// Cards to answer, in order: learning, then reviews, with warm-up misses first.
        var order: [Card]
        var minutes: Int
    }

    func itemIndex() -> [String: Item] {
        Dictionary(ctx.curriculum.allItems.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    }

    func countReviewsToday() async throws -> Int {
        try await store.reviewLog(course: course.id, since: dayStart())
            .filter { $0.source == .review && $0.stateBefore == .review }.count
    }

    func loadQueue(recentlyShown: Set<String> = [], queueFirst: [String] = []) async throws -> LoadedQueue {
        let n = now
        let items = itemIndex()
        let cards = try await store.cards(course: course.id).filter { Self.isActivated($0, now: n) && items[$0.itemId] != nil }
        var info: [String: QueueItemInfo] = [:]
        for c in cards { if let it = items[c.itemId] { info[c.id] = QueueItemInfo(conceptId: it.conceptId, type: it.type) } }
        let done = try await countReviewsToday()
        let scheduler = ctx.scheduler
        var rng = SystemRandomNumberGenerator()
        let queue = buildQueue(BuildQueueInput(
            cards: cards, now: n, settings: course.settings, itemsByCard: info,
            retrievability: { scheduler.retrievability($0, n) },
            recentlyShownConceptIds: recentlyShown,
            rng: { Double.random(in: 0..<1, using: &rng) },
            reviewsDoneToday: done))
        var order = queue.learning + queue.reviews
        if !queueFirst.isEmpty {
            let first = Set(queueFirst)
            order = order.filter { first.contains($0.conceptId) } + order.filter { !first.contains($0.conceptId) }
        }
        let minutes = estimateMinutesByHand(queue, itemsByCard: info)
        return LoadedQueue(queue: queue, cards: cards, items: items, reviewsDoneToday: done, order: order, minutes: minutes)
    }

    // MARK: Reviews

    struct AppliedReview {
        var card: Card
        var log: ReviewLogEntry
        var receipt: Receipt?
        var leech: Bool
    }

    struct ReceiptInput {
        var sessionId: String
        var answer: String
        var grade: GradeResult?
        var inkId: String?
        var modality: AnswerModality?
    }

    /// scheduler.applyRating → cards + review log → receipt + concept state → implicit credit (DESIGN §5.3-5.6).
    func applyReview(card: Card, rating: Rating, source: ReviewSource, assisted: Bool, confidence: Confidence?,
                     durationMs: Int?, receipt: ReceiptInput?, implicitCredit allowImplicit: Bool = true) async throws -> AppliedReview {
        let n = now
        let outcome = ctx.scheduler.applyRating(card, rating, now: n,
                                                context: ReviewContext(source: source, assisted: assisted, confidence: confidence, durationMs: durationMs))
        var next = outcome.card
        let leech = isLeech(next)
        if leech { next.suspended = true }
        try await store.saveCards([next])
        try await store.appendReviewLog([outcome.log])
        var saved: Receipt?
        if let receipt {
            saved = try await recordReceipt(sessionId: receipt.sessionId, itemId: card.itemId, conceptId: card.conceptId,
                                            answer: receipt.answer, confidence: confidence, grade: receipt.grade, rating: rating,
                                            assisted: assisted, inkId: receipt.inkId, modality: receipt.modality)
        }
        if allowImplicit && !assisted && isCorrect(rating) {
            try await grantImplicitCredit(passedConceptId: card.conceptId)
        }
        return AppliedReview(card: next, log: outcome.log, receipt: saved, leech: leech)
    }

    /// FIRe-lite (DESIGN §5.6): synthetic partial reviews on encompassed concepts' cards.
    func grantImplicitCredit(passedConceptId: String) async throws {
        let n = now
        let all = try await store.cards(course: course.id).filter { Self.isActivated($0, now: n) }
        let byConcept = Dictionary(grouping: all, by: \.conceptId)
        let outcomes = implicitCredit(ImplicitCreditInput(passedConceptId: passedConceptId, edges: ctx.curriculum.edges,
                                                          cardsByConcept: byConcept, now: n, scheduler: ctx.scheduler))
        guard !outcomes.isEmpty else { return }
        try await store.saveCards(outcomes.map(\.card))
        try await store.appendReviewLog(outcomes.map(\.log))
    }

    /// Lesson wrap-up (DESIGN §3.3): a concept's cards enter FSRS with the CHECK result as their first review.
    @discardableResult
    func activateConcept(_ conceptId: String, firstRating: Rating) async throws -> [Card] {
        let n = now
        let mine = try await store.cards(course: course.id).filter {
            $0.conceptId == conceptId && $0.state == .new && !$0.suspended
        }
        guard !mine.isEmpty else { return [] }
        let activated = mine.map { c -> Card in var c = c; c.due = n; return c }
        let outs = activated.map {
            ctx.scheduler.applyRating($0, firstRating, n, ReviewContext(source: .lesson, assisted: false))
        }
        try await store.saveCards(outs.map(\.card))
        try await store.appendReviewLog(outs.map(\.log))
        return outs.map(\.card)
    }

    /// Reschedule a concept's activated cards with Again (a failed checkpoint concept).
    func rescheduleConceptAgain(_ conceptId: String, source: ReviewSource = .checkpoint) async throws {
        let n = now
        let mine = try await store.cards(course: course.id).filter {
            $0.conceptId == conceptId && Self.isActivated($0, now: n) && $0.state != .new && !$0.suspended
        }
        guard !mine.isEmpty else { return }
        let outs = mine.map { ctx.scheduler.applyRating($0, .again, n, ReviewContext(source: source, assisted: false)) }
        try await store.saveCards(outs.map(\.card))
        try await store.appendReviewLog(outs.map(\.log))
    }

    // MARK: Receipts and concept state

    @discardableResult
    func recordReceipt(sessionId: String, itemId: String, conceptId: String, answer: String, confidence: Confidence?,
                       grade: GradeResult?, rating: Rating, assisted: Bool, inkId: String? = nil,
                       modality: AnswerModality? = nil) async throws -> Receipt {
        let n = now
        let receipt = Receipt(id: uuidv7(n), sessionId: sessionId, courseId: course.id, itemId: itemId, conceptId: conceptId,
                              answer: answer, confidence: confidence, grade: grade, rating: rating, assisted: assisted,
                              createdAt: n, inkId: inkId, modality: modality ?? (inkId == nil ? nil : .ink))
        try await store.saveReceipt(receipt)
        try await foldReceipt(receipt)
        return receipt
    }

    func foldReceipt(_ r: Receipt) async throws {
        let states = try await store.conceptStates(course: course.id)
        let prev = states[r.conceptId] ?? ConceptState(courseId: course.id, conceptId: r.conceptId, updatedAt: r.createdAt)
        let next = updateConceptStateAfterReceipt(prev, ConceptReceipt(
            rating: r.rating, assisted: r.assisted, misconceptionTags: r.grade?.misconceptionTags ?? [],
            day: studyDayKey(r.createdAt), at: r.createdAt))
        try await recomputeMastery(next)
    }

    /// mastery = retention × min(1, sessions/3), persisted.
    func recomputeMastery(_ state: ConceptState) async throws {
        let n = now
        let cards = try await store.cards(course: course.id).filter { $0.conceptId == state.conceptId && Self.isActivated($0, now: n) }
        let scheduler = ctx.scheduler
        let retention = conceptRetention(cards, now: n) { scheduler.retrievability($0, $1) }
        var next = state
        next.mastery = conceptMastery(retention, state.successfulSessions)
        next.updatedAt = max(state.updatedAt, n)
        try await store.saveConceptStates([next])
    }

    func refreshAllMastery() async throws {
        let states = try await store.conceptStates(course: course.id)
        for s in states.values { try await recomputeMastery(s) }
    }

    // MARK: Per-course flags (settings rows, as on the web)

    private func key(_ name: String) -> String { "\(name):\(course.id)" }

    func pendingRemediation() async -> [String] { (try? await store.setting(key("remediation"), as: [String].self)) ?? [] }
    func addPendingRemediation(_ conceptId: String) async {
        var list = await pendingRemediation()
        if !list.contains(conceptId) { list.append(conceptId) }
        try? await store.setSetting(key("remediation"), list)
    }
    func removePendingRemediation(_ conceptId: String) async {
        try? await store.setSetting(key("remediation"), await pendingRemediation().filter { $0 != conceptId })
    }

    func queueFirst() async -> [String] { (try? await store.setting(key("queueFirst"), as: [String].self)) ?? [] }
    func setQueueFirst(_ ids: [String]) async { try? await store.setSetting(key("queueFirst"), ids) }

    func warmupDay() async -> String? { try? await store.setting(key("warmupDay"), as: String.self) }
    func setWarmupDay(_ day: String) async { try? await store.setSetting(key("warmupDay"), day) }

    func clearedDays() async -> [String] { (try? await store.setting(key("clearedDays"), as: [String].self)) ?? [] }
    func markDayCleared(_ day: String) async {
        var days = await clearedDays()
        if !days.contains(day) { days.append(day); try? await store.setSetting(key("clearedDays"), days.suffix(400).map { $0 }) }
    }

    func gateOverrideDay() async -> String? { try? await store.setting(key("gateOverride"), as: String.self) }
    func overrideGateToday() async { try? await store.setSetting(key("gateOverride"), studyDayKey()) }

    /// Lessons finished (not remediation mini-lessons).
    func completedLessons() async throws -> Set<String> {
        let sessions = try await store.sessions(course: course.id, type: .lesson)
        var out = Set<String>()
        for s in sessions where s.endedAt != nil {
            guard let id = s.lessonId, !id.hasPrefix(LessonService.remediationPrefix), s.summary?["remediation"]?.boolValue != true else { continue }
            out.insert(id)
        }
        return out
    }
}

extension AppModel {
    /// Enrol in a pack: a course with derived settings and one unactivated card per item (ONBOARDING §5).
    func enroll(pack: Curriculum, recall: String, minutesPerDay: Int, recallDrawing: InkAreaModel?) async throws {
        let n = Self.now()
        let derived = schedulingFor(minutesPerDay)
        let background = recall.trimmingCharacters(in: .whitespacesAndNewlines)
        var settings = CourseSettings()
        settings.reviewsPerDay = derived.reviewsPerDay
        settings.desiredRetention = derived.desiredRetention
        let course = Course(id: uuidv7(n), curriculumId: pack.manifest.id, curriculumVersion: pack.manifest.version,
                            title: pack.manifest.title,
                            goals: CourseGoals(purpose: .understand, weeklyMinutes: derived.weeklyMinutes,
                                               background: background.isEmpty ? nil : background),
                            settings: settings,
                            scaffolding: scaffoldingFromBackground(background.isEmpty ? nil : background, .working),
                            createdAt: n, updatedAt: n)
        try await store.saveCurriculum(pack)
        try await store.saveCourse(course)
        var cards: [Card] = []
        for concept in pack.allConcepts {
            for item in concept.items {
                cards.append(Card(id: uuidv7(n), courseId: course.id, itemId: item.id, conceptId: concept.id,
                                  due: n + CourseService.unactivatedOffsetMs))
            }
        }
        try await store.saveCards(cards)
        if let recallDrawing {
            try await store.saveInk(InkRecord(id: uuidv7(n), courseId: course.id, ownerKind: .firstRun, ownerId: course.id,
                                              itemId: nil, paper: recallDrawing.paper, drawing: recallDrawing.drawing.dataRepresentation(),
                                              width: Theme.readingWidth, height: recallDrawing.height,
                                              strokeCount: recallDrawing.drawing.strokes.count, writingMs: recallDrawing.writingMs,
                                              firstStrokeMs: recallDrawing.firstStrokeMs, createdAt: n, updatedAt: n))
        }
        courses = try await store.courses()
        try await open(courseId: course.id)
    }

    var service: CourseService? { context.map { CourseService(ctx: $0, store: store) } }
}
