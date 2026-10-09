// FSRS parameter defaults and optimizer policy (web DESIGN §5.1, §5.7; params.ts).

/// FSRS-6 default 21-parameter vector, from the ts-fsrs port so both stay in lockstep.
public let DEFAULT_FSRS_W: [Double] = generatorParameters().w

/// Learning / relearning steps adopted from DESIGN §5.1.
public let DEFAULT_LEARNING_STEPS = ["1m", "10m"]
public let DEFAULT_RELEARNING_STEPS = ["10m"]

/// Maximum interval when no exam date is set (100 years, the FSRS convention).
public let DEFAULT_MAXIMUM_INTERVAL_DAYS = 36_500

/// Optimizer policy: first fit after this many logged reviews, then at most every 30 days.
public let MIN_REVIEWS_FOR_OPTIMIZE = 400
public let OPTIMIZE_INTERVAL_MS = 30 * dayMs

/// Leech rule (DESIGN §5.1): suspend and flag for rewrite at 8 lapses.
public let LEECH_LAPSES = 8

/// Whether the optimizer should run now.
public func shouldOptimize(_ nReviews: Int, _ lastOptimizedAt: EpochMs?, _ now: EpochMs) -> Bool {
    if nReviews < MIN_REVIEWS_FOR_OPTIMIZE { return false }
    guard let lastOptimizedAt else { return true }
    return now - lastOptimizedAt >= OPTIMIZE_INTERVAL_MS
}
