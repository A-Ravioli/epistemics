// Thin, explicit wrapper over FSRS-6 that speaks our `Card` / `ReviewLogEntry` types (scheduler/fsrs.ts).
//
// Pure: no clock, no I/O. Every function takes `now` as epoch ms. Fuzz (when enabled) is seeded from review
// time, reps and D×S, so results are deterministic for a given input and identical to the web's.

public struct SchedulerParams: Sendable, Hashable {
    /// FSRS parameter vector (17/19/21 entries; migrated). Defaults to the FSRS-6 defaults.
    public var w: [Double]?
    /// Desired retention, 0.8...0.95 (DESIGN §5.1).
    public var desiredRetention: Double
    /// Interval cap in days; pass `daysToExam` when an exam date is set. Default 36,500.
    public var maximumIntervalDays: Int?
    /// Interval fuzz. Default true (DESIGN §5.1).
    public var enableFuzz: Bool?
    public init(w: [Double]? = nil, desiredRetention: Double, maximumIntervalDays: Int? = nil, enableFuzz: Bool? = nil) {
        self.w = w; self.desiredRetention = desiredRetention; self.maximumIntervalDays = maximumIntervalDays; self.enableFuzz = enableFuzz
    }
}

/// Context attached to a review when it is applied (or previewed).
public struct ReviewContext: Sendable, Hashable {
    public var source: ReviewSource
    public var assisted: Bool
    public var confidence: Confidence?
    public var durationMs: Int?
    public init(source: ReviewSource = .review, assisted: Bool = false, confidence: Confidence? = nil, durationMs: Int? = nil) {
        self.source = source; self.assisted = assisted; self.confidence = confidence; self.durationMs = durationMs
    }
}

public struct RatingOutcome: Sendable, Hashable {
    public var card: Card
    /// A fresh UUIDv7 id stamped with the review time.
    public var log: ReviewLogEntry
}

/// Our Card → ts-fsrs Card. States and ratings share numeric values.
public func toFsrsCard(_ card: Card) -> FSRSCard {
    FSRSCard(due: card.due, stability: card.stability, difficulty: card.difficulty, elapsedDays: 0,
             scheduledDays: card.scheduledDays, learningSteps: card.learningSteps, reps: card.reps, lapses: card.lapses,
             state: card.state, lastReview: card.lastReview)
}

/// ts-fsrs Card → our Card, keeping ids and app-level flags from `base`.
public func fromFsrsCard(_ base: Card, _ f: FSRSCard) -> Card {
    var out = base
    out.state = f.state
    out.due = f.due
    out.stability = f.stability
    out.difficulty = f.difficulty
    out.scheduledDays = f.scheduledDays
    out.learningSteps = f.learningSteps
    out.reps = f.reps
    out.lapses = f.lapses
    out.lastReview = f.lastReview
    return out
}

/// Days from `now` to `examDate` (at least 1), for `maximumIntervalDays` on exam courses.
public func daysToExam(_ now: EpochMs, _ examDate: EpochMs) -> Int {
    max(1, Int((Double(examDate - now) / Double(dayMs)).rounded(.up)))
}

/// Leech rule (DESIGN §5.1).
public func isLeech(_ card: Card, threshold: Int = LEECH_LAPSES) -> Bool { card.lapses >= threshold }

public struct Scheduler: Sendable, Hashable {
    /// Effective parameters (read-only view).
    public let params: FSRSParameters
    /// Underlying engine, for callers that need raw formulas (implicit credit, simulator).
    public let engine: FSRS

    public init(_ p: SchedulerParams) {
        let props = FSRSParameterProps(
            requestRetention: p.desiredRetention,
            maximumInterval: max(1, p.maximumIntervalDays ?? DEFAULT_MAXIMUM_INTERVAL_DAYS),
            w: p.w,
            enableFuzz: p.enableFuzz ?? true,
            enableShortTerm: true,
            learningSteps: DEFAULT_LEARNING_STEPS,
            relearningSteps: DEFAULT_RELEARNING_STEPS)
        params = generatorParameters(props)
        engine = FSRS(props)
    }

