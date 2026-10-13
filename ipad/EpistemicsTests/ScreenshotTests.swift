import SwiftUI
import UIKit
import PencilKit
import CoreText
import Testing
import EpistemicsCore
import EpistemicsLLM
@testable import Epistemics

/// README screenshots (docs/screenshots/ipad). Opt-in, because they take a minute and write into the repo:
///
///     TEST_RUNNER_EPISTEMICS_SCREENSHOTS=1 xcodebuild test -project Epistemics.xcodeproj -scheme Epistemics \
///       -destination 'platform=iOS Simulator,name=iPad Air 11-inch (M4)' -only-testing:EpistemicsTests/ScreenshotTests
///
/// The views are the real ones with real app state. The tutor is scripted with turns taken from the lesson's
/// own script, and the "handwriting" is real PencilKit ink traced from a handwriting font, so the pages look
/// as they do in use.
@MainActor
@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["EPISTEMICS_SCREENSHOTS"] != nil))
struct ScreenshotTests {
    static let out: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("docs/screenshots/ipad")

    static let landscape = CGSize(width: 1180, height: 820)
    static let landscape13 = CGSize(width: 1376, height: 1032)

    /// Waits until the lesson is ready for the learner to write (the tutor's turn has landed).
    func waitForWriting(_ lesson: LessonSessionModel) async throws {
        for _ in 0..<40 where !lesson.canWrite { try await Task.sleep(for: .milliseconds(100)) }
    }
    static let portrait = CGSize(width: 820, height: 1180)

    // MARK: Rendering

    func shot(_ name: String, _ view: some View, app: AppModel, size: CGSize, scrollToEnd: Bool = false) async throws {
        let host = UIHostingController(rootView: AnyView(view.environment(app).environment(\.inkAsImage, true).background(Theme.paper)))
        let scene = try #require(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = host
        window.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(1200))
        if scrollToEnd {
            func all(_ v: UIView) -> [UIScrollView] { ((v as? UIScrollView).map { [$0] } ?? []) + v.subviews.flatMap(all) }
            // The page (the tallest scroll view), not the concept card inside it.
            if let sv = all(window).filter({ !($0 is PKCanvasView) && $0.contentSize.height > $0.bounds.height + 1 })
                .max(by: { $0.bounds.height < $1.bounds.height }) {
                sv.setContentOffset(CGPoint(x: 0, y: sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom), animated: false)
            }
            try await Task.sleep(for: .milliseconds(400))
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let screen = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        window.isHidden = true
        try FileManager.default.createDirectory(at: Self.out, withIntermediateDirectories: true)
        try Self.framed(screen).pngData()!.write(to: Self.out.appendingPathComponent("\(name).png"))
    }

