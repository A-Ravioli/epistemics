import Foundation
import PencilKit

/// PencilKit's on-device handwriting recogniser (iPadOS 27): an instant, offline draft reading, and the
/// stroke search that places tutor marks on the words they point at (DESIGN §5.1 step 2, §5.5).
/// It reads text only; it has no maths support and no confidence scores.
actor OnDeviceReader {
    private let recognizer = PKStrokeRecognizer()

    /// The recogniser's reading of the whole drawing, or "" when it reads nothing.
    func read(_ drawing: PKDrawing) async -> String {
        guard !drawing.strokes.isEmpty else { return "" }
        await recognizer.updateDrawing(drawing)
        return (await recognizer.recognizedText() ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Where in the drawing a quote was written: the union of the matched strokes' bounds.
    /// Tries the whole quote, then its longest run of matching words, then its single longest word.
    func locate(_ quote: String, in drawing: PKDrawing) async -> CGRect? {
        let q = quote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !drawing.strokes.isEmpty else { return nil }
        await recognizer.updateDrawing(drawing)
        if let hit = await recognizer.search(q).first { return hit.bounds }
        let words = q.split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { $0.count > 1 }
        var rects: [CGRect] = []
        for w in words {
            if let hit = await recognizer.search(w).first { rects.append(hit.bounds) }
        }
        guard let first = rects.first else { return nil }
        return rects.dropFirst().reduce(first) { $0.union($1) }
    }
}

// SearchResult is a set of stroke ids and a rect; the SDK just doesn't mark it Sendable yet.
extension PKStrokeRecognizer.SearchResult: @unchecked @retroactive Sendable {}
