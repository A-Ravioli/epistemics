// Grade → rating mapping (DESIGN §6.2) and confidence adjustment (DESIGN §3.4). rating.ts.

/// A rating of Good or Easy counts as a successful retrieval. Hard is a pass for FSRS but not "correct" here.
public func isCorrect(_ rating: Rating) -> Bool { rating.rawValue >= 3 }

/// `score < 0.4 → Again`, `0.4-0.75 → Hard`, `0.75-0.95 → Good`, `≥ 0.95 && confidence ≥ 0.8 → Easy`.
/// A score ≥ 0.95 with a less confident grader is Good, never Easy.
public func ratingFromGrade(_ score: Double, _ graderConfidence: Double) -> Rating {
    if !score.isFinite { return .again }
    if score < 0.4 { return .again }
    if score < 0.75 { return .hard }
    if score < 0.95 { return .good }
    return graderConfidence >= 0.8 ? .easy : .good
}

/// Consensus deferral: draw more grader samples when the grader is unsure or the score sits within
/// `margin` of a rating boundary.
public func needsConsensus(_ score: Double, _ graderConfidence: Double, margin: Double = 0.05) -> Bool {
    if graderConfidence < 0.7 { return true }
    return [0.4, 0.75, 0.95].contains { abs(score - $0) <= margin }
}

/// High-confidence wrong → Again and flagged hypercorrection; low-confidence right → Hard ("lucky");
/// otherwise unchanged. Confidence never inflates a rating.
public func adjustRatingForConfidence(_ rating: Rating, _ confidence: Confidence, _ correct: Bool) -> (rating: Rating, hypercorrection: Bool) {
    if !correct && confidence == .certain { return (.again, true) }
    if correct && confidence == .guess { return (rating < .hard ? rating : .hard, false) }
    return (rating, false)
}
