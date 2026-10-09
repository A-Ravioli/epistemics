import Foundation
import PencilKit
import os

/// PencilKit's on-device handwriting recogniser (iPadOS 27): an instant, offline draft reading, and the
/// stroke search that places tutor marks on the words they point at (DESIGN §5.1 step 2, §5.5).
/// It reads text only; it has no maths support and no confidence scores.
///
/// Every call is bounded: a draft that has not arrived in time is treated as "nothing read" rather than
/// leaving the learner looking at a spinner. The Reader (or the learner's confirmation) still follows.
actor OnDeviceReader {
    private static let log = Logger(subsystem: "app.epistemics.ipad", category: "OnDeviceReader")
    static let timeout: Duration = .seconds(6)
    /// Reads that answered, and reads that ran out of time (for tests and diagnostics).
    private(set) var answered = 0
    private(set) var timedOut = 0

    /// The recogniser's reading of the whole drawing, or "" when it reads nothing (or not in time).
    func read(_ drawing: PKDrawing) async -> String {
        guard !drawing.strokes.isEmpty else { return "" }
        let started = ContinuousClock.now
        let text = await Self.bounded {
            let recognizer = PKStrokeRecognizer()
            await recognizer.updateDrawing(Self.plain(drawing))
            return await recognizer.recognizedText()
        }
        if text == nil { timedOut += 1 } else { answered += 1 }
        Self.log.info("read \(drawing.strokes.count) strokes in \(ContinuousClock.now - started): \(text == nil ? "timed out" : "ok")")
        return (text ?? nil)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    /// Where in the drawing a quote was written: the union of the matched strokes' bounds.
    /// Tries the whole quote, then each of its words.
    func locate(_ quote: String, in drawing: PKDrawing) async -> CGRect? {
        let q = quote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !drawing.strokes.isEmpty else { return nil }
        let found = await Self.bounded { () -> CGRect? in
            let recognizer = PKStrokeRecognizer()
            await recognizer.updateDrawing(Self.plain(drawing))
            if let hit = await recognizer.search(q).first { return hit.bounds }
            let words = q.split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { $0.count > 1 }
            var rects: [CGRect] = []
            for w in words {
                if let hit = await recognizer.search(w).first { rects.append(hit.bounds) }
            }
            guard let first = rects.first else { return nil }
            return rects.dropFirst().reduce(first) { $0.union($1) }
        }
        return found ?? nil
    }

    /// A copy of the drawing's strokes with no tie to a live canvas, so the recogniser works on a snapshot.
    private static func plain(_ drawing: PKDrawing) -> PKDrawing {
        PKDrawing(strokes: drawing.strokes.map { PKStroke(ink: $0.ink, path: $0.path, transform: $0.transform, mask: $0.mask) })
    }

    /// Runs `work`, returning nil if it takes longer than `timeout`.
    /// A task group would wait for a hung child, so the work runs unstructured and the first to finish wins.
    private static func bounded<T: Sendable>(_ work: @escaping @Sendable () async -> T) async -> T? {
        let once = Once<T?>()
        return await withCheckedContinuation { continuation in
            Task { let v = await work(); await once.resume(continuation, with: v) }
            Task { try? await Task.sleep(for: timeout); await once.resume(continuation, with: nil) }
        }
    }
}

/// Resumes a continuation exactly once.
private actor Once<T: Sendable> {
    private var done = false
    func resume(_ c: CheckedContinuation<T, Never>, with value: T) {
        guard !done else { return }
        done = true
        c.resume(returning: value)
    }
}

// SearchResult is a set of stroke ids and a rect; the SDK just doesn't mark it Sendable yet.
extension PKStrokeRecognizer.SearchResult: @unchecked @retroactive Sendable {}
