import SwiftUI
import PencilKit
import EpistemicsCore

/// The learner's tools. No colours, widths, rulers or highlighters (DESIGN §3).
enum InkTool: String, CaseIterable, Sendable {
    case pen, eraser, lasso

    var pkTool: PKTool {
        switch self {
        case .pen: PKInkingTool(.pen, color: Theme.inkUIColor, width: 2.6)
        case .eraser: PKEraserTool(.vector)
        case .lasso: PKLassoTool()
        }
    }
}

/// Tool state shared by the tray and whichever ink area is live.
@Observable @MainActor
final class InkToolState {
    var tool: InkTool = .pen
    /// Bumped to ask the live canvas to undo / redo.
    var undoRequests = 0
    var redoRequests = 0
}

/// One ink area's drawing plus the timing the observer gets (DESIGN §9). Owned by a session view model.
@Observable @MainActor
final class InkAreaModel: Identifiable {
    let id: String
    let paper: Paper
    let minHeight: CGFloat
    var drawing = PKDrawing()
    var isEditable = true
    /// Tutor marks drawn over this ink (DESIGN §5.5).
    var marks: [InkMark] = []

    let openedAt = Date()
    private(set) var firstStrokeAt: Date?
    private(set) var lastStrokeEndedAt: Date?
    private(set) var writingTime: TimeInterval = 0
    private var strokeBeganAt: Date?
    /// Bumped on every change, so speculative reads can tell whether the ink moved on (DESIGN §5.2).
    private(set) var revision = 0

    init(id: String = UUID().uuidString, paper: Paper, minHeight: CGFloat? = nil, drawing: PKDrawing = PKDrawing()) {
        self.id = id
        self.paper = paper
        self.minHeight = minHeight ?? InkAreaModel.defaultHeight(for: paper)
        self.drawing = drawing
    }

    static func defaultHeight(for paper: Paper, lines: Int? = nil) -> CGFloat {
        switch paper {
        case .short: 96
        case .ruled: CGFloat(max(3, lines ?? 3)) * Paper.lineSpacing + 40
        case .squared: CGFloat(max(8, lines ?? 8)) * Paper.squareSize + 12
        case .dotted: 420
        }
    }

    var isEmpty: Bool { drawing.strokes.isEmpty }
    var firstStrokeMs: Int? { firstStrokeAt.map { Int($0.timeIntervalSince(openedAt) * 1000) } }
    var writingMs: Int { Int(writingTime * 1000) }

    /// The ink area grows as the learner writes near its bottom edge (§3).
    var height: CGFloat {
        let used = drawing.strokes.isEmpty ? 0 : drawing.bounds.maxY
        let grow: CGFloat = paper == .short ? 24 : 120
        return max(minHeight, used + grow)
    }

    func strokeBegan() {
        let now = Date()
        if firstStrokeAt == nil { firstStrokeAt = now }
        strokeBeganAt = now
    }

    func strokeEnded() {
        let now = Date()
        if let began = strokeBeganAt { writingTime += now.timeIntervalSince(began) }
        strokeBeganAt = nil
        lastStrokeEndedAt = now
    }

    func drawingChanged(_ d: PKDrawing) {
        drawing = d
        revision += 1
    }

    func reset() {
        drawing = PKDrawing()
        marks = []
        revision += 1
    }
}

/// PencilKit canvas: Pencil only (rule 1), transparent over the paper, never scrolls itself so a finger
/// scrolls the page.
struct InkCanvas: UIViewRepresentable {
    @Bindable var area: InkAreaModel
    var tools: InkToolState
    var allowsFingerDrawing: Bool
    /// On-screen scale of the paper; the drawing stays in paper coordinates (InkArea).
    var zoom: CGFloat = 1
    var logicalSize: CGSize = .zero

    func makeCoordinator() -> Coordinator { Coordinator(area: area) }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.isScrollEnabled = false
        canvas.contentInset = .zero
        canvas.bouncesZoom = false
        canvas.showsVerticalScrollIndicator = false
        canvas.showsHorizontalScrollIndicator = false
        Self.applyZoom(canvas, zoom, logicalSize)
        canvas.drawing = area.drawing
        canvas.delegate = context.coordinator
        canvas.tool = tools.tool.pkTool
        canvas.drawingPolicy = Self.policy(allowsFingerDrawing)
        canvas.isUserInteractionEnabled = area.isEditable
        canvas.accessibilityLabel = "Your answer"
        context.coordinator.canvas = canvas
        context.coordinator.seenUndo = tools.undoRequests
        context.coordinator.seenRedo = tools.redoRequests
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        let c = context.coordinator
        c.area = area
        Self.applyZoom(canvas, zoom, logicalSize)
        canvas.drawingPolicy = Self.policy(allowsFingerDrawing)
        canvas.isUserInteractionEnabled = area.isEditable
        if area.isEditable {
            canvas.tool = tools.tool.pkTool
        }
        if canvas.drawing != area.drawing {
            canvas.drawing = area.drawing
        }
        if tools.undoRequests != c.seenUndo {
            c.seenUndo = tools.undoRequests
            if area.isEditable { canvas.undoManager?.undo() }
        }
        if tools.redoRequests != c.seenRedo {
            c.seenRedo = tools.redoRequests
            if area.isEditable { canvas.undoManager?.redo() }
        }
    }

    /// A fixed zoom: the canvas shows paper coordinates at `zoom`, and a learner can't pinch it.
    static func applyZoom(_ canvas: PKCanvasView, _ zoom: CGFloat, _ logical: CGSize) {
        if canvas.minimumZoomScale != zoom || canvas.maximumZoomScale != zoom {
            canvas.minimumZoomScale = min(canvas.minimumZoomScale, zoom)
            canvas.maximumZoomScale = max(canvas.maximumZoomScale, zoom)
            canvas.zoomScale = zoom
            canvas.minimumZoomScale = zoom
            canvas.maximumZoomScale = zoom
        }
        if logical != .zero {
            let content = CGSize(width: logical.width * zoom, height: logical.height * zoom)
            if canvas.contentSize != content { canvas.contentSize = content }
        }
        if canvas.contentOffset != .zero { canvas.contentOffset = .zero }
    }

    /// The simulator has no Pencil, so a pointer has to be able to draw there.
    static func policy(_ allowsFinger: Bool) -> PKCanvasViewDrawingPolicy {
        #if targetEnvironment(simulator)
        return .anyInput
        #else
        return allowsFinger ? .anyInput : .pencilOnly
        #endif
    }

    @MainActor
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var area: InkAreaModel
        weak var canvas: PKCanvasView?
        var seenUndo = 0
        var seenRedo = 0

        init(area: InkAreaModel) { self.area = area }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            if canvasView.drawing != area.drawing { area.drawingChanged(canvasView.drawing) }
        }

        func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) { area.strokeBegan() }

        func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) { area.strokeEnded() }
    }
}
