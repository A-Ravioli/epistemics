import SwiftUI
import UIKit

/// The iPad design tokens (ipad/docs/DESIGN.md §12). The page is paper; the learner's ink is graphite;
/// blue belongs to the tutor and to nothing else.
enum Theme {
    static let paper = Color(light: 0xFAFAF7, dark: 0x1C1C1B)
    static let paper2 = Color(light: 0xF0F0EA, dark: 0x262625)
    static let sheet = Color(light: 0xFFFFFF, dark: 0x232322)
    static let desk = Color(light: 0xECECE6, dark: 0x141413)
    static let graphite = Color(light: 0x1D1D1F, dark: 0xF5F5F2)
    static let tutor = Color(light: 0x0071E3, dark: 0x4DA2FF)
    static let muted = Color(light: 0x6E6E73, dark: 0x98989D)
    static let rule = Color(lightAlpha: (0x000000, 0.07), darkAlpha: (0xFFFFFF, 0.10))
    static let fill = Color(lightAlpha: (0x000000, 0.06), darkAlpha: (0xFFFFFF, 0.10))
    static let fillStrong = Color(lightAlpha: (0x000000, 0.10), darkAlpha: (0xFFFFFF, 0.16))
    static let onGraphite = Color(light: 0xFFFFFF, dark: 0x1D1D1F)
    /// Status as text colour only, never a fill on the page (§12, rule 3).
    static let good = Color(light: 0x1E7F45, dark: 0x5BD08A)
    static let warn = Color(light: 0x9A5B00, dark: 0xF2B35A)

    static let tutorUIColor = UIColor(light: 0x0071E3, dark: 0x4DA2FF)
    /// Ink is stored black; PencilKit renders it light in dark mode by itself.
    static let inkUIColor = UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)

    static let readingWidth: CGFloat = 760
    static let controlMin: CGFloat = 44
}

// MARK: - Type ramp (DESIGN-SYSTEM §3, with New York as the serif)

extension Font {
    static let display = Font.system(size: 28, weight: .semibold)
    static let title2x = Font.system(size: 21, weight: .semibold)
    static let heading = Font.system(size: 17, weight: .semibold)
    static let body15 = Font.system(size: 15)
    static let secondary = Font.system(size: 13)
    static let caption12 = Font.system(size: 12)
    /// The material: tutor turns, prompts. The serif means "this is what you are learning".
    static let reading = Font.system(size: 20, design: .serif)
    static let readingLarge = Font.system(size: 24, design: .serif)
    static let readingSmall = Font.system(size: 17, design: .serif)
    static let margin = Font.system(size: 15, design: .serif).italic()
}

// MARK: - Buttons

/// The one primary action on a screen: graphite, because handing in is the learner's move (DESIGN §2).
struct PrimaryButtonStyle: ButtonStyle {
    var large = false
    func makeBody(configuration: Configuration) -> some View {
        Styled(configuration: configuration, large: large)
    }

    private struct Styled: View {
        let configuration: Configuration
        let large: Bool
        @Environment(\.isEnabled) private var isEnabled
        var body: some View {
            configuration.label
                .font(.system(size: large ? 17 : 15, weight: .semibold))
                .foregroundStyle(Theme.onGraphite)
                .padding(.horizontal, large ? 28 : 22)
                .frame(minHeight: large ? 50 : 44)
                .background(Capsule().fill(Theme.graphite.opacity(configuration.isPressed ? 0.8 : 1)))
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(Capsule())
        }
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var height: CGFloat = 44
    func makeBody(configuration: Configuration) -> some View {
        Styled(configuration: configuration, height: height)
    }

    private struct Styled: View {
        let configuration: Configuration
        let height: CGFloat
        @Environment(\.isEnabled) private var isEnabled
        var body: some View {
            configuration.label
                .font(.system(size: height >= 56 ? 17 : 15))
                .foregroundStyle(Theme.graphite)
                .padding(.horizontal, height >= 56 ? 26 : 18)
                .frame(minHeight: height)
                .background(Capsule().fill(configuration.isPressed ? Theme.fillStrong : Theme.fill))
                .opacity(isEnabled ? 1 : 0.4)
                .contentShape(Capsule())
        }
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body15)
            .foregroundStyle(Theme.graphite)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Capsule().fill(configuration.isPressed ? Theme.fill : .clear))
            .contentShape(Capsule())
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
    static var primaryLarge: PrimaryButtonStyle { PrimaryButtonStyle(large: true) }
}
extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
    static var secondaryLarge: SecondaryButtonStyle { SecondaryButtonStyle(height: 56) }
}
extension ButtonStyle where Self == GhostButtonStyle {
    static var ghost: GhostButtonStyle { GhostButtonStyle() }
}

/// A round icon-only control, 44pt, nothing but the glyph until pressed.
struct IconButton: View {
    let systemName: String
    let label: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(Theme.graphite)
                .frame(width: Theme.controlMin, height: Theme.controlMin)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Colour helpers

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor(light: light, dark: dark))
    }
    init(lightAlpha: (UInt32, CGFloat), darkAlpha: (UInt32, CGFloat)) {
        self.init(uiColor: UIColor { traits in
            let (hex, a) = traits.userInterfaceStyle == .dark ? darkAlpha : lightAlpha
            return UIColor(hex: hex, alpha: a)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
    convenience init(light: UInt32, dark: UInt32) {
        self.init { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) }
    }
}
