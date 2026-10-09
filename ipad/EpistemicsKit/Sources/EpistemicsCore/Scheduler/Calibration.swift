// Confidence calibration (DESIGN §6.3): Brier score and over/underconfidence bias. calibration.ts.

/// Predicted probability of being correct for each confidence level (guess / fairly sure / certain).
public let CONFIDENCE_PROBABILITY: [Confidence: Double] = [.guess: 0.33, .fairlySure: 0.67, .certain: 0.95]

public extension Confidence {
    var probability: Double { CONFIDENCE_PROBABILITY[self]! }
}

public struct CalibrationPair: Codable, Sendable, Hashable {
    public var confidence: Confidence
    public var correct: Bool
    public init(confidence: Confidence, correct: Bool) { self.confidence = confidence; self.correct = correct }
}

public struct CalibrationSummary: Codable, Sendable, Hashable {
    /// Mean squared error between predicted probability and outcome; 0 is perfect.
    public var brier: Double
    /// mean(predicted) − mean(observed). Positive → overconfident.
    public var overconfidenceBias: Double
    public var n: Int
}

public func brierScore(_ pairs: [CalibrationPair]) -> CalibrationSummary {
    let n = pairs.count
    if n == 0 { return CalibrationSummary(brier: 0, overconfidenceBias: 0, n: 0) }
    var se = 0.0, sumP = 0.0, sumO = 0.0
    for p in pairs {
        let prob = p.confidence.probability
        let o = p.correct ? 1.0 : 0.0
        se += (prob - o) * (prob - o)
        sumP += prob
        sumO += o
    }
    return CalibrationSummary(brier: se / Double(n), overconfidenceBias: (sumP - sumO) / Double(n), n: n)
}

public struct CalibrationBin: Codable, Sendable, Hashable {
    public var confidence: Confidence
    public var predicted: Double
    public var n: Int
    /// Observed accuracy within the bin (0 when empty).
    public var observed: Double
    /// predicted − observed; positive → overconfident at this level.
    public var gap: Double
}

/// One bin per confidence level, for the calibration chart.
public func calibrationBins(_ pairs: [CalibrationPair]) -> [CalibrationBin] {
    Confidence.allCases.map { c in
        let inBin = pairs.filter { $0.confidence == c }
        let n = inBin.count
        let hits = inBin.filter(\.correct).count
        let predicted = c.probability
        let observed = n == 0 ? 0 : Double(hits) / Double(n)
        return CalibrationBin(confidence: c, predicted: predicted, n: n, observed: observed, gap: n == 0 ? 0 : predicted - observed)
    }
}
