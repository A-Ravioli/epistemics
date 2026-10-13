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
///
/// The paper has a fixed logical width (`logicalWidth`, the reading width by default) and is drawn scaled
/// to fit the space it is given, never reflowed: strokes, marks and readings are all in paper coordinates,
/// so rotating the iPad or opening Split View must not move them (UX-AUDIT §2). Squared and dotted paper,
/// the paper for working, start as tall as the page offers (`paperFillHeight`).
struct InkArea: View {
    @Bindable var area: InkAreaModel
    var tools: InkToolState
    var allowsFingerDrawing = false
    var accessibilityReading: String? = nil
    var logicalWidth: CGFloat = Theme.readingWidth

    @Environment(\.paperFillHeight) private var fill
    @Environment(\.inkAsImage) private var inkAsImage
    @State private var available: CGFloat = Theme.readingWidth

    private var scale: CGFloat { max(0.5, min(1, available / logicalWidth)) }
    private var logicalHeight: CGFloat {
        let fills = area.paper == .squared || area.paper == .dotted
        return max(area.height, fills && fill > 0 ? fill / scale : 0)
    }

    var body: some View {
        let size = CGSize(width: logicalWidth, height: logicalHeight)
        // A clear strip takes exactly the width offered (it never asks for more), measures it, and carries
        // the paper, drawn at the fixed logical width and scaled to fit, as an overlay.
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: size.height * scale)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { available = $0 }
            .overlay(alignment: .topLeading) {
                ZStack(alignment: .topLeading) {
                    PaperBackground(paper: area.paper)
                        .frame(width: size.width, height: size.height)
                        .scaleEffect(scale, anchor: .topLeading)
                    if inkAsImage {
                        DrawingImage(drawing: area.drawing, size: size)
                            .scaleEffect(scale, anchor: .topLeading)
                            .frame(width: size.width * scale, height: size.height * scale, alignment: .topLeading)
                    } else {
                        InkCanvas(area: area, tools: tools, allowsFingerDrawing: allowsFingerDrawing, zoom: scale, logicalSize: size)
                            .frame(width: size.width * scale, height: size.height * scale)
                    }
                    MarkLayer(marks: area.marks)
                        .frame(width: size.width, height: size.height, alignment: .topLeading)
                        .scaleEffect(scale, anchor: .topLeading)
                        .allowsHitTesting(false)
                }
                .frame(width: size.width * scale, height: size.height * scale, alignment: .topLeading)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.sheet))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.rule.opacity(0.6), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
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

extension EnvironmentValues {
    /// Draw live ink areas' ink as an image instead of a PencilKit canvas. Only for rendering screenshots: the
    /// canvas draws on the GPU, which a view snapshot doesn't reliably capture.
    @Entry var inkAsImage = false
}