    /// The screen in a plain iPad bezel, on a transparent background.
    static func framed(_ screen: UIImage) -> UIImage {
        let bezel: CGFloat = 36, outer: CGFloat = 64, inner: CGFloat = 34
        let size = CGSize(width: screen.size.width + bezel * 2, height: screen.size.height + bezel * 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = screen.scale
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1).setFill()
            UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: outer).fill()
            let rect = CGRect(x: bezel, y: bezel, width: screen.size.width, height: screen.size.height)
            UIBezierPath(roundedRect: rect, cornerRadius: inner).addClip()
            screen.draw(in: rect)
        }
    }

    // MARK: The scripted tutor

    /// What the learner "wrote" most recently: the Reader returns it, as a real Reader would.
    final class Box: @unchecked Sendable {
        private let lock = NSLock()
        private var _text = ""
        var text: String {
            get { lock.lock(); defer { lock.unlock() }; return _text }
            set { lock.lock(); _text = newValue; lock.unlock() }
        }
    }

    static func provider(tutor: [String], written: Box, wrongStep: (right: String, quote: String, why: String)? = nil) -> MockProvider {
        MockProvider(.init(queue: [.tutor: tutor.map { .text($0) }], respond: { req in
            switch req.role {
            case .reader:
                return .value(ReaderOutput(text: written.text))
            case .grader:
                let text = req.messages.map(\.content).joined()
                guard text.contains("\"answer\"") else { return nil }
                if let w = wrongStep, !text.contains(w.right) {
                    return .value(GradeResult(criteria: [], score: 0.3, feedback: "You counted the defective chips. The question asks for the chance of a good one.",
                                              confidence: 0.95, firstError: StepError(quote: w.quote, why: w.why)))
                }
                return .value(GradeResult(criteria: [], score: 0.92, feedback: "Right, and the working shows why.", confidence: 0.95))
            default:
                return nil
            }
        }))
    }

    // MARK: Shots

    @Test func ipadScreens() async throws {
        let app = try await SessionFlowTests.enrolledApp()
        app.loaded = true
        var ctx = try #require(app.context)
        let pack = ctx.curriculum
        let lesson1 = pack.allLessons[0]
        let script = lesson1.concepts[0].script

        // A lesson, a few handwritten turns in, at the worked example.
        let written = Box()
        ctx.provider = Self.provider(tutor: [
            script.pretest.prompt + " Have a go, even if you're unsure.",
            "Good start. What do you already know about listing every way an experiment can turn out?",
            script.guidingQuestions[1].question,
            script.guidingQuestions[2].question,
            "Look at step 2 of the example: what makes each listed outcome equally likely?",
        ], written: written)
        let lesson = LessonSessionModel(app: app, ctx: ctx, lessonId: lesson1.id)
        await lesson.start()
        let answers: [[String]] = [
            ["S = {HH, HT, TH, TT}", "one head: {HT, TH}"],
            ["the list of everything that", "could happen, each one once"],
            ["No. HT means the first coin was", "heads, TH means the second was"],
        ]
        for lines in answers {
            try await waitForWriting(lesson)
            written.text = lines.joined(separator: "\n")
            lesson.activeArea.drawing = Handwriting.drawing(lines, paper: lesson.activeArea.paper)
            if lesson.inputMode == .answerConfidence { await lesson.handIn(confidence: .fairlySure) } else { await lesson.handIn() }
            if let p = lesson.pendingConfirmation { await lesson.confirmPending(text: p.reading.text) }
        }
        try await waitForWriting(lesson)
        if let c = lesson.concept, lesson.showsConceptCard {
            lesson.workedArea(for: c.id).drawing = Handwriting.drawing(["the other 4 outcomes:", "GDD, DGD, DDG, DDD"], paper: .ruled)
        }
        lesson.activeArea.drawing = Handwriting.drawing(["{HT, TH}: both have exactly", "one H"], paper: lesson.activeArea.paper)
        try await shot("lesson-landscape", LessonView(model: lesson), app: app, size: Self.landscape13, scrollToEnd: true)
        try await shot("lesson-portrait", LessonView(model: lesson), app: app, size: Self.portrait, scrollToEnd: true)

        // A review of a worked problem: the first wrong line, marked, then fixed by hand.
        let itemId = "i-equally-likely-outcomes-03"
        let n = AppModel.now()
        var card = try #require(try await app.store.card(course: ctx.course.id, item: itemId))
        card.due = n
        card = ctx.scheduler.applyRating(card, .again, n, ReviewContext(source: .lesson, assisted: false)).card
        try await app.store.saveCards([card])
        var rctx = try #require(app.context)
        let later = n + 3_600_000
        rctx.now = { later }
        let reviewWritten = Box()
        rctx.provider = Self.provider(tutor: [], written: reviewWritten,
                                      wrongStep: ("P(good)", "P = 6/40", "This counts the defective chips, not the good ones."))
        await CourseService(ctx: rctx, store: app.store).setQueueFirst([card.conceptId])
        let review = ReviewSessionModel(app: app, ctx: rctx)
        await review.start()
        let wrong = ["40 chips, 6 are defective", "P = 6/40", "= 0.15"]
        reviewWritten.text = wrong.joined(separator: "\n")
        review.current?.area.drawing = Handwriting.drawing(wrong, paper: review.current?.area.paper ?? .squared)
        try await shot("review-answer", ReviewView(model: review), app: app, size: Self.landscape)
        await review.handIn(.fairlySure)
        if case .confirming(let r) = review.phase { await review.confirm(r, text: r.text) }
        // The recogniser can't search traced font strokes, so the staged shot places the mark itself, on the
        // line the grader named.
        if case .receipt(var r) = review.phase {
            r.marks = [InkMark(kind: .wrongStep(Handwriting.drawing([wrong[1]], paper: .squared, lineIndex: 1).bounds))]
            review.phase = .receipt(r)
        }
        review.startFix()
        if let fix = review.fix {
            let rewrite = ["P(good) = 34/40", "= 17/20"]
            reviewWritten.text = rewrite.joined(separator: "\n")
            fix.area.drawing = Handwriting.drawing(rewrite, paper: fix.area.paper)
            await fix.check()
        }
        try await shot("review-fixed", ReviewView(model: review), app: app, size: Self.landscape)

        // Map from memory, drawn.
        let unit = pack.units[0]
        let map = MapSessionModel(app: app, ctx: ctx, unitId: unit.id)
        map.area.drawing = Handwriting.conceptMap([
            ("sample space", CGPoint(x: 120, y: 120)), ("events", CGPoint(x: 470, y: 90)),
            ("complement", CGPoint(x: 800, y: 170)), ("counting", CGPoint(x: 160, y: 430)),
            ("permutations", CGPoint(x: 470, y: 520)), ("combinations", CGPoint(x: 820, y: 470)),
        ], links: [(0, 1), (1, 2), (0, 3), (3, 4), (3, 5), (4, 5)])
        try await shot("map-from-memory", MapFromMemoryView(model: map), app: app, size: Self.landscape)

        // Placement, portrait: a question answered by hand.
        let placement = PlacementModel(app: app, ctx: ctx)
        await placement.begin()
        let working = ["P(A) = 1/2   P(B) = 3/8", "A and B: HHT, HTH = 2/8", "1/2 x 3/8 = 3/16, not 1/4", "so not independent"]
        placement.area.drawing = Handwriting.drawing(working, paper: placement.area.paper)
        try await shot("placement-portrait", PlacementSessionView(model: placement), app: app, size: Self.portrait)

        // Today, the notebook and the course map, through the real root.
        app.settings.tutorMode = .proxy
        app.settings.proxyURL = "https://example.com/functions/v1/anthropic"
        DeveloperClock.advance(days: 1)
        defer { DeveloperClock.reset() }
        app.didChangeLearnerState()
        for (screen, name) in [(Screen.today, "today"), (.notebook, "notebook"), (.map, "course-map")] {
            app.screen = screen
            try await shot(name, RootView(), app: app, size: Self.landscape)
        }
    }
}

