// swift-tools-version: 6.2
import PackageDescription

// The platform-independent half of the iPad app: the pedagogy and scheduler (a port of
// web/packages/core) and the LLM layer (a port of web/packages/llm plus the ink Reader).
// Nothing here imports UIKit or PencilKit, so `swift test` runs it on the Mac.
let package = Package(
    name: "EpistemicsKit",
    platforms: [.iOS("27.0"), .macOS("26.0")],
    products: [
        .library(name: "EpistemicsCore", targets: ["EpistemicsCore"]),
        .library(name: "EpistemicsLLM", targets: ["EpistemicsLLM"]),
    ],
    targets: [
        .target(name: "EpistemicsCore", exclude: ["API.md"]),
        .target(
            name: "EpistemicsLLM",
            dependencies: ["EpistemicsCore"],
            exclude: ["API.md"],
            resources: [.copy("Prompts")]
        ),
        .testTarget(
            name: "EpistemicsCoreTests",
            dependencies: ["EpistemicsCore"],
            resources: [.copy("Fixtures")]
        ),
        .testTarget(name: "EpistemicsLLMTests", dependencies: ["EpistemicsLLM"]),
    ]
)
