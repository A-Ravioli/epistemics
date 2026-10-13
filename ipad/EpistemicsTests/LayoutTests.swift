import SwiftUI
import UIKit
import Testing
import EpistemicsCore
@testable import Epistemics

/// The writing page and the layout bugs in docs/UX-AUDIT.md: the real views, hosted at real iPad sizes.
@MainActor
@Suite(.serialized) struct LayoutTests {
    struct Size { var name: String; var w: CGFloat; var h: CGFloat; var compact = false }
    static let sizes = [
        Size(name: "11-inch landscape", w: 1180, h: 820),
        Size(name: "11-inch portrait", w: 820, h: 1180),
        Size(name: "13-inch landscape", w: 1376, h: 1032),
        Size(name: "Split View", w: 590, h: 820, compact: true),
    ]

    @Test func theLayoutFollowsTheWindow() {
        #expect(WritingLayout.choose(size: CGSize(width: 1180, height: 820), sizeClass: .regular) == .spread)
        #expect(WritingLayout.choose(size: CGSize(width: 1376, height: 1032), sizeClass: .regular) == .spread)
        #expect(WritingLayout.choose(size: CGSize(width: 820, height: 1180), sizeClass: .regular) == .column)
        #expect(WritingLayout.choose(size: CGSize(width: 744, height: 1133), sizeClass: .regular) == .column)
        #expect(WritingLayout.choose(size: CGSize(width: 590, height: 820), sizeClass: .compact) == .compact)
        #expect(WritingLayout.choose(size: CGSize(width: 900, height: 700), sizeClass: .regular) == .column,
                "a short, narrow landscape window has no room for two pages")
    }

    @Test func noQuestionThatAsksForWorkingGetsAOneLineBox() throws {
        let url = try #require(Bundle.main.url(forResource: "probability-basics.epistemics", withExtension: "json", subdirectory: "Packs"))
        let pack = try JSONDecoder().decode(Curriculum.self, from: Data(contentsOf: url))
        let asksForWorking = try Regex(#"\b(show|check by|calculate|compute|work out|by how much|how many|find)\b"#).ignoresCase()
        for item in pack.allItems {
            for served in [item] + (item.variants ?? []).map({ item.serving($0.id) }) where served.prompt.contains(asksForWorking) {
                #expect(inkPaper(for: served).paper != .short, "\(served.id) asks for working but gets a one-line box")
            }
        }
    }

    // MARK: Hosting

    func host(_ view: some View, app: AppModel, size: Size) async throws -> UIWindow {
        let host = UIHostingController(rootView: AnyView(view.environment(app)))
        if size.compact { host.traitOverrides.horizontalSizeClass = .compact }
        let scene = try #require(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: size.w, height: size.h)
        window.rootViewController = host
        window.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(700))
        return window
    }

    /// Scrolls every scroll view to its end, as a lesson does after each turn.
    func scrollEverythingToTheEnd(_ v: UIView) async throws {
        func all(_ v: UIView) -> [UIScrollView] { ((v as? UIScrollView).map { [$0] } ?? []) + v.subviews.flatMap(all) }
        for sv in all(v) where sv.contentSize.height > sv.bounds.height {
            sv.setContentOffset(CGPoint(x: 0, y: sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom), animated: false)
        }
        try await Task.sleep(for: .milliseconds(300))
    }

    /// Whether a rail control (reported through `LayoutProbe`) is wholly inside the window.
    func onScreen(_ name: String, in window: UIWindow) -> Bool {
        guard let f = LayoutProbe.frames[name], !f.isEmpty else { return false }
        return window.bounds.insetBy(dx: -1, dy: -1).contains(f)
    }

    // MARK: B1, B2

    @Test(.timeLimit(.minutes(5))) func handInStaysOnScreenAfterALongLessonDialogue() async throws {
        let app = try await SessionFlowTests.enrolledApp()
        let ctx = try #require(app.context)
        let lesson = LessonSessionModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[1].id)
        await lesson.start()
        var turns = 0
        for step in 0..<20 where turns < 5 {
            if let p = lesson.pendingConfirmation { await lesson.confirmPending(text: p.reading.text); continue }
            lesson.activeArea.drawing = SessionFlowTests.scribble(step)
            switch lesson.inputMode {
            case .answer: await lesson.handIn()
            case .answerConfidence: await lesson.handIn(confidence: .fairlySure)
            default: break
            }
            turns += 1
        }
        try #require(lesson.canWrite, "the lesson is waiting for a written answer")
        let control = lesson.inputMode == .answerConfidence ? "Hand in with confidence" : "Hand in"
        lesson.activeArea.drawing = SessionFlowTests.scribble(99)
        for size in Self.sizes {
            LayoutProbe.frames = [:]
            let window = try await host(LessonView(model: lesson), app: app, size: size)
            try await scrollEverythingToTheEnd(window)
            #expect(onScreen(control, in: window), "\(control) is on screen at the end of the dialogue (\(size.name))")
            #expect(onScreen("Tools", in: window), "the tools are on screen (\(size.name))")
            window.isHidden = true
        }
    }

    @Test(.timeLimit(.minutes(2))) func theWarmUpsDoneIsOnScreenInEveryOrientation() async throws {
        let app = try await SessionFlowTests.enrolledApp()
        let ctx = try #require(app.context)
        let warmup = WarmupModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[0].id)
        warmup.area.drawing = SessionFlowTests.scribble(1)
        for size in Self.sizes {
            LayoutProbe.frames = [:]
            let window = try await host(WarmupView(model: warmup), app: app, size: size)
            try await scrollEverythingToTheEnd(window)
            #expect(onScreen("Done writing", in: window), "Done writing is on screen (\(size.name))")
            window.isHidden = true
        }
    }

    @Test(.timeLimit(.minutes(4))) func theConceptCardSitsBesideTheDialogueWhileHelpIsAllowed() async throws {
        let app = try await SessionFlowTests.enrolledApp()
        let ctx = try #require(app.context)
        let lesson = LessonSessionModel(app: app, ctx: ctx, lessonId: ctx.curriculum.allLessons[0].id)
        await SessionFlowTests.runLesson(lesson, until: .develop)
        try #require(lesson.showsConceptCard)
        let opensInColumn = lesson.workedPlan.map { $0.studyFirst || $0.learnerSteps > 0 } ?? false
        for size in Self.sizes where size.name != "Split View" {
            LayoutProbe.frames = [:]
            let window = try await host(LessonView(model: lesson), app: app, size: size)
            if size.w > size.h || opensInColumn {
                #expect(LayoutProbe.frames["Concept card"].map { !$0.isEmpty && $0.minY < window.bounds.maxY } == true,
                        "the card is on the page (\(size.name))")
            }
            #expect(onScreen("Tools", in: window), "and the tools stay on screen with it (\(size.name))")
            window.isHidden = true
        }
    }
}

