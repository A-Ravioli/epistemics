import Foundation
import PencilKit
import Testing
@testable import Epistemics

@Suite(.serialized) struct OnDeviceReaderTests {
    static func stroke(_ pts: [CGPoint]) -> PKStroke {
        let start = Date()
        let points = pts.enumerated().map { i, p in
            PKStrokePoint(location: p, timeOffset: Double(i) * 0.016, size: CGSize(width: 3, height: 3), opacity: 1,
                          force: 1, azimuth: 0, altitude: .pi / 2)
        }
        return PKStroke(ink: PKInk(.pen, color: .black), path: PKStrokePath(controlPoints: points, creationDate: start))
    }

    static let drawing = PKDrawing(strokes: [
        stroke([CGPoint(x: 100, y: 30), CGPoint(x: 100, y: 100)]),
        stroke([CGPoint(x: 125, y: 105), CGPoint(x: 157, y: 25)]),
    ])

    @Test func recognizerAnswersWellInsideTheTimeout() async {
        let clock = ContinuousClock()
        let elapsed = await clock.measure { _ = await OnDeviceReader().read(Self.drawing) }
        print("on-device read took \(elapsed)")
        #expect(elapsed < OnDeviceReader.timeout, "the recogniser timed out instead of answering")
    }

    @Test func emptyInkReadsAsNothingImmediately() async {
        #expect(await OnDeviceReader().read(PKDrawing()) == "")
    }
}