    private func outcome(_ base: Card, _ item: RecordLogItem, _ now: EpochMs, _ ctx: ReviewContext, _ rating: Rating) -> RatingOutcome {
        var card = fromFsrsCard(base, item.card)
        // A provisional (diagnostic-seeded) card is confirmed by its first real review; demoted on Again.
        card.provisional = false
        // ts-fsrs enforces hard < good < easy by adding a day after applying maximum_interval, which can
        // overshoot the cap by up to two days. The exam cap is a hard limit here.
        if card.state == .review && card.scheduledDays > params.maximumInterval {
            card.scheduledDays = params.maximumInterval
            card.due = now + card.scheduledDays * dayMs
        }
        let log = ReviewLogEntry(id: uuidv7(now), cardId: base.id, courseId: base.courseId, reviewTime: now, rating: rating,
                                 stateBefore: item.log.state, elapsedDays: item.log.elapsedDays, scheduledDays: card.scheduledDays,
                                 stability: card.stability, difficulty: card.difficulty, durationMs: ctx.durationMs,
                                 confidence: ctx.confidence, source: ctx.source, assisted: ctx.assisted)
        return RatingOutcome(card: card, log: log)
    }

    /// A New card for an item. `id` defaults to a fresh UUIDv7 stamped with `now`.
    public func newCard(_ courseId: String, _ itemId: String, _ conceptId: String, _ now: EpochMs, id: String? = nil) -> Card {
        let base = Card(id: id ?? uuidv7(now), courseId: courseId, itemId: itemId, conceptId: conceptId, due: now)
        return fromFsrsCard(base, createEmptyCard(now))
    }

    /// Outcome for every rating without committing. Logs carry `ctx` (default: review, unassisted).
    public func previewRatings(_ card: Card, _ now: EpochMs, _ ctx: ReviewContext = ReviewContext()) -> [Rating: RatingOutcome] {
        let preview = engine.repeat(toFsrsCard(card), now)
        var out: [Rating: RatingOutcome] = [:]
        for r in Rating.allCases { out[r] = outcome(card, preview[r]!, now, ctx, r) }
        return out
    }

    /// Apply one rating and produce the next card plus its review-log entry.
    public func applyRating(_ card: Card, _ rating: Rating, _ now: EpochMs, _ ctx: ReviewContext) -> RatingOutcome {
        outcome(card, engine.next(toFsrsCard(card), now, rating), now, ctx, rating)
    }

    /// Probability of recall at `now` (0...1). 0 for New cards.
    public func retrievability(_ card: Card, _ now: EpochMs) -> Double {
        if card.state == .new { return 0 }
        return engine.getRetrievability(toFsrsCard(card), now)
    }

    /// Diagnostic seeding (DESIGN §6.4): state Review, given stability, difficulty 5, provisional.
    public func seedKnownCard(_ card: Card, _ now: EpochMs, stabilityDays: Double = 21) -> Card {
        let stability = jsMax(0.001, stabilityDays)
        let interval = intervalForStability(stability)
        var out = card
        out.state = .review
        out.stability = stability
        out.difficulty = 5
        out.lastReview = now
        out.due = now + interval * dayMs
        out.scheduledDays = interval
        out.learningSteps = 0
        out.provisional = true
        return out
    }

    /// Un-fuzzed interval in days for a stability at the configured desired retention, capped.
    public func intervalForStability(_ stability: Double) -> Int {
        let raw = jsRound(stability * engine.intervalModifier)
        return Int(jsMin(jsMax(1, raw), Double(params.maximumInterval)))
    }
}

/// TS name.
public func createScheduler(_ params: SchedulerParams) -> Scheduler { Scheduler(params) }
