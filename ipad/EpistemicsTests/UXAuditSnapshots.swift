import SwiftUI
import UIKit
import Testing
import EpistemicsCore
import EpistemicsLLM
@testable import Epistemics

/// Temporary (UX audit): renders the main screens at real iPad sizes into /tmp/ux, one image per size and
/// one contact sheet per screen. Delete after the audit.
@MainActor
@Suite(.serialized) struct UXAuditSnapshots {
    struct Size { var name: String; var w: CGFloat; var h: CGFloat; var compact = false }
    static let sizes = [
        Size(name: "air11-landscape", w: 1180, h: 820),
        Size(name: "air11-portrait", w: 820, h: 1180),
        Size(name: "pro13-landscape", w: 1376, h: 1032),
        Size(name: "mini-portrait", w: 744, h: 1133),
        Size(name: "split-half", w: 590, h: 820, compact: true),
    ]
    static let out = URL(fileURLWithPath: "/tmp/ux")

    func shot(_ view: some View, app: AppModel, size: Size, wait: Int = 900) async throws -> UIImage {
        let host = UIHostingController(rootView: AnyView(view.environment(app).background(Theme.paper)))
        if size.compact { host.traitOverrides.horizontalSizeClass = .compact }
        let scene = try #require(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: size.w, height: size.h)
        window.rootViewController = host
        window.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(wait))
        host.view.layoutIfNeeded()
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let img = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        window.isHidden = true
        return img
    }

    func render(_ name: String, app: AppModel, sizes: [Size] = sizes, _ make: () -> some View) async throws {
        try FileManager.default.createDirectory(at: Self.out, withIntermediateDirectories: true)
        var images: [(Size, UIImage)] = []
        for s in sizes {
            let img = try await shot(make(), app: app, size: s)
            try img.pngData()!.write(to: Self.out.appendingPathComponent("\(name)-\(s.name).png"))
            images.append((s, img))
        }
        // Contact sheet: every size at the same physical scale (0.5 pt per px), labelled.
        let scale: CGFloat = 0.5, gap: CGFloat = 24, label: CGFloat = 28
        let width = images.reduce(gap) { $0 + $1.0.w * scale + gap }
        let height = (images.map(\.0.h).max() ?? 0) * scale + label + gap * 2
        let sheet = UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { ctx in
            UIColor(white: 0.82, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            var x = gap
            for (s, img) in images {
                (s.name as NSString).draw(at: CGPoint(x: x, y: gap / 2),
                                          withAttributes: [.font: UIFont.systemFont(ofSize: 16, weight: .semibold)])
                img.draw(in: CGRect(x: x, y: gap / 2 + label, width: s.w * scale, height: s.h * scale))
                x += s.w * scale + gap
            }
        }
        try sheet.pngData()!.write(to: Self.out.appendingPathComponent("sheet-\(name).png"))
    }

    /// An app one lesson in, an hour later, so Today has reviews and a warm-up.
    func appAfterOneLesson() async throws -> AppModel {
        let app = try await SessionFlowTests.enrolledApp()
        let ctx = try #require(app.context)
        try await SessionFlowTests.runLesson(LessonSessionModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[0].id))
        DeveloperClock.advance(days: 1.0 / 24)
        app.didChangeLearnerState()
        return app
    }

    @Test func screens() async throws {
        defer { DeveloperClock.reset() }
        let app = try await appAfterOneLesson()
        var ctx = try #require(app.context)

        // Library screens through the real root (sidebar + detail).
        for screen in [Screen.today, .notebook, .map, .progress] {
            app.screen = screen
            try await render("root-\(screen)", app: app) { RootView() }
        }
        app.screen = .today

        // A lesson, a few turns in.
        let lesson = LessonSessionModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[1].id)
        await lesson.start()
        for step in 0..<5 {
            if let p = lesson.pendingConfirmation { await lesson.confirmPending(text: p.reading.text); continue }
            switch lesson.inputMode {
            case .answer, .summary: lesson.activeArea.drawing = SessionFlowTests.scribble(step); await lesson.handIn()
            case .answerConfidence: lesson.activeArea.drawing = SessionFlowTests.scribble(step); await lesson.handIn(confidence: .fairlySure)
            default: break
            }
        }
        try await render("lesson-mid", app: app) { LessonView(model: lesson) }

        // A review of a worked problem, before hand-in, then its fix-it receipt.
        let itemId = "i-equally-likely-outcomes-03"
        let n = AppModel.now()
        var card = try #require(try await app.store.card(course: ctx.course.id, item: itemId))
        card.due = n - 1000
        card = ctx.scheduler.applyRating(card, .again, n - 3_600_000, ReviewContext(source: .lesson, assisted: false)).card
        card.due = n - 1000
        try await app.store.saveCards([card])
        await CourseService(ctx: ctx, store: app.store).setQueueFirst([card.conceptId])
        let steps = SessionFlowTests.StepProvider(readings: ["40 chips, 6 are defective\nP = 6/40\n= 0.15", "P(good) = 34 out of 40"])
        ctx.provider = steps.provider(right: "34 out of 40", wrongLine: "P = 6/40")
        let review = ReviewSessionModel(app: app, ctx: ctx)
        await review.start()
        try await render("review-answer", app: app) { ReviewView(model: review) }
        review.current?.area.drawing = SessionFlowTests.scribble(1)
        await review.handIn(.fairlySure)
        if case .confirming(let r) = review.phase { await review.confirm(r, text: r.text) }
        review.startFix()
        try await render("review-fix", app: app) { ReviewView(model: review) }

        // Sessions that open on a blank page.
        ctx = try #require(app.context)
        let unit = ctx.curriculum.units[0]
        try await render("checkpoint", app: app) { CheckpointView(model: CheckpointSessionModel(app: app, ctx: ctx, unitId: unit.id)) }
        try await render("map", app: app) { MapFromMemoryView(model: MapSessionModel(app: app, ctx: ctx, unitId: unit.id)) }
        try await render("warmup", app: app) { WarmupView(model: WarmupModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[0].id)) }
        let concept = ctx.curriculum.allLessons[0].concepts[0]
        try await render("teachback", app: app) { TeachbackView(model: TeachbackSessionModel(app: app, ctx: ctx, conceptId: concept.id)) }
    }
}
