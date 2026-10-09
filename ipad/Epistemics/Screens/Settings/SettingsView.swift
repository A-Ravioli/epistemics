import SwiftUI
import EpistemicsCore

/// Settings: the tutor, the hand, how answers are given, and the course's scheduling knobs.
/// A settings screen has no primary action: every control applies immediately.
struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var tutorMode: TutorMode = .demo
    @State private var apiKey = ""
    @State private var proxyURL = ""
    @State private var savedTutor = false
    @State private var retention = 0.9
    @State private var spentToday = 0.0

    var body: some View {
        @Bindable var app = app
        ScrollView {
            PageColumn(width: 640) {
                Text("Settings").font(.display).foregroundStyle(Theme.graphite)

                section("Tutor") {
                    TutorChoice(mode: $tutorMode, apiKey: $apiKey, proxyURL: $proxyURL)
                    HStack(spacing: 12) {
                        Button("Use this tutor") { saveTutor() }.buttonStyle(.secondary)
                        if savedTutor { Text("Saved.").font(.secondary).foregroundStyle(Theme.muted) }
                    }
                    Text(String(format: "Spent on Claude today: $%.2f", spentToday)).font(.secondary).foregroundStyle(Theme.muted)
                }

                section("Writing") {
                    Picker("Writing hand", selection: $app.settings.handedness) {
                        Text("Right hand").tag(Handedness.right)
                        Text("Left hand").tag(Handedness.left)
                    }
                    .pickerStyle(.segmented).frame(maxWidth: 320)
                    Text("Tools and Hand in sit under your other hand.").font(.secondary).foregroundStyle(Theme.muted)

                    Toggle("I'd rather not write by hand", isOn: $app.settings.typedAnswers)
                        .tint(Theme.graphite)
                    Text("Text answers are typed instead. Drawings and maps stay drawn. Every answer records how it was given, so this never distorts your progress.")
                        .font(.secondary).foregroundStyle(Theme.muted)

                    Toggle("Let a finger draw too", isOn: $app.settings.allowFingerDrawing)
                        .tint(Theme.graphite)
                    Text("Normally only Apple Pencil writes and a finger scrolls. Turn this on if you have no Pencil.")
                        .font(.secondary).foregroundStyle(Theme.muted)
                }

                if let ctx = app.context {
                    section("Scheduling") {
                        LabeledContent("Reviews a day, at most", value: "\(ctx.course.settings.reviewsPerDay)")
                        VStack(alignment: .leading, spacing: 6) {
                            Text(String(format: "Desired retention: %.0f%%", retention * 100)).font(.body15)
                            Slider(value: $retention, in: 0.8...0.95, step: 0.01) { editing in
                                if !editing { Task { await saveRetention() } }
                            }
                            .tint(Theme.graphite)
                            Text("How likely you should be to remember something when it comes back. Higher means more reviews.")
                                .font(.secondary).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .padding(.top, 56).padding(.horizontal, 32).padding(.bottom, 60)
        }
        .background(Theme.paper)
        .onAppear {
            tutorMode = app.settings.tutorMode
            proxyURL = app.settings.proxyURL
            apiKey = Secrets.get(Secrets.anthropicKey) ?? ""
            retention = app.context?.course.settings.desiredRetention ?? 0.9
        }
        .task { spentToday = (try? await app.store.llmCost(since: AppModel.now() - 86_400_000)) ?? 0 }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.heading).foregroundStyle(Theme.graphite)
            content()
        }
        .padding(.top, 12)
    }

    private func saveTutor() {
        if tutorMode == .claudeKey { Secrets.set(Secrets.anthropicKey, apiKey.trimmingCharacters(in: .whitespaces)) }
        app.settings.proxyURL = proxyURL.trimmingCharacters(in: .whitespaces)
        app.settings.tutorMode = tutorMode
        app.refreshProvider()
        savedTutor = true
    }

    private func saveRetention() async {
        guard var ctx = app.context else { return }
        ctx.course.settings.desiredRetention = retention
        ctx.course.updatedAt = AppModel.now()
        try? await app.store.saveCourse(ctx.course)
        try? await app.open(courseId: ctx.course.id)
    }
}
