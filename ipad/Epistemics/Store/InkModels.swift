import Foundation
import CoreGraphics
import EpistemicsCore

/// What an ink area belongs to.
enum InkOwner: String, Codable, Sendable {
    case firstRun, warmup, review, lessonTurn, lessonSummary, checkpoint, map, teachback
}

/// One ink area as stored: the PencilKit drawing is the source of truth; everything else is derived.
/// Table `ink` (ipad/docs/DESIGN.md §13.2).
struct InkRecord: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var courseId: String
    var ownerKind: InkOwner
    /// Session (or turn) the ink was written in.
    var ownerId: String
    var itemId: String?
    var paper: Paper
    /// `PKDrawing.dataRepresentation()`. Stored in its own column, not in the JSON.
    var drawing: Data
    var width: Double
    var height: Double
    var strokeCount: Int
    /// Time spent with the Pencil down, and time before the first stroke (DESIGN §9).
    var writingMs: Int
    var firstStrokeMs: Int?
    var createdAt: EpochMs
    var updatedAt: EpochMs

    enum CodingKeys: String, CodingKey {
        case id, courseId, ownerKind, ownerId, itemId, paper, width, height, strokeCount, writingMs, firstStrokeMs, createdAt, updatedAt
    }

    init(id: String, courseId: String, ownerKind: InkOwner, ownerId: String, itemId: String?, paper: Paper, drawing: Data,
         width: Double, height: Double, strokeCount: Int, writingMs: Int, firstStrokeMs: Int?, createdAt: EpochMs, updatedAt: EpochMs) {
        self.id = id; self.courseId = courseId; self.ownerKind = ownerKind; self.ownerId = ownerId; self.itemId = itemId
        self.paper = paper; self.drawing = drawing; self.width = width; self.height = height; self.strokeCount = strokeCount
        self.writingMs = writingMs; self.firstStrokeMs = firstStrokeMs; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        courseId = try c.decode(String.self, forKey: .courseId)
        ownerKind = try c.decode(InkOwner.self, forKey: .ownerKind)
        ownerId = try c.decode(String.self, forKey: .ownerId)
        itemId = try c.decodeIfPresent(String.self, forKey: .itemId)
        paper = try c.decode(Paper.self, forKey: .paper)
        width = try c.decode(Double.self, forKey: .width)
        height = try c.decode(Double.self, forKey: .height)
        strokeCount = try c.decode(Int.self, forKey: .strokeCount)
        writingMs = try c.decode(Int.self, forKey: .writingMs)
        firstStrokeMs = try c.decodeIfPresent(Int.self, forKey: .firstStrokeMs)
        createdAt = try c.decode(EpochMs.self, forKey: .createdAt)
        updatedAt = try c.decode(EpochMs.self, forKey: .updatedAt)
        drawing = Data()
    }
}

/// A drawn diagram as the Reader describes it: nodes and edges (maps, sketches).
struct InkDiagram: Codable, Sendable, Hashable {
    struct Node: Codable, Sendable, Hashable { var id: String; var label: String }
    struct Edge: Codable, Sendable, Hashable { var from: String; var to: String; var label: String? }
    var nodes: [Node]
    var edges: [Edge]
}

struct UncertainSpan: Codable, Sendable, Hashable {
    var span: String
    var alternatives: [String]
}

/// A reading of one ink area (DESIGN §5.1). `confirmedText` is what the grader sees.
struct InkReading: Codable, Sendable, Hashable, Identifiable {
    enum Source: String, Codable, Sendable { case onDevice, reader, demo, typed }
    var id: String
    var inkId: String
    var source: Source
    var model: String?
    var text: String
    var boxed: String?
    var diagram: InkDiagram?
    var crossedOut: [String]
    var uncertain: [UncertainSpan]
    /// The on-device draft, kept for the receipt's audit trail.
    var draft: String?
    var confirmedText: String?
    var confirmedAt: EpochMs?
    var createdAt: EpochMs

    /// What grading uses: the confirmed text if the learner confirmed, else the reading.
    var gradedText: String { confirmedText ?? text }
    /// The answer to compare against an exact reference: the boxed answer, else the last line.
    var finalAnswer: String {
        if let boxed, !boxed.isEmpty { return boxed }
        return gradedText.split(whereSeparator: \.isNewline).last.map(String.init) ?? gradedText
    }
}