// MARK: - Handwriting

/// Real PencilKit ink from text: each outline of a thin handwriting font becomes a pen stroke, with a little
/// wobble per letter. For screenshots and previews only.
enum Handwriting {
    /// `lineIndex`: where the first line goes (to rebuild one line of a page on its own).
    static func drawing(_ lines: [String], paper: Paper, x: CGFloat = 22, size: CGFloat = 23, lineIndex: Int = 0) -> PKDrawing {
        let firstBaseline: CGFloat = paper == .ruled ? 14 + Paper.lineSpacing - 9 : 42
        let step: CGFloat = paper == .ruled ? Paper.lineSpacing : Paper.squareSize * 2
        var strokes: [PKStroke] = []
        for (i, line) in lines.enumerated() {
            var rng = SeededJitter(seed: line)
            strokes += Self.strokes(line, origin: CGPoint(x: x, y: firstBaseline + CGFloat(i + lineIndex) * step), size: size, rng: &rng)
        }
        return PKDrawing(strokes: strokes)
    }

    static func strokes(_ text: String, origin: CGPoint, size: CGFloat, rng: inout SeededJitter) -> [PKStroke] {
        let font = CTFontCreateWithName("Noteworthy-Light" as CFString, size, nil)
        let attributed = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
        let line = CTLineCreateWithAttributedString(attributed)
        var out: [PKStroke] = []
        let ink = PKInk(.pen, color: Theme.inkUIColor)
        for run in CTLineGetGlyphRuns(line) as! [CTRun] {
            let attrs = CTRunGetAttributes(run) as NSDictionary
            let runFont = attrs[kCTFontAttributeName as String] as! CTFont
            let count = CTRunGetGlyphCount(run)
            var glyphs = [CGGlyph](repeating: 0, count: count)
            var positions = [CGPoint](repeating: .zero, count: count)
            CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
            CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
            for (g, p) in zip(glyphs, positions) {
                let wobble = rng.next(1.6) - 0.8
                let tilt = (rng.next(0.06) - 0.03)
                var t = CGAffineTransform(translationX: origin.x + p.x, y: origin.y + wobble).rotated(by: tilt).scaledBy(x: 1, y: -1)
                guard let path = CTFontCreatePathForGlyph(runFont, g, &t) else { continue }
                for points in subpaths(path) where points.count > 1 {
                    out.append(stroke(points, ink: ink))
                }
                out += fill(path, ink: ink)
            }
        }
        return out
    }

