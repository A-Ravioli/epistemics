import SwiftUI
import PencilKit
import EpistemicsCore

extension Paper {
    static let lineSpacing: CGFloat = 52
    static let squareSize: CGFloat = 28
    static let dotSpacing: CGFloat = 28

    var accessibilityName: String {
        switch self {
        case .ruled: "Ruled paper"
        case .squared: "Squared paper"
        case .dotted: "Dotted paper"
        case .short: "Answer box"
        }
    }
}

/// The paper behind an ink area (§3): ruled, squared, dotted, or a plain short box.
struct PaperBackground: View {
    let paper: Paper
    var body: some View {
        Canvas { ctx, size in
            let rule = GraphicsContext.Shading.color(Theme.rule)
            switch paper {
            case .ruled:
                var y: CGFloat = 14 + Paper.lineSpacing
                while y < size.height {
                    ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)), with: rule)
                    y += Paper.lineSpacing
                }
            case .squared:
                var x: CGFloat = 0
                while x < size.width { ctx.fill(Path(CGRect(x: x, y: 0, width: 1, height: size.height)), with: rule); x += Paper.squareSize }
                var y: CGFloat = 0
                while y < size.height { ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)), with: rule); y += Paper.squareSize }
            case .dotted:
                let dot = GraphicsContext.Shading.color(Theme.rule.opacity(1.8))
                var y = Paper.dotSpacing / 2
                while y < size.height {
                    var x = Paper.dotSpacing / 2
                    while x < size.width {
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 1.2, y: y - 1.2, width: 2.4, height: 2.4)), with: dot)
                        x += Paper.dotSpacing
                    }
                    y += Paper.dotSpacing
                }
            case .short:
                break
            }
        }
        .accessibilityHidden(true)
    }
}

/// One ink area: paper, the canvas, and the tutor's marks on top. Grows with the ink.
struct InkArea: View {
    @Bindable var area: InkAreaModel
    var tools: InkToolState
    var allowsFingerDrawing = false
    var accessibilityReading: String? = nil

    var body: some View {
        ZStack(alignment: .topLeading) {
            PaperBackground(paper: area.paper)
            InkCanvas(area: area, tools: tools, allowsFingerDrawing: allowsFingerDrawing)
            MarkLayer(marks: area.marks)
                .allowsHitTesting(false)
        }
        .frame(height: area.height)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.rule.opacity(0.6), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .animation(.easeOut(duration: 0.18), value: area.height)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(area.paper.accessibilityName)
        .accessibilityValue(accessibilityReading.map { "Your answer, read as: \($0)" } ?? (area.isEmpty ? "Empty" : "Written"))
    }
}

/// A finished ink area shown read-only (the notebook, earlier turns, previous attempts).
struct InkSnapshot: View {
    let drawing: PKDrawing
    let paper: Paper
    var marks: [InkMark] = []
    var maxHeight: CGFloat? = nil
    var showsPaper = true

    var body: some View {
        let bounds = drawing.strokes.isEmpty ? CGRect(x: 0, y: 0, width: 300, height: 60) : drawing.bounds
        let height = max(60, bounds.maxY + 16)
        GeometryReader { geo in
            let scale = maxHeight.map { min(1, $0 / height, geo.size.width / max(bounds.maxX + 16, 1)) } ?? 1
            ZStack(alignment: .topLeading) {
                if showsPaper { PaperBackground(paper: paper) }
                DrawingImage(drawing: drawing, size: CGSize(width: max(bounds.maxX + 16, geo.size.width / scale), height: height))
                    .scaleEffect(scale, anchor: .topLeading)
                MarkLayer(marks: marks)
                    .scaleEffect(scale, anchor: .topLeading)
            }
        }
        .frame(height: min(height, maxHeight ?? height))
        .accessibilityHidden(true)
    }
}

/// Renders a drawing as an image in the current appearance (PencilKit adapts black ink to dark mode).
struct DrawingImage: View {
    let drawing: PKDrawing
    let size: CGSize
    @Environment(\.displayScale) private var displayScale
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let traits = UITraitCollection(userInterfaceStyle: colorScheme == .dark ? .dark : .light)
        var image = UIImage()
        traits.performAsCurrent {
            image = drawing.image(from: CGRect(origin: .zero, size: size), scale: displayScale)
        }
        return Image(uiImage: image)
            .resizable()
            .frame(width: size.width, height: size.height)
    }
}
