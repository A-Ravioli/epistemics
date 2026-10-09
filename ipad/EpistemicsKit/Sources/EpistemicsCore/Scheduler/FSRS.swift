import Foundation

// FSRS-6, ported line for line from ts-fsrs 5.4.2 (constant.ts, default.ts, help.ts, algorithm.ts,
// abstract_scheduler.ts, impl/basic_scheduler.ts, strategies/learning_steps.ts, strategies/seed.ts).
// Only the paths the web wrapper uses are ported: the short-term (Basic) scheduler with learning steps
// and the default seed strategy. Names follow ts-fsrs so the two read side by side.
//
// One deliberate difference: where ts-fsrs throws FSRSValidationError on an impossible memory state
// (negative elapsed days, difficulty < 1 or stability < S_MIN on a reviewed card), this port clamps into
// range instead, so a clock skew between synced devices cannot crash a review. Valid inputs are unaffected.

public enum FSRSConstants {
    public static let defaultRequestRetention = 0.9
    public static let defaultMaximumInterval = 36_500
    public static let defaultEnableFuzz = false
    public static let defaultEnableShortTerm = true
    public static let defaultLearningSteps = ["1m", "10m"]
    public static let defaultRelearningSteps = ["10m"]
    public static let sMin = 0.001
    public static let sMax = 36_500.0
    public static let initSMax = 100.0
    public static let fsrs5DefaultDecay = 0.5
    public static let fsrs6DefaultDecay = 0.1542
    public static let w17W18Ceiling = 2.0
    public static let defaultW: [Double] = [
        0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
        1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, fsrs6DefaultDecay,
    ]

    static func clampParameters(_ w17w18Ceiling: Double, _ enableShortTerm: Bool) -> [(Double, Double)] {
        [
            (sMin, initSMax), (sMin, initSMax), (sMin, initSMax), (sMin, initSMax),
            (1.0, 10.0), (0.001, 4.0), (0.001, 4.0), (0.001, 0.75),
            (0.0, 4.5), (0.0, 0.8), (0.001, 3.5),
            (0.001, 5.0), (0.001, 0.25), (0.001, 0.9), (0.0, 4.0),
            (0.0, 1.0), (1.0, 6.0),
            (0.0, w17w18Ceiling), (0.0, w17w18Ceiling),
            (enableShortTerm ? 0.01 : 0.0, 0.8),
            (0.1, 0.8),
        ]
    }
}

public struct FSRSParameters: Codable, Sendable, Hashable {
    public var requestRetention: Double
    public var maximumInterval: Int
    public var w: [Double]
    public var enableFuzz: Bool
    public var enableShortTerm: Bool
    public var learningSteps: [String]
    public var relearningSteps: [String]
}

/// Partial parameters, as `generatorParameters(props)` takes them.
public struct FSRSParameterProps: Sendable, Hashable {
    public var requestRetention: Double?
    public var maximumInterval: Int?
    public var w: [Double]?
    public var enableFuzz: Bool?
    public var enableShortTerm: Bool?
    public var learningSteps: [String]?
    public var relearningSteps: [String]?
    public init(requestRetention: Double? = nil, maximumInterval: Int? = nil, w: [Double]? = nil, enableFuzz: Bool? = nil,
                enableShortTerm: Bool? = nil, learningSteps: [String]? = nil, relearningSteps: [String]? = nil) {
        self.requestRetention = requestRetention; self.maximumInterval = maximumInterval; self.w = w
        self.enableFuzz = enableFuzz; self.enableShortTerm = enableShortTerm
        self.learningSteps = learningSteps; self.relearningSteps = relearningSteps
    }
}

/// `parameters[i] || 0`.
@inline(__always) private func orZero(_ p: [Double], _ i: Int) -> Double {
    guard i < p.count else { return 0 }
    return jsTruthy(p[i]) ? p[i] : 0
}

