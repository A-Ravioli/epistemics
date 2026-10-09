// Daily queue construction and the review gate (DESIGN §5.3-5.4; queue.ts).
//
//   intraday learning (due now) → interday learning → reviews due today → new items (gate permitting)
//
//   debt      = max(0, due_reviews_today − reviews_per_day)
//   gate_open = due_reviews_remaining_today == 0 && overdue_days < 3
//   recovery  = overdue_days ≥ 3 (session capped, lowest retrievability first, lesson hidden)
//
// Pure: takes `now`, an optional rng and the caller's retrievability function. Sorting goes through
// `jsSort`, because the random tie-break keys are drawn inside the comparator.

public let RECOVERY_OVERDUE_DAYS = 3
public let DEFAULT_LEARN_AHEAD_MS = 20 * 60_000
public let DEFAULT_SECONDS_PER_ITEM = 25.0

public struct QueueItemInfo: Codable, Sendable, Hashable {
    public var conceptId: String
    public var type: ItemType
    public init(conceptId: String, type: ItemType) { self.conceptId = conceptId; self.type = type }
}

public struct BuildQueueInput {
    public var cards: [Card]
    public var now: EpochMs
    public var settings: CourseSettings
    /// Item metadata per card id; falls back to `card.conceptId` when a card is missing here.
    public var itemsByCard: [String: QueueItemInfo]
    public var retrievability: (Card) -> Double
    /// Concepts already shown this session; their remaining siblings are buried.
    public var recentlyShownConceptIds: Set<String>?
    /// Uniform [0,1) source for the random tie-break. Defaults to a fixed sequence (deterministic).
    public var rng: Rng?
    /// Reviews already answered today, subtracted from `reviewsPerDay`.
    public var reviewsDoneToday: Int?
    /// New cards already introduced today, subtracted from `maxNewItemsPerDay`.
    public var newDoneToday: Int?
    /// Intraday learning cards due within this window count as due now. Default 20 min.
    public var learnAheadMs: Int?
    /// Days the backlog has already been carried over, if the caller tracks it; merged with the derived value.
    public var debtCarriedOverDays: Int?

    public init(cards: [Card], now: EpochMs, settings: CourseSettings, itemsByCard: [String: QueueItemInfo],
                retrievability: @escaping (Card) -> Double, recentlyShownConceptIds: Set<String>? = nil, rng: Rng? = nil,
                reviewsDoneToday: Int? = nil, newDoneToday: Int? = nil, learnAheadMs: Int? = nil, debtCarriedOverDays: Int? = nil) {
        self.cards = cards; self.now = now; self.settings = settings; self.itemsByCard = itemsByCard
        self.retrievability = retrievability; self.recentlyShownConceptIds = recentlyShownConceptIds; self.rng = rng
        self.reviewsDoneToday = reviewsDoneToday; self.newDoneToday = newDoneToday; self.learnAheadMs = learnAheadMs
        self.debtCarriedOverDays = debtCarriedOverDays
    }
}

public struct Queue: Sendable, Hashable {
    /// Intraday learning (due now) followed by interday learning due today.
    public var learning: [Card]
    /// Review-state cards due today, capped at `reviewsPerDay`.
    public var reviews: [Card]
    /// New cards to introduce, empty unless the gate is open.
    public var newCards: [Card]
    /// Cards due today but held back by sibling burying; they surface on the next build.
    public var buried: [Card]
    /// max(0, due reviews today − reviews_per_day).
    public var debt: Int
    /// Count of learning + review cards due today before capping/burying.
    public var dueToday: Int
    public var gateOpen: Bool
    public var recoveryMode: Bool
    /// Study days the oldest due review in an over-capacity backlog has been waiting.
    public var overdueDays: Int
    /// Study days needed to clear today's due reviews at `reviewsPerDay`.
    public var daysToClear: Int

    /// Every card to answer, in order.
    public var all: [Card] { learning + reviews + newCards }
}

/// Fixed-sequence fallback so builds without an rng are still deterministic.
func defaultQueueRng() -> Rng { lcgRng(0x9E37_79B9) }

