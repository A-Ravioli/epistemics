import Foundation
import EpistemicsCore

/// Progress checks (ipad docs/AUDIT.md #4; EpistemicsCore Session/ProgressCheck.swift): a short, mixed,
/// unaided test over what has been learned or placed out of, every few lessons or weeks. Stored as a
/// `.diagnostic` session with `summary.kind == "progress"`, next to the placement's.
extension CourseService {
    static let progressKind = "progress"

    struct ProgressCheckPlan {
        var due: Bool
        var questions: [ProgressCheckQuestion]
    }

    func lastProgressCheck() async throws -> Session? {
        try await store.sessions(course: course.id, type: .diagnostic)
            .filter { $0.endedAt != nil && $0.summary?["kind"] == .string(Self.progressKind) }
            .max { ($0.endedAt ?? 0) < ($1.endedAt ?? 0) }
    }

    /// "Not today": the offer comes back tomorrow.
    func postponeProgressCheck() async { try? await store.setSetting("progressLater:\(course.id)", studyDayKey()) }
    private func progressCheckPostponedToday() async -> Bool {
        (try? await store.setting("progressLater:\(course.id)", as: String.self)) == studyDayKey()
    }

    func progressCheckPlan() async throws -> ProgressCheckPlan {
        let n = now
        let states = try await store.conceptStates(course: course.id)
        let cards = try await store.cards(course: course.id).filter { Self.isActivated($0, now: n) && !$0.suspended && $0.state != .new }
        let items = itemIndex()
        // Questions that a blind grader marks and that fit on a page: not self-graded, not maps or teach-backs.
        let askable: Set<ItemType> = [.apply, .explain, .discriminate, .sketch]
        var candidates: [ProgressCheckCandidate] = []
        for (conceptId, mine) in Dictionary(grouping: cards, by: \.conceptId) {
            guard let s = states[conceptId], s.successfulSessions >= 1 else { continue }
            // The card whose skill was looked at longest ago, preferring apply and explain items.
            let usable = mine.filter { items[$0.itemId].map { askable.contains($0.type) } == true }
            guard let card = usable.min(by: { a, b in
                let ta = items[a.itemId]!.type, tb = items[b.itemId]!.type
                let pa = [.apply, .explain].contains(ta) ? 0 : 1, pb = [.apply, .explain].contains(tb) ? 0 : 1
                if pa != pb { return pa < pb }
                return (a.lastReview ?? 0) < (b.lastReview ?? 0)
            }) else { continue }
            candidates.append(ProgressCheckCandidate(conceptId: conceptId, itemId: card.itemId,
                                                     provisional: mine.contains(where: \.provisional),
                                                     mastery: s.mastery, mixedN: s.mixedN ?? 0))
        }
        let last = try await lastProgressCheck()
        let since = last?.endedAt ?? course.createdAt
        let lessons = try await store.sessions(course: course.id, type: .lesson).filter {
            ($0.endedAt ?? 0) > since && $0.lessonId.map { !$0.hasPrefix(LessonService.remediationPrefix) } == true
                && $0.summary?["remediation"]?.boolValue != true
        }.count
        let days = max(0, (n - since) / 86_400_000)
        let due = !(await progressCheckPostponedToday())
            && progressCheckDue(lessonsSinceLast: lessons, daysSinceLast: days, eligibleConcepts: candidates.count,
                                hasProvisional: candidates.contains(where: \.provisional))
        return ProgressCheckPlan(due: due, questions: selectProgressCheck(ctx.curriculum, candidates))
    }

    /// One progress-check answer: a real review of the card (it is a retrieval like any other) and mixed
    /// evidence for the concept. A wrong answer sends the concept back (`demote`); a right answer given as a
    /// guess counts as Hard, which is not a pass but is not a reason to reteach either.
    func applyProgressCheckAnswer(card: Card, rating: Rating, wrong: Bool, confidence: Confidence?, durationMs: Int?,
                                  receipt: ReceiptInput) async throws -> AppliedReview {
        let applied = try await applyReview(card: card, rating: rating, source: .diagnostic, assisted: false, confidence: confidence,
                                            durationMs: durationMs, receipt: receipt)
        if wrong { try await demote(card.conceptId) }
        return applied
    }
}