public func clipParameters(_ parameters: [Double], _ numRelearningSteps: Int, _ enableShortTerm: Bool = FSRSConstants.defaultEnableShortTerm) -> [Double] {
    var clip = Array(FSRSConstants.clampParameters(FSRSConstants.w17W18Ceiling, enableShortTerm).prefix(parameters.count))
    if max(0, numRelearningSteps) > 1 {
        // PLS × e^(num_relearning_steps × w17 × w18) ≤ S, at D = 1, R = 0.7, S = 1 (see ts-fsrs default.ts).
        func bound(_ i: Int) -> (Double, Double) { i < clip.count ? clip[i] : FSRSConstants.clampParameters(FSRSConstants.w17W18Ceiling, enableShortTerm)[i] }
        let w11 = jsClamp(orZero(parameters, 11), bound(11).0, bound(11).1)
        let w13 = jsClamp(orZero(parameters, 13), bound(13).0, bound(13).1)
        let w14 = jsClamp(orZero(parameters, 14), bound(14).0, bound(14).1)
        let value = -(log(w11) + log(pow(2.0, w13) - 1.0) + w14 * 0.3) / Double(numRelearningSteps)
        let ceiling = jsClamp(roundTo(sqrt(jsMax(value, 0)), 8), 0.01, FSRSConstants.w17W18Ceiling)
        if clip.count > 17 { clip[17] = (clip[17].0, ceiling) }
        if clip.count > 18 { clip[18] = (clip[18].0, ceiling) }
    }
    return clip.enumerated().map { i, b in jsClamp(orZero(parameters, i), b.0, b.1) }
}

public func migrateParameters(_ parameters: [Double]?, _ numRelearningSteps: Int = 0, _ enableShortTerm: Bool = FSRSConstants.defaultEnableShortTerm) -> [Double] {
    guard let parameters else { return FSRSConstants.defaultW }
    switch parameters.count {
    case 21:
        return clipParameters(parameters, numRelearningSteps, enableShortTerm)
    case 19:
        return clipParameters(parameters, numRelearningSteps, enableShortTerm) + [0.0, FSRSConstants.fsrs5DefaultDecay]
    case 17:
        var w = clipParameters(parameters, numRelearningSteps, enableShortTerm)
        w[4] = jsToFixedNumber(w[5] * 2.0 + w[4], 8)
        w[5] = jsToFixedNumber(log(w[5] * 3.0 + 1.0) / 3.0, 8)
        w[6] = jsToFixedNumber(w[6] + 0.5, 8)
        return w + [0.0, 0.0, 0.0, FSRSConstants.fsrs5DefaultDecay]
    default:
        return FSRSConstants.defaultW
    }
}

public func generatorParameters(_ props: FSRSParameterProps = FSRSParameterProps()) -> FSRSParameters {
    let learningSteps = props.learningSteps ?? FSRSConstants.defaultLearningSteps
    let relearningSteps = props.relearningSteps ?? FSRSConstants.defaultRelearningSteps
    let enableShortTerm = props.enableShortTerm ?? FSRSConstants.defaultEnableShortTerm
    let w = migrateParameters(props.w, relearningSteps.count, enableShortTerm)
    let retention = props.requestRetention.flatMap { jsTruthy($0) ? $0 : nil } ?? FSRSConstants.defaultRequestRetention
    let maxInterval = props.maximumInterval.flatMap { $0 != 0 ? $0 : nil } ?? FSRSConstants.defaultMaximumInterval
    return FSRSParameters(requestRetention: retention, maximumInterval: maxInterval, w: w,
                          enableFuzz: props.enableFuzz ?? FSRSConstants.defaultEnableFuzz,
                          enableShortTerm: enableShortTerm, learningSteps: learningSteps, relearningSteps: relearningSteps)
}

/// decay = −w20; factor = e^(ln 0.9 / decay) − 1.
public func computeDecayFactor(_ w: [Double]) -> (decay: Double, factor: Double) {
    let decay = -w[20]
    let factor = exp(pow(decay, -1) * log(0.9)) - 1.0
    return (decay, roundTo(factor, 8))
}

/// R(t, S) = (1 + FACTOR × t / S)^DECAY.
public func forgettingCurve(_ w: [Double], _ elapsedDays: Double, _ stability: Double) -> Double {
    let (decay, factor) = computeDecayFactor(w)
    return roundTo(pow(1 + (factor * elapsedDays) / stability, decay), 8)
}

