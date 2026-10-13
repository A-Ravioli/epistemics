// Load simulator: replays the daily queue for N days with a synthetic learner and reports per-day load.
// Deterministic given a seed (mulberry32). Used for "projected days to clear" and the shortfall estimate.
// simulate.ts.

public struct SimulateOptions {
    /// Probability the learner recalls `card` at `now`. Default: FSRS retrievability, or `pNew` for New cards.
    public var pRecall: ((Card, EpochMs) -> Double)?
    /// New cards introduced per day (bounded by the gate and `maxNewItemsPerDay`). Default 0.
    public var newPerDay: Int?
    /// Recall probability for a card's first exposure. Default 0.7.
    public var pNew: Double?
    /// Epoch ms of the first simulated session. Default 2026-01-05 10:00 UTC.
    public var startAt: EpochMs?
    public var seed: Int?
    public var secondsPerItem: Double?
    /// Safety cap on answers per simulated day.
    public var maxAnswersPerDay: Int?
    public init(pRecall: ((Card, EpochMs) -> Double)? = nil, newPerDay: Int? = nil, pNew: Double? = nil, startAt: EpochMs? = nil,
                seed: Int? = nil, secondsPerItem: Double? = nil, maxAnswersPerDay: Int? = nil) {
        self.pRecall = pRecall; self.newPerDay = newPerDay; self.pNew = pNew; self.startAt = startAt; self.seed = seed
        self.secondsPerItem = secondsPerItem; self.maxAnswersPerDay = maxAnswersPerDay
    }
}

public struct SimulatedDay: Codable, Sendable, Hashable {
    public var day: String
    /// Answers on non-New cards, including same-day learning steps.
    public var reviews: Int
    public var newCards: Int
    public var minutes: Int
    /// Cards due at the start of the day that did not fit under `reviewsPerDay`.
    public var debt: Int
}

/// 2026-01-05 10:00 UTC.
let SIMULATE_DEFAULT_START: EpochMs = daysFromCivil(2026, 1, 5) * dayMs + 10 * 3_600_000

public func simulateLoad(_ cards: [Card], _ days: Int, _ settings: CourseSettings, _ scheduler: Scheduler,
                         _ opts: SimulateOptions = SimulateOptions()) -> [SimulatedDay] {
    let rng = mulberry32(opts.seed ?? 1)
    let newPerDay = min(opts.newPerDay ?? 0, settings.maxNewItemsPerDay)
    let pNew = opts.pNew ?? 0.7
    let secondsPerItem = opts.secondsPerItem ?? DEFAULT_SECONDS_PER_ITEM
    let maxAnswers = opts.maxAnswersPerDay ?? 5_000
    let stepMs = Int(secondsPerItem * 1000)
    let dayCfg = settings.dayConfig
    let startAt = opts.startAt ?? SIMULATE_DEFAULT_START
    let pRecall = opts.pRecall ?? { c, now in c.state == .new ? pNew : scheduler.retrievability(c, now) }
    var daySettings = settings
    daySettings.maxNewItemsPerDay = newPerDay

    var pool = JSMap<String, Card>()
    var itemsByCard: [String: QueueItemInfo] = [:]
    for c in cards {
        pool[c.id] = c
        itemsByCard[c.id] = QueueItemInfo(conceptId: c.conceptId, type: .recall)
    }
    var synthetic = 0
    let courseId = cards.first?.courseId ?? "sim"

    var out: [SimulatedDay] = []
    for d in 0..<max(0, days) {
        let dayAt = startAt + d * dayMs
        let dayEnd = studyDayStart(dayAt + 36 * 3_600_000, dayCfg)
        var now = dayAt
        var reviews = 0, reviewStateAnswers = 0, newCards = 0, debt = 0, answers = 0

        // Keep enough New cards in the pool for today's intake; synthetic cards get their own concept.
        var available = pool.values.filter { $0.state == .new }.count
        while available < newPerDay {
            synthetic += 1
            let c = scheduler.newCard(courseId, "sim-item-\(synthetic)", "sim-concept-\(synthetic)", now, id: "sim-card-\(synthetic)")
            pool[c.id] = c
            itemsByCard[c.id] = QueueItemInfo(conceptId: c.conceptId, type: .recall)
            available += 1
        }

        func answer(_ card: Card) {
            // Wait out an intraday learning step, but never let the session clock cross the study-day boundary.
            let isStep = (card.state == .learning || card.state == .relearning) && card.scheduledDays == 0
            if isStep && card.due > now { now = min(card.due, dayEnd - stepMs) }
            let rating: Rating = rng() < pRecall(card, now) ? .good : .again
            let next = scheduler.applyRating(card, rating, now, ReviewContext(source: .review, assisted: false)).card
            pool[next.id] = next
            if card.state == .review { reviewStateAnswers += 1 }
            now += stepMs
            answers += 1
        }

        // Answer whatever the queue offers until it is empty: due learning/reviews first, then gated new cards.
        var build = 0
        while answers < maxAnswers {
            let at = now
            let q = buildQueue(BuildQueueInput(
                cards: pool.values, now: now, settings: daySettings, itemsByCard: itemsByCard,
                retrievability: { scheduler.retrievability($0, at) }, rng: rng,
                reviewsDoneToday: reviewStateAnswers, newDoneToday: newCards, learnAheadMs: max(0, dayEnd - now)))
            if build == 0 { debt = q.debt }
            let due = q.learning + q.reviews
            if !due.isEmpty {
                for c in due {
                    if answers >= maxAnswers { break }
                    answer(c)
                    reviews += 1
                }
            } else if !q.newCards.isEmpty {
                for c in q.newCards {
                    if answers >= maxAnswers { break }
                    answer(c)
                    newCards += 1
                }
            } else {
                break
            }
            build += 1
        }

        out.append(SimulatedDay(day: studyDay(dayAt, dayCfg), reviews: reviews, newCards: newCards,
                                minutes: Int((Double(answers) * secondsPerItem / 60).rounded(.up)), debt: debt))
    }
    return out
}
