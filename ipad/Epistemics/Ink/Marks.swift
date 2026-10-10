import SwiftUI

/// A tutor mark: blue, drawn by the app on a layer above the learner's strokes, never altering them (DESIGN §5.5).
struct InkMark: Identifiable, Hashable, Codable, Sendable {
    enum Kind: Hashable, Codable, Sendable {
        /// A loose loop around a region.
        case circle(CGRect)
        /// A tick beside a region.
        case tick(CGRect)
        /// A numbered dot tying a receipt criterion to its evidence, plus a loop around it.
        case numbered(Int, CGRect)
        /// A "?" beside a region (a link the curriculum does not draw; a doubtful reading).
        case query(CGRect)
        /// A dashed ghost of something missing, with its label (a missed concept on a map).
        case ghost(label: String, at: CGPoint)
        /// A dashed line from one point to another (a missed link on a map).
        case ghostLink(from: CGPoint, to: CGPoint)
        /// A line under a region.
        case underline(CGRect)
        /// A wavy line under the first wrong line of the working (step-level feedback, docs/AUDIT.md #1).
        case wrongStep(CGRect)
    }
    var id: String = UUID().uuidString
    var kind: Kind
    /// At most one short margin note per mark, never a question.
    var note: String?
}

struct MarkLayer: View {
    let marks: [InkMark]

    var body: some View {
        ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                for mark in marks { draw(mark, in: &ctx) }
            }
            ForEach(marks) { mark in
                if let note = mark.note, let anchor = noteAnchor(mark) {
                    Text(note)
                        .font(.margin)
                        .foregroundStyle(Theme.tutor)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(width: 200, alignment: .leading)
                        .offset(x: anchor.x, y: anchor.y)
                }
                if case .ghost(let label, let at) = mark.kind {
                    Text(label)
                        .font(.system(size: 19, design: .serif))
                        .foregroundStyle(Theme.tutor)
                        .fixedSize()
                        .offset(x: at.x - 4, y: at.y - 12)
                }
                if case .numbered(let n, let rect) = mark.kind {
                    Text("\(n)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Theme.tutor))
                        .offset(x: rect.maxX + 6, y: rect.minY - 10)
                }
                if case .query(let rect) = mark.kind {
                    Text("?")
                        .font(.system(size: 38, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.tutor)
                        .offset(x: rect.midX - 10, y: rect.midY - 24)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        let notes = marks.compactMap(\.note)
        return notes.isEmpty ? "" : "Tutor's note: " + notes.joined(separator: ". ")
    }

    private func noteAnchor(_ mark: InkMark) -> CGPoint? {
        switch mark.kind {
        case .circle(let r), .tick(let r), .underline(let r), .numbered(_, let r), .query(let r), .wrongStep(let r):
            return CGPoint(x: r.maxX + 18, y: r.maxY - 4)
        case .ghost, .ghostLink:
            return nil
        }
    }

    private func draw(_ mark: InkMark, in ctx: inout GraphicsContext) {
        let blue = GraphicsContext.Shading.color(Theme.tutor)
        let solid = StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round)
        let dashed = StrokeStyle(lineWidth: 2, lineCap: .round, dash: [7, 7])
        var rng = SeededJitter(seed: mark.id)
        switch mark.kind {
        case .circle(let r), .numbered(_, let r):
            ctx.stroke(loop(around: r.insetBy(dx: -10, dy: -8), rng: &rng), with: blue, style: solid)
        case .tick(let r):
            var p = Path()
            let o = CGPoint(x: r.maxX + 10, y: r.midY - 4)
            p.move(to: o)
            p.addLine(to: CGPoint(x: o.x + 6, y: o.y + 7))
            p.addLine(to: CGPoint(x: o.x + 18, y: o.y - 9))
            ctx.stroke(p, with: blue, style: solid)
        case .underline(let r):
            var p = Path()
            p.move(to: CGPoint(x: r.minX - 2, y: r.maxY + 4))
            p.addQuadCurve(to: CGPoint(x: r.maxX + 2, y: r.maxY + 2 + rng.next(2)),
                           control: CGPoint(x: r.midX, y: r.maxY + 6 + rng.next(3)))
            ctx.stroke(p, with: blue, style: solid)
        case .wrongStep(let r):
            // A hand-drawn wave under the line, then a short bar at its start so it reads as "from here".
            var p = Path()
            let y = r.maxY + 6
            let start = r.minX - 4, end = r.maxX + 4
            p.move(to: CGPoint(x: start, y: y))
            var x = start
            var up = true
            while x < end {
                let next = min(end, x + 12)
                p.addQuadCurve(to: CGPoint(x: next, y: y + rng.next(1.5)),
                               control: CGPoint(x: (x + next) / 2, y: y + (up ? -5 : 5)))
                x = next
                up.toggle()
            }
            p.move(to: CGPoint(x: start - 6, y: r.minY - 2))
            p.addLine(to: CGPoint(x: start - 6, y: r.maxY + 6))
            ctx.stroke(p, with: blue, style: solid)
        case .query:
            break
        case .ghost(let label, let at):
            let w = CGFloat(label.count) * 10 + 36
            let r = CGRect(x: at.x - 18, y: at.y - 26, width: w, height: 52)
            ctx.stroke(loop(around: r, rng: &rng), with: blue, style: dashed)
        case .ghostLink(let a, let b):
            var p = Path()
            p.move(to: a)
            p.addQuadCurve(to: b, control: CGPoint(x: (a.x + b.x) / 2 + rng.next(30) - 15, y: (a.y + b.y) / 2 + rng.next(30) - 15))
            ctx.stroke(p, with: blue, style: dashed)
        }
    }

    /// A hand-drawn loop: an ellipse with jitter and a small overshoot, never a perfect shape (§5.5).
    private func loop(around r: CGRect, rng: inout SeededJitter) -> Path {
        var p = Path()
        let cx = r.midX, cy = r.midY, rx = r.width / 2, ry = r.height / 2
        let start = -CGFloat.pi * 0.85 + rng.next(0.3)
        let steps = 36
        for i in 0...steps + 4 {
            let t = start + CGFloat(i) / CGFloat(steps) * 2 * .pi
            let wobble = 1 + (rng.next(0.08) - 0.04)
            let pt = CGPoint(x: cx + cos(t) * rx * wobble, y: cy + sin(t) * ry * wobble)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        return p
    }
}

/// Deterministic jitter so a mark looks the same every time it is drawn.
struct SeededJitter {
    private var state: UInt64
    init(seed: String) {
        var h: UInt64 = 1469598103934665603
        for b in seed.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        state = h == 0 ? 1 : h
    }
    mutating func next(_ scale: CGFloat) -> CGFloat {
        state ^= state << 13; state ^= state >> 7; state ^= state << 17
        return CGFloat(state % 10_000) / 10_000 * scale
    }
}