/// Days between the UTC calendar dates of two instants (ts-fsrs `dateDiffInDays`).
public func dateDiffInDays(_ last: EpochMs, _ cur: EpochMs) -> Int {
    floorDiv(cur, dayMs) - floorDiv(last, dayMs)
}

// MARK: - Cards and logs (ts-fsrs shapes)

public struct FSRSCard: Codable, Sendable, Hashable {
    public var due: EpochMs
    public var stability: Double
    public var difficulty: Double
    public var elapsedDays: Int
    public var scheduledDays: Int
    public var learningSteps: Int
    public var reps: Int
    public var lapses: Int
    public var state: CardState
    public var lastReview: EpochMs?
    public init(due: EpochMs, stability: Double, difficulty: Double, elapsedDays: Int, scheduledDays: Int, learningSteps: Int,
                reps: Int, lapses: Int, state: CardState, lastReview: EpochMs?) {
        self.due = due; self.stability = stability; self.difficulty = difficulty; self.elapsedDays = elapsedDays
        self.scheduledDays = scheduledDays; self.learningSteps = learningSteps; self.reps = reps; self.lapses = lapses
        self.state = state; self.lastReview = lastReview
    }
}

public struct FSRSReviewLog: Codable, Sendable, Hashable {
    public var rating: Rating
    /// State before the review.
    public var state: CardState
    public var due: EpochMs
    public var stability: Double
    public var difficulty: Double
    public var elapsedDays: Int
    public var lastElapsedDays: Int
    public var scheduledDays: Int
    public var learningSteps: Int
    public var review: EpochMs
}

public struct RecordLogItem: Codable, Sendable, Hashable {
    public var card: FSRSCard
    public var log: FSRSReviewLog
}

public func createEmptyCard(_ now: EpochMs) -> FSRSCard {
    FSRSCard(due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0,
             reps: 0, lapses: 0, state: .new, lastReview: nil)
}

// MARK: - Algorithm

/// `FSRS` (algorithm + Basic scheduler). A value type: the seed ts-fsrs keeps in a mutable field is
/// passed explicitly per review.
public struct FSRS: Sendable, Hashable {
    public let parameters: FSRSParameters
    public let intervalModifier: Double
    private let decay: Double
    private let factor: Double

    public init(_ props: FSRSParameterProps) {
        var generated = generatorParameters(props)
        generated.w = clipParameters(generated.w, generated.relearningSteps.count, generated.enableShortTerm)
        parameters = generated
        (decay, factor) = computeDecayFactor(generated.w)
        let r = generated.requestRetention
        precondition(r > 0 && r <= 1, "Requested retention rate should be in the range (0,1]")
        intervalModifier = roundTo((pow(r, 1 / decay) - 1) / factor, 8)
    }

    /// TS name.
    public var interval_modifier: Double { intervalModifier }
    private var w: [Double] { parameters.w }

    public func forgettingCurve(_ elapsedDays: Double, _ stability: Double) -> Double {
        roundTo(pow(1 + (factor * elapsedDays) / stability, decay), 8)
    }

    /// S0(G) = max(w[G−1], 0.1).
    public func initStability(_ g: Int) -> Double { jsMax(w[g - 1], 0.1) }

    /// D0(G) = w4 − e^((G−1)·w5) + 1.
    public func initDifficulty(_ g: Int) -> Double {
        roundTo(w[4] - exp(Double(g - 1) * w[5]) + 1, 8)
    }

    func applyFuzz(_ ivl: Double, _ elapsedDays: Int, seed: String) -> Int {
        if !parameters.enableFuzz || ivl < 2.5 { return Int(jsRound(ivl)) }
        var generator = Alea(seed: seed)
        let fuzzFactor = generator.next()
        let (minIvl, maxIvl) = getFuzzRange(ivl, Double(elapsedDays), Double(parameters.maximumInterval))
        return Int((fuzzFactor * (maxIvl - minIvl + 1) + minIvl).rounded(.down))
    }

    public func nextInterval(_ s: Double, _ elapsedDays: Int, seed: String) -> Int {
        let newInterval = jsMin(jsMax(1, jsRound(s * intervalModifier)), Double(parameters.maximumInterval))
        return applyFuzz(newInterval, elapsedDays, seed: seed)
    }

