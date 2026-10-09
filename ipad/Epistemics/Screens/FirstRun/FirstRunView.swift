import SwiftUI
import UniformTypeIdentifiers
import EpistemicsCore

/// The first run (web/docs/ONBOARDING.md, ipad/docs/DESIGN.md §6.1): what to learn, what you already know
/// (handwritten), who asks the questions, and the time and the one rule. One column, steps in place.
struct FirstRunView: View {
    @Environment(AppModel.self) private var app
    @State private var model = FirstRunModel()
    @State private var importing = false

    var body: some View {
        ScrollView {
            PageColumn {
                Text("Step \(model.stepNumber) of \(model.stepCount)\(model.pack.map { " · \($0.manifest.title)" } ?? "")")
                    .font(.secondary).foregroundStyle(Theme.muted)
                switch model.step {
                case .subject: subjectStep
                case .recall: recallStep
                case .reflection: reflectionStep
                case .tutor: tutorStep
                case .commitment: commitmentStep
                }
                if let error = model.error { Banner(text: error) }
            }
            .padding(.top, 40)
            .padding(.bottom, 60)
            .padding(.horizontal, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper.ignoresSafeArea())
        .task { await model.load(app: app) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            if case .success(let url) = result { model.importPack(url, app: app) }
        }
    }

    // MARK: Step 1

    private var subjectStep: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("What do you want to learn?").font(.display).foregroundStyle(Theme.graphite)
            MaterialText("Pick a course. Every answer you give in it is written by hand, so the first thing you will do is write.")
            VStack(spacing: 10) {
                ForEach(model.packs, id: \.manifest.id) { pack in
                    let selected = model.pack?.manifest.id == pack.manifest.id
                    Button { model.pack = pack } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(pack.manifest.title).font(.heading).foregroundStyle(Theme.graphite)
                            Text(packLine(pack)).font(.secondary).foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(selected ? Theme.fillStrong : Theme.fill))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
                Button("Open a course file…") { importing = true }.buttonStyle(.ghost)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            PageNote(text: "Courses built from a subject or your own material on the web or desktop app can be exported as .epistemics.json files and opened here.")

            VStack(alignment: .leading, spacing: 10) {
                Text("Which hand do you write with?").font(.heading).foregroundStyle(Theme.graphite)
                Picker("Writing hand", selection: Binding(get: { app.settings.handedness }, set: { app.settings.handedness = $0 })) {
                    Text("Right").tag(Handedness.right)
                    Text("Left").tag(Handedness.left)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 260)
                PageNote(text: "The tools and the Hand in button sit under your other hand, so your palm never lands on them.")
            }

            Button("Continue") { model.step = .recall }
                .buttonStyle(.primaryLarge)
                .disabled(model.pack == nil)
        }
    }

    private func packLine(_ p: Curriculum) -> String {
        let lessons = p.allLessons.count
        let items = p.allItems.count
        let minutes = lessons * 25
        return "\(p.units.count) unit\(p.units.count == 1 ? "" : "s"), \(lessons) lessons · about \(String(format: "%.1f", Double(minutes) / 60)) h of lessons · \(items) review questions"
    }

    // MARK: Step 2

