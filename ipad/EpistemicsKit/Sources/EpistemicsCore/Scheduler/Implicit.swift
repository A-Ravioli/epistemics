// Implicit credit, FIRe-lite (DESIGN §5.6; implicit.ts).
//
// When the learner passes an unaided item on concept B, every concept A with an encompassing edge
// `B → A (w)` gets a synthetic partial review on its Review-state cards with R < 0.97:
// stability += w × (S'_good − S), due re-derived from the new stability. Difficulty, reps and the
// last real review time are untouched, so the optimizer's replay of real reviews stays valid.

public let IMPLICIT_MAX_WEIGHT = 0.5
public let IMPLICIT_MAX_RETRIEVABILITY = 0.97

public struct ImplicitCreditInput {
    public var passedConceptId: String
    public var edges: [ConceptEdge]
    public var cardsByConcept: [String: [Card]]
    public var now: EpochMs
    public var scheduler: Scheduler
    public init(passedConceptId: String, edges: [ConceptEdge], cardsByConcept: [String: [Card]], now: EpochMs, scheduler: Scheduler) {
        self.passedConceptId = passedConceptId; self.edges = edges; self.cardsByConcept = cardsByConcept; self.now = now; self.scheduler = scheduler
    }
}

/// Encompassing edges leaving `conceptId`, weights clamped to [0, 0.5]; zero-weight edges dropped.
public func encompassedBy(_ conceptId: String, _ edges: [ConceptEdge]) -> [(conceptId: String, weight: Double)] {
    var out = JSMap<String, Double>()
    for e in edges {
        guard e.kind == .encompasses, e.from == conceptId, let weight = e.weight else { continue }
        let w = jsMin(IMPLICIT_MAX_WEIGHT, jsMax(0, weight))
        if !(w > 0) { continue }
        out[e.to] = jsMax(out[e.to] ?? 0, w)
    }
    return out.entries.map { ($0.0, $0.1) }
}

public func implicitCredit(_ input: ImplicitCreditInput) -> [RatingOutcome] {
    let s = input.scheduler, now = input.now
    var results: [RatingOutcome] = []
    for (conceptId, weight) in encompassedBy(input.passedConceptId, input.edges) {
        for card in input.cardsByConcept[conceptId] ?? [] {
            if card.state != .review || card.suspended { continue }
            let r = s.retrievability(card, now)
            if r >= IMPLICIT_MAX_RETRIEVABILITY { continue }

            let sGood = s.previewRatings(card, now)[.good]!.card.stability
            let stability = jsMax(card.stability, card.stability + weight * (sGood - card.stability))
            if stability == card.stability { continue }

            let interval = s.intervalForStability(stability)
            let anchor = card.lastReview ?? now
            let due = max(card.due, anchor + interval * dayMs)

            var next = card
            next.stability = stability
            next.due = due
            next.scheduledDays = interval
            let log = ReviewLogEntry(
                id: uuidv7(now), cardId: card.id, courseId: card.courseId, reviewTime: now, rating: .good, stateBefore: card.state,
                elapsedDays: card.lastReview.map { max(0, daysBetween($0, now)) } ?? 0, scheduledDays: interval,
                stability: stability, difficulty: card.difficulty, source: .implicit, assisted: false)
            results.append(RatingOutcome(card: next, log: log))
        }
    }
    return results
}