    func linearDamping(_ deltaD: Double, _ oldD: Double) -> Double {
        roundTo((deltaD * (10 - oldD)) / 9, 8)
    }

    public func nextDifficulty(_ d: Double, _ g: Int) -> Double {
        let deltaD = -w[6] * Double(g - 3)
        let nextD = d + linearDamping(deltaD, d)
        return jsClamp(meanReversion(initDifficulty(4), nextD), 1, 10)
    }

    func meanReversion(_ initial: Double, _ current: Double) -> Double {
        roundTo(w[7] * initial + (1 - w[7]) * current, 8)
    }

    public func nextRecallStability(_ d: Double, _ s: Double, _ r: Double, _ g: Int) -> Double {
        let hardPenalty = g == 2 ? w[15] : 1
        let easyBound = g == 4 ? w[16] : 1
        return roundTo(
            jsClamp(s * (1 + exp(w[8]) * (11 - d) * pow(s, -w[9]) * (exp((1 - r) * w[10]) - 1) * hardPenalty * easyBound),
                    FSRSConstants.sMin, 36500.0),
            8)
    }

    public func nextForgetStability(_ d: Double, _ s: Double, _ r: Double) -> Double {
        roundTo(
            jsClamp(w[11] * pow(d, -w[12]) * (pow(s + 1, w[13]) - 1) * exp((1 - r) * w[14]), FSRSConstants.sMin, 36500.0),
            8)
    }

    public func nextShortTermStability(_ s: Double, _ g: Int) -> Double {
        let sinc = pow(s, -w[19]) * exp(w[17] * (Double(g) - 3 + w[18]))
        let masked = g >= 2 ? jsMax(sinc, 1.0) : sinc
        return roundTo(jsClamp(s * masked, FSRSConstants.sMin, 36500.0), 8)
    }

    public func nextState(_ memory: (difficulty: Double, stability: Double)?, _ tArg: Int, _ g: Int, _ rArg: Double? = nil) -> (difficulty: Double, stability: Double) {
        var d = memory?.difficulty ?? 0
        var s = memory?.stability ?? 0
        let t = max(0, tArg) // ts-fsrs throws on t < 0
        if d == 0 && s == 0 {
            return (jsClamp(initDifficulty(g), 1, 10), initStability(g))
        }
        if g == 0 { return (d, s) }
        // ts-fsrs throws on d < 1 || s < S_MIN.
        d = jsClamp(d, 1, 10)
        s = jsMax(s, FSRSConstants.sMin)
        let r = rArg ?? forgettingCurve(Double(t), s)
        let newS: Double
        if t == 0 && parameters.enableShortTerm {
            newS = nextShortTermStability(s, g)
        } else if g == 1 {
            let sAfterFail = nextForgetStability(d, s, r)
            let (w17, w18) = parameters.enableShortTerm ? (w[17], w[18]) : (0.0, 0.0)
            let nextSMin = s / exp(w17 * w18)
            newS = jsClamp(roundTo(nextSMin, 8), FSRSConstants.sMin, sAfterFail)
        } else {
            newS = nextRecallStability(d, s, r, g)
        }
        return (nextDifficulty(d, g), newS)
    }

    // MARK: Scheduler (BasicScheduler + AbstractScheduler)

    /// All four outcomes (`f.repeat(card, now)`).
    public func `repeat`(_ card: FSRSCard, _ now: EpochMs) -> [Rating: RecordLogItem] {
        let ctx = ReviewSession(self, card, now)
        if card.state == .review { return ctx.reviewState() }
        var out: [Rating: RecordLogItem] = [:]
        for g in Rating.allCases { out[g] = ctx.review(g) }
        return out
    }

    /// One outcome (`f.next(card, now, grade)`).
    public func next(_ card: FSRSCard, _ now: EpochMs, _ grade: Rating) -> RecordLogItem {
        ReviewSession(self, card, now).review(grade)
    }

    /// Probability of recall at `now`; 0 for New cards. Elapsed days are whole days since the last review.
    public func getRetrievability(_ card: FSRSCard, _ now: EpochMs) -> Double {
        guard card.state != .new else { return 0 }
        // ts-fsrs throws when a reviewed card has no last_review; treat it as reviewed now.
        let last = card.lastReview ?? now
        let t = jsMax(Double(now - last) / Double(dayMs), 0).rounded(.down)
        return forgettingCurve(t, jsToFixedNumber(card.stability, 8))
    }

