import Foundation
import PencilKit
import EpistemicsCore

/// Turns a grade's criterion evidence into blue marks on the learner's strokes (DESIGN §5.1 step 6, §5.5).
enum MarkPlacement {
    /// One numbered mark per rubric criterion that was met and has evidence the recogniser can find, plus the
    /// first wrong line of the working when the grader found one.
    @MainActor
    static func receiptMarks(grade: GradeResult, rubric: [RubricCriterion], drawing: PKDrawing, reading: ReadingService) async -> [InkMark] {
        var marks: [InkMark] = []
        if let mark = await firstErrorMark(grade, drawing: drawing, reading: reading) { marks.append(mark) }
        var used: [CGRect] = []
        for (index, criterion) in rubric.enumerated() {
            guard let result = grade.criteria.first(where: { $0.id == criterion.id }), result.met,
                  !result.evidence.trimmingCharacters(in: .whitespaces).isEmpty,
                  let rect = await reading.locate(result.evidence, in: drawing) else { continue }
            // Two criteria citing the same words share one loop; the second just gets its number.
            let duplicate = used.contains { $0.intersection(rect).area > rect.area * 0.7 }
            marks.append(InkMark(kind: duplicate ? .tick(rect) : .numbered(index + 1, rect)))
            used.append(rect)
        }
        return marks
    }

    /// The wavy underline on the first wrong line (docs/AUDIT.md #1), if the recogniser can find its words.
    @MainActor
    static func firstErrorMark(_ grade: GradeResult, drawing: PKDrawing, reading: ReadingService) async -> InkMark? {
        guard let e = grade.firstError, let rect = await reading.locate(e.quote, in: drawing) else { return nil }
        return InkMark(kind: .wrongStep(rect))
    }

    /// The single mark the observer chose for a dialogue turn, if the recogniser can find its words.
    @MainActor
    static func turnMark(quote: String, note: String?, drawing: PKDrawing, reading: ReadingService) async -> InkMark? {
        guard let rect = await reading.locate(quote, in: drawing) else { return nil }
        return InkMark(kind: .circle(rect), note: note)
    }
}

private extension CGRect {
    var area: CGFloat { isNull ? 0 : width * height }
}

extension Store {
    func saveMarks(inkId: String, _ marks: [InkMark]) throws { try setSetting("marks:\(inkId)", marks) }
    func marks(inkId: String) throws -> [InkMark] { try setting("marks:\(inkId)", as: [InkMark].self) ?? [] }
}