    private var recallStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Before we start: what do you already know about \(model.subjectName)?")
                .font(.display).foregroundStyle(Theme.graphite)
            MaterialText("Write it by hand, anywhere on the page: words, formulas, a sketch. Don't look anything up. “Nothing at all” is a real answer, and a useful one.")
            InkArea(area: model.recallArea, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
            HStack(spacing: 16) {
                Text("Write with Apple Pencil. Your finger scrolls and taps; it never leaves a mark.")
                    .font(.secondary).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button("I know nothing yet") { Task { await model.finishRecall(app: app, empty: true) } }
                    .buttonStyle(.ghost)
                Button("Done writing") { Task { await model.finishRecall(app: app, empty: false) } }
                    .buttonStyle(.primary)
                    .disabled(model.recallArea.isEmpty || model.reading)
            }
            if model.reading { WorkingLine(text: "Reading what you wrote…") }
        }
    }

    private var reflectionStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("That was the whole idea").font(.display).foregroundStyle(Theme.graphite)
            MaterialText(model.reflection)
            if !model.named.isEmpty {
                Text(model.named.joined(separator: " · ")).font(.body15).foregroundStyle(Theme.muted)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("Trying to remember something before you are taught it is what makes it stick, even when you get it wrong and even when you come up blank. That is the move you just made, and it is the one this app is built out of.")
                Text("So every lesson starts with a question you cannot answer yet, the tutor gives hints rather than answers, and it ends by checking you with nothing on screen to help. After that the same material comes back, spaced out, until you keep it.")
                Text("You will do all of it by hand, because writing lets you draw the tree, work the sum and map the ideas, which typing cannot.")
            }
            .font(.body15).foregroundStyle(Theme.muted)
            Button("Continue") { model.step = model.needsTutor ? .tutor : .commitment }
                .buttonStyle(.primaryLarge)
        }
    }

    // MARK: Step 3

    private var tutorStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Who is asking the questions?").font(.display).foregroundStyle(Theme.graphite)
            MaterialText("You have just written something you expect to be read. Choose who reads it.")
            TutorChoice(mode: $model.tutorMode, apiKey: $model.apiKey, proxyURL: $model.proxyURL)
            Button("Continue") { model.saveTutor(app: app); model.step = .commitment }
                .buttonStyle(.primaryLarge)
                .disabled(!model.tutorChoiceComplete)
        }
    }

    // MARK: Step 4

    private var commitmentStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("How much time, and the one rule").font(.display).foregroundStyle(Theme.graphite)
            VStack(alignment: .leading, spacing: 10) {
                Text("Most days, I can give this").font(.heading).foregroundStyle(Theme.graphite)
                Picker("Minutes a day", selection: $model.minutesPerDay) {
                    Text("10 minutes").tag(10)
                    Text("20 minutes").tag(20)
                    Text("40 minutes").tag(40)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 420)
            }
            MaterialText("Reviews come first. Each day Epistemics gives back what you are about to forget, and the next lesson stays locked until that is clear: about \(model.minutesPerDay) minutes, at most \(model.reviewsPerDay) cards, by hand.")
            Text("You can override the gate once a day when life happens. There is no way to switch it off, because switching it off is what makes every other app not work.")
                .font(.body15).foregroundStyle(Theme.muted)
            Button(model.enrolling ? "Setting up…" : "Start") { Task { await model.finish(app: app) } }
                .buttonStyle(.primaryLarge)
                .disabled(model.enrolling)
        }
    }
}

/// The three tutor options, honestly described (ONBOARDING §3, step 3). Also used in Settings.
struct TutorChoice: View {
    @Binding var mode: TutorMode
    @Binding var apiKey: String
    @Binding var proxyURL: String

    var body: some View {
        VStack(spacing: 10) {
            option(.claudeKey, "Claude, with your API key",
                   "The key is kept in this iPad's Keychain and sent only to Anthropic.") {
                SecureField("sk-ant-…", text: $apiKey)
                    .textContentType(.password)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.sheet))
            }
            option(.proxy, "Claude, through your server",
                   "A proxy that holds the key, such as the Supabase edge function or the web app's server. Nothing secret on this iPad.") {
                TextField("https://…/functions/v1/anthropic", text: $proxyURL)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.sheet))
            }
            option(.demo, "The demo tutor",
                   "Offline and deterministic. It cannot really teach or read your handwriting: it takes the iPad's own reading as given and says the same kind of thing in every phase. You can change this in Settings.") {
                EmptyView()
            }
        }
    }

    private func option<Detail: View>(_ value: TutorMode, _ title: String, _ description: String, @ViewBuilder detail: () -> Detail) -> some View {
        let selected = mode == value
        return VStack(alignment: .leading, spacing: 10) {
            Button { mode = value } label: {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                        .font(.system(size: 20)).foregroundStyle(Theme.graphite)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title).font(.heading).foregroundStyle(Theme.graphite)
                        Text(description).font(.secondary).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected ? .isSelected : [])
            if selected { detail().padding(.leading, 32) }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(selected ? Theme.fillStrong : Theme.fill))
    }
}