    /// ts-fsrs BasicLearningStepsStrategy.
    func learningStepsStrategy(_ state: CardState, _ curStep: Int) -> [Rating: (scheduledMinutes: Double, nextStep: Int)] {
        let steps = (state == .relearning || state == .review) ? parameters.relearningSteps : parameters.learningSteps
        let n = steps.count
        if n == 0 || curStep >= n { return [:] }
        let first = convertStepUnitToMinutes(steps[0])
        func stepInfo(_ i: Int) -> String? { (i < 0 || i >= n) ? nil : steps[i] }
        var result: [Rating: (Double, Int)] = [:]
        let info = stepInfo(max(0, curStep))
        if state == .review {
            result[.again] = (convertStepUnitToMinutes(info!), 0)
            return result
        }
        result[.again] = (first, 0)
        let hard = n == 1 ? jsRound(first * 1.5) : jsRound((first + convertStepUnitToMinutes(steps[1])) / 2)
        result[.hard] = (hard, curStep)
        if let next = stepInfo(curStep + 1) {
            let nextMin = convertStepUnitToMinutes(next)
            if jsTruthy(nextMin) { result[.good] = (jsRound(nextMin), curStep + 1) }
        }
        return result
    }
}

/// "1m" / "10m" / "2h" / "1d" → minutes (`parseInt` semantics on the numeric part).
public func convertStepUnitToMinutes(_ step: String) -> Double {
    let unit = step.last
    var digits = Substring(step.dropLast()).drop { jsIsWhitespace($0.unicodeScalars.first!) }
    var sign = 1.0
    if digits.first == "-" { sign = -1; digits = digits.dropFirst() } else if digits.first == "+" { digits = digits.dropFirst() }
    let numeric = digits.prefix { $0.isASCII && $0.isNumber }
    guard let v = Double(numeric), sign > 0 || v == 0 else {
        preconditionFailure("Invalid step value: \(step)")
    }
    switch unit {
    case "m": return v
    case "h": return v * 60
    case "d": return v * 1440
    default: preconditionFailure("Invalid step unit: \(step), expected m/h/d")
    }
}

/// ts-fsrs `get_fuzz_range`.
func getFuzzRange(_ intervalArg: Double, _ elapsedDays: Double, _ maximumInterval: Double) -> (Double, Double) {
    let ranges: [(start: Double, end: Double, factor: Double)] = [(2.5, 7.0, 0.15), (7.0, 20.0, 0.1), (20.0, .infinity, 0.05)]
    var delta = 1.0
    for r in ranges { delta += r.factor * jsMax(jsMin(intervalArg, r.end) - r.start, 0.0) }
    let interval = jsMin(intervalArg, maximumInterval)
    var minIvl = jsMax(2, jsRound(interval - delta))
    let maxIvl = jsMin(jsRound(interval + delta), maximumInterval)
    if interval > elapsedDays { minIvl = jsMax(minIvl, elapsedDays + 1) }
    minIvl = jsMin(minIvl, maxIvl)
    return (minIvl, maxIvl)
}

/// One review in progress: AbstractScheduler.init + BasicScheduler, without the caching (the methods are pure).
private struct ReviewSession {
    let f: FSRS
    let last: FSRSCard
    var current: FSRSCard
    let reviewTime: EpochMs
    let elapsedDays: Int
    let seed: String

    init(_ f: FSRS, _ card: FSRSCard, _ now: EpochMs) {
        self.f = f
        last = card
        current = card
        reviewTime = now
        var interval = 0
        if card.state != .new, let lastReview = card.lastReview {
            interval = dateDiffInDays(lastReview, now)
        }
        current.lastReview = now
        elapsedDays = interval
        current.elapsedDays = interval
        current.reps += 1
        // DefaultInitSeedStrategy: `${review_time}_${reps}_${difficulty * stability}` (reps after the increment).
        seed = "\(now)_\(current.reps)_\(jsNumberString(current.difficulty * current.stability))"
    }

