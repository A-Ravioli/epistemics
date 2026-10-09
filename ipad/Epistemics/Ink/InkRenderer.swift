import UIKit
import PencilKit

/// Renders ink for the Reader: upright, cropped to the ink, black on a clean white background (DESIGN §5.1).
enum InkRenderer {
    /// PNG of the drawing, always in light appearance so ink is black whatever the device theme.
    static func png(_ drawing: PKDrawing, padding: CGFloat = 24, maxDimension: CGFloat = 1800) -> Data? {
        guard !drawing.strokes.isEmpty else { return nil }
        let bounds = drawing.bounds.insetBy(dx: -padding, dy: -padding)
        // Keep the long side within what the vision model reads well, but never upscale.
        let scale = min(2, maxDimension / max(bounds.width, bounds.height))
        var inkImage = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            inkImage = drawing.image(from: bounds, scale: scale)
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: bounds.size, format: format)
        let image = renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: bounds.size))
            inkImage.draw(in: CGRect(origin: .zero, size: bounds.size))
        }
        return image.pngData()
    }

    /// Offset applied by `png`: a point in the image + this = a point in the drawing.
    static func imageOrigin(_ drawing: PKDrawing, padding: CGFloat = 24) -> CGPoint {
        let b = drawing.bounds.insetBy(dx: -padding, dy: -padding)
        return b.origin
    }
}
