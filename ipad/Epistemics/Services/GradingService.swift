import Foundation
import EpistemicsCore
import EpistemicsLLM

/// Blind-grading glue, ported from web/apps/web/src/lib/services/grading.ts: what to grade against, the
/// grader call, and the rating (score → rating, then the confidence adjustment).
struct GradeTarget: Sendable {
    var conceptId: String
    var itemType: ItemType
    var prompt: String
    var reference: GradeReference
    var rubric: [RubricCriterion]
    var misconceptions: [Misconception]
}

struct Graded: Sendable, Hashable {
    var grade: GradeResult
    /// Before the confidence adjustment.
    var rawRating: Rating
    var rating: Rating
    var hypercorrection: Bool
    var disagreement: Bool
}

enum GradingService {
    static let scriptRubric = [RubricCriterion(id: "c1", text: "Answer matches the reference answer in substance")]

    static func target(for item: Item, in curriculum: Curriculum) -> GradeTarget {
        let concept = curriculum.concept(item.conceptId)
        return GradeTarget(conceptId: item.conceptId, itemType: item.type, prompt: item.prompt,
                           reference: GradeReference(item.reference),
                           rubric: item.rubric.isEmpty ? scriptRubric : item.rubric,
                           misconceptions: concept?.misconceptions ?? [])
    }

    /// Script-backed lesson items have ids like `<conceptId>#pretest` (DESIGN §3.3).
    static func target(itemId: String, rubricSource: RubricSource, kind: LessonItemKind?, in curriculum: Curriculum) throws -> GradeTarget {
        if rubricSource == .item {
            guard let item = curriculum.item(itemId) else { throw ServiceError("Item not found: \(itemId)") }
            return target(for: item, in: curriculum)
        }
        let conceptId = itemId.split(separator: "#").first.map(String.init) ?? itemId
        guard let concept = curriculum.concept(conceptId) else { throw ServiceError("Concept not found: \(conceptId)") }
        let s = concept.script
        if rubricSource == .scriptTransfer {
            return GradeTarget(conceptId: conceptId, itemType: .apply, prompt: s.transfer.prompt,
                               reference: GradeReference(answer: s.transfer.reference), rubric: scriptRubric,
                               misconceptions: concept.misconceptions)
        }
        return GradeTarget(conceptId: conceptId, itemType: .apply, prompt: kind == .check ? s.pretest.isomorph : s.pretest.prompt,
                           reference: GradeReference(answer: s.pretest.reference), rubric: scriptRubric,
                           misconceptions: concept.misconceptions)
    }

    static func deriveRating(_ grade: GradeResult, confidence: Confidence?) -> (raw: Rating, rating: Rating, hypercorrection: Bool) {
        let raw = ratingFromGrade(grade.score, grade.confidence)
        guard let confidence else { return (raw, raw, false) }
        let adj = adjustRatingForConfidence(raw, confidence, isCorrect(raw))
        return (raw, adj.rating, adj.hypercorrection)
    }

    static func grade(_ provider: any LLMProvider, target: GradeTarget, answer: String, confidence: Confidence?,
                      samples: Int? = nil, metadata: RequestMetadata? = nil) async throws -> Graded {
        // Drawings are where graders are least reliable, so sketches defer to consensus more readily (DESIGN §7).
        let bar = target.itemType == .sketch ? 0.85 : Grader.consensusConfidence
        let out = try await Grader.grade(provider, GradeInput(
            prompt: target.prompt, reference: target.reference, rubric: target.rubric,
            answer: answer.isEmpty ? "(no answer)" : answer,
            misconceptions: target.misconceptions.map { .init(tag: $0.tag, description: $0.description) },
            samples: samples, consensusConfidence: bar, metadata: metadata))
        let r = deriveRating(out.grade, confidence: confidence)
        return Graded(grade: out.grade, rawRating: r.raw, rating: r.rating, hypercorrection: r.hypercorrection, disagreement: out.disagreement)
    }
}

struct ServiceError: Error, CustomStringConvertible {
    let description: String
    init(_ d: String) { description = d }
}