public func buildQueue(_ input: BuildQueueInput) -> Queue {
    let cards = input.cards, now = input.now, settings = input.settings, itemsByCard = input.itemsByCard
    let rng = input.rng ?? defaultQueueRng()
    let learnAheadMs = input.learnAheadMs ?? DEFAULT_LEARN_AHEAD_MS
    let dayCfg = settings.dayConfig
    let dayStart = studyDayStart(now, dayCfg)
    let dayEnd = studyDayStart(dayStart + 36 * 3_600_000, dayCfg)

    func conceptOf(_ c: Card) -> String { itemsByCard[c.id]?.conceptId ?? c.conceptId }
    let active = cards.filter { !$0.suspended }

    var intraday: [Card] = [], interday: [Card] = [], dueReviews: [Card] = [], fresh: [Card] = []
    for c in active {
        switch c.state {
        case .new:
            fresh.append(c)
        case .learning, .relearning:
            if c.scheduledDays == 0 {
                if c.due <= now + learnAheadMs { intraday.append(c) }
            } else if c.due < dayEnd {
                interday.append(c)
            }
        case .review:
            if c.due < dayEnd { dueReviews.append(c) }
        }
    }

    let reviewsLeftToday = max(0, settings.reviewsPerDay - (input.reviewsDoneToday ?? 0))
    let debt = max(0, dueReviews.count - reviewsLeftToday)

    var overdueDays = 0
    if debt > 0 {
        for c in dueReviews {
            let age = daysBetween(studyDayStart(c.due, dayCfg), dayStart)
            if age > overdueDays { overdueDays = age }
        }
    }
    overdueDays = max(overdueDays, input.debtCarriedOverDays ?? 0)
    let recoveryMode = overdueDays >= RECOVERY_OVERDUE_DAYS

    // Ordering. Random tie-break keys are drawn once per card so the sort comparator stays consistent.
    var tie: [String: Double] = [:]
    func tieOf(_ c: Card) -> Double {
        if let t = tie[c.id] { return t }
        let t = rng()
        tie[c.id] = t
        return t
    }
    func byDueThenRandom(_ a: Card, _ b: Card) -> Double {
        let d = Double(a.due - b.due)
        if jsTruthy(d) { return d }
        let t = tieOf(a) - tieOf(b)
        if jsTruthy(t) { return t }
        return Double(jsLocaleCompare(a.id, b.id))
    }
    jsSort(&intraday, byDueThenRandom)
    jsSort(&interday, byDueThenRandom)
    if debt > 0 {
        var r: [String: Double] = [:]
        for c in dueReviews { r[c.id] = input.retrievability(c) }
        jsSort(&dueReviews) { a, b in
            let dr = r[a.id]! - r[b.id]!
            if jsTruthy(dr) { return dr }
            let dd = Double(a.due - b.due)
            if jsTruthy(dd) { return dd }
            return Double(jsLocaleCompare(a.id, b.id))
        }
    } else {
        jsSort(&dueReviews, byDueThenRandom)
    }
    jsSort(&fresh, byDueThenRandom)

    // Sibling burying: at most one card per concept per build (DESIGN §5.1).
    var seen = input.recentlyShownConceptIds ?? []
    var buried: [Card] = []
    func take(_ list: [Card], _ limit: Int) -> [Card] {
        var out: [Card] = []
        for c in list {
            if out.count >= limit { break }
            let concept = conceptOf(c)
            if seen.contains(concept) {
                buried.append(c)
                continue
            }
            seen.insert(concept)
            out.append(c)
        }
        return out
    }

    let learning = take(intraday, .max) + take(interday, .max)
    let reviews = take(dueReviews, reviewsLeftToday)

    let dueToday = intraday.count + interday.count + dueReviews.count
    let gateOpen = dueToday == 0 && overdueDays < RECOVERY_OVERDUE_DAYS
    let newLimit = max(0, settings.maxNewItemsPerDay - (input.newDoneToday ?? 0))
    let newCards = gateOpen && !recoveryMode ? take(fresh, newLimit) : []

    return Queue(
        learning: learning, reviews: reviews, newCards: newCards, buried: buried, debt: debt, dueToday: dueToday,
        gateOpen: gateOpen, recoveryMode: recoveryMode, overdueDays: overdueDays,
        daysToClear: settings.reviewsPerDay > 0 ? Int((Double(dueReviews.count) / Double(settings.reviewsPerDay)).rounded(.up)) : 0)
}

/// Whole minutes (rounded up) the queue will take at `secondsPerItem` per card.
public func estimateMinutes(_ queue: Queue, secondsPerItem: Double = DEFAULT_SECONDS_PER_ITEM) -> Int {
    estimateMinutes(count: queue.learning.count + queue.reviews.count + queue.newCards.count, secondsPerItem: secondsPerItem)
}

public func estimateMinutes(count n: Int, secondsPerItem: Double = DEFAULT_SECONDS_PER_ITEM) -> Int {
    Int((Double(n) * secondsPerItem / 60).rounded(.up))
}