    func review(_ g: Rating) -> RecordLogItem {
        switch last.state {
        case .new: return newState(g)
        case .learning, .relearning: return learningState(g)
        case .review: return reviewState()[g]!
        }
    }

    func buildLog(_ rating: Rating) -> FSRSReviewLog {
        FSRSReviewLog(rating: rating, state: current.state, due: last.lastReview ?? last.due,
                      stability: current.stability, difficulty: current.difficulty, elapsedDays: elapsedDays,
                      lastElapsedDays: last.elapsedDays, scheduledDays: current.scheduledDays,
                      learningSteps: current.learningSteps, review: reviewTime)
    }

    func nextDs(_ t: Int, _ g: Rating, _ r: Double? = nil) -> FSRSCard {
        let next = f.nextState((current.difficulty, current.stability), t, g.rawValue, r)
        var card = current
        card.difficulty = next.difficulty
        card.stability = next.stability
        return card
    }

    func applyLearningSteps(_ nextCard: inout FSRSCard, _ grade: Rating, _ toState: CardState) {
        let strategy = f.learningStepsStrategy(current.state, current.learningSteps)
        let scheduledMinutes = jsMax(0, strategy[grade]?.scheduledMinutes ?? 0)
        let nextSteps = max(0, strategy[grade]?.nextStep ?? 0)
        if scheduledMinutes > 0 && scheduledMinutes < 1440 {
            nextCard.learningSteps = nextSteps
            nextCard.scheduledDays = 0
            nextCard.state = toState
            nextCard.due = reviewTime + Int(jsRound(scheduledMinutes)) * 60_000
        } else {
            nextCard.state = .review
            if scheduledMinutes >= 1440 {
                nextCard.learningSteps = nextSteps
                nextCard.due = reviewTime + Int(jsRound(scheduledMinutes)) * 60_000
                nextCard.scheduledDays = Int((scheduledMinutes / 1440).rounded(.down))
            } else {
                nextCard.learningSteps = 0
                let interval = f.nextInterval(nextCard.stability, elapsedDays, seed: seed)
                nextCard.scheduledDays = interval
                nextCard.due = reviewTime + interval * dayMs
            }
        }
    }

    func newState(_ g: Rating) -> RecordLogItem {
        var next = nextDs(elapsedDays, g)
        applyLearningSteps(&next, g, .learning)
        return RecordLogItem(card: next, log: buildLog(g))
    }

    func learningState(_ g: Rating) -> RecordLogItem {
        var next = nextDs(elapsedDays, g)
        applyLearningSteps(&next, g, last.state)
        return RecordLogItem(card: next, log: buildLog(g))
    }

    func reviewState() -> [Rating: RecordLogItem] {
        let interval = elapsedDays
        let retrievability = f.forgettingCurve(Double(interval), current.stability)
        var again = nextDs(interval, .again, retrievability)
        var hard = nextDs(interval, .hard, retrievability)
        var good = nextDs(interval, .good, retrievability)
        var easy = nextDs(interval, .easy, retrievability)

        var hardInterval = f.nextInterval(hard.stability, interval, seed: seed)
        var goodInterval = f.nextInterval(good.stability, interval, seed: seed)
        hardInterval = min(hardInterval, goodInterval)
        goodInterval = max(goodInterval, hardInterval + 1)
        let easyInterval = max(f.nextInterval(easy.stability, interval, seed: seed), goodInterval + 1)
        hard.scheduledDays = hardInterval
        hard.due = reviewTime + hardInterval * dayMs
        good.scheduledDays = goodInterval
        good.due = reviewTime + goodInterval * dayMs
        easy.scheduledDays = easyInterval
        easy.due = reviewTime + easyInterval * dayMs
        hard.state = .review
        hard.learningSteps = 0
        good.state = .review
        good.learningSteps = 0
        easy.state = .review
        easy.learningSteps = 0
        applyLearningSteps(&again, .again, .relearning)
        again.lapses += 1
        return [
            .again: RecordLogItem(card: again, log: buildLog(.again)),
            .hard: RecordLogItem(card: hard, log: buildLog(.hard)),
            .good: RecordLogItem(card: good, log: buildLog(.good)),
            .easy: RecordLogItem(card: easy, log: buildLog(.easy)),
        ]
    }
}