    /// A hand-drawn concept map: labels in loose ellipses, joined by lines.
    static func conceptMap(_ nodes: [(String, CGPoint)], links: [(Int, Int)]) -> PKDrawing {
        var rng = SeededJitter(seed: nodes.map(\.0).joined())
        let ink = PKInk(.pen, color: Theme.inkUIColor)
        var strokes: [PKStroke] = []
        var boxes: [CGRect] = []
        for (label, at) in nodes {
            strokes += Self.strokes(label, origin: at, size: 23, rng: &rng)
            let width = CGFloat(label.count) * 11 + 44
            let box = CGRect(x: at.x - 22, y: at.y - 34, width: width, height: 52)
            boxes.append(box)
            var loop: [CGPoint] = []
            for i in 0...44 {
                let a = -CGFloat.pi * 0.9 + CGFloat(i) / 40 * 2 * .pi
                let w = 1 + rng.next(0.06) - 0.03
                loop.append(CGPoint(x: box.midX + cos(a) * box.width / 2 * w, y: box.midY + sin(a) * box.height / 2 * w))
            }
            strokes.append(stroke(loop, ink: ink, width: 2.6))
        }
        for (a, b) in links {
            let p = boxes[a], q = boxes[b]
            let from = CGPoint(x: p.midX + (q.midX - p.midX) * 0.28, y: p.midY + (q.midY - p.midY) * 0.28)
            let to = CGPoint(x: p.midX + (q.midX - p.midX) * 0.72, y: p.midY + (q.midY - p.midY) * 0.72)
            let mid = CGPoint(x: (from.x + to.x) / 2 + rng.next(14) - 7, y: (from.y + to.y) / 2 + rng.next(14) - 7)
            strokes.append(stroke([from, mid, to], ink: ink, width: 2.6))
        }
        return PKDrawing(strokes: strokes)
    }

    /// PencilKit's pen draws nothing below about 2 points wide.
    private static func stroke(_ points: [CGPoint], ink: PKInk, width: CGFloat = 2.2) -> PKStroke {
        let start = Date()
        let pts = points.enumerated().map { i, p in
            PKStrokePoint(location: p, timeOffset: Double(i) * 0.008, size: CGSize(width: width, height: width), opacity: 1,
                          force: 1, azimuth: 0, altitude: .pi / 2)
        }
        return PKStroke(ink: ink, path: PKStrokePath(controlPoints: pts, creationDate: start))
    }

    /// Fills a glyph with short horizontal pen strokes, so traced letters read as solid ink, not outlines.
    private static func fill(_ path: CGPath, ink: PKInk) -> [PKStroke] {
        let box = path.boundingBoxOfPath
        var out: [PKStroke] = []
        var y = box.minY + 0.6
        while y < box.maxY {
            var x = box.minX
            var runStart: CGFloat?
            while x <= box.maxX + 0.5 {
                let inside = x <= box.maxX && path.contains(CGPoint(x: x, y: y), using: .winding)
                if inside, runStart == nil { runStart = x }
                if !inside, let s = runStart {
                    out.append(stroke([CGPoint(x: s, y: y), CGPoint(x: max(s + 0.5, x - 0.5), y: y)], ink: ink, width: 2))
                    runStart = nil
                }
                x += 0.5
            }
            y += 1.2
        }
        return out
    }

    /// The path's subpaths as point lists, curves flattened.
    private static func subpaths(_ path: CGPath) -> [[CGPoint]] {
        var all: [[CGPoint]] = []
        var current: [CGPoint] = []
        var start = CGPoint.zero
        path.applyWithBlock { el in
            let e = el.pointee
            switch e.type {
            case .moveToPoint:
                if current.count > 1 { all.append(current) }
                current = [e.points[0]]; start = e.points[0]
            case .addLineToPoint:
                current.append(e.points[0])
            case .addQuadCurveToPoint:
                let p0 = current.last ?? start, c = e.points[0], p1 = e.points[1]
                for i in 1...6 {
                    let t = CGFloat(i) / 6, u = 1 - t
                    current.append(CGPoint(x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y))
                }
            case .addCurveToPoint:
                let p0 = current.last ?? start, c1 = e.points[0], c2 = e.points[1], p1 = e.points[2]
                for i in 1...8 {
                    let t = CGFloat(i) / 8, u = 1 - t
                    let x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x
                    let y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
                    current.append(CGPoint(x: x, y: y))
                }
            case .closeSubpath:
                current.append(start)
                if current.count > 1 { all.append(current) }
                current = []
            @unknown default:
                break
            }
        }
        if current.count > 1 { all.append(current) }
        return all
    }
}
