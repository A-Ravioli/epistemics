import SwiftUI

@main
struct EpistemicsApp: App {
    @State private var app = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .task { await app.load() }
        }
    }
}
