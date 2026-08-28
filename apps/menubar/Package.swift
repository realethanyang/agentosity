// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AgentosityBar",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "AgentosityBar", path: "Sources")
    ]
)
