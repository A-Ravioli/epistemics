import Foundation
import Security

/// Who asks the questions (ONBOARDING §3, step 3; DESIGN §6.1).
enum TutorMode: String, Codable, CaseIterable, Sendable {
    /// Deterministic and offline. It cannot really teach, and the app says so.
    case demo
    /// Claude with the learner's own API key, kept in the Keychain.
    case claudeKey
    /// Claude through a proxy that holds the key (`web/apps/server`).
    case proxy
}

/// Device and account preferences, stored in the `settings` table under "app".
struct AppSettings: Codable, Sendable, Equatable {
    var tutorMode: TutorMode = .demo
    var proxyURL: String = ""
    var handedness: Handedness = .right
    /// For testing and accessibility: let a finger draw too (rule 1 normally forbids it).
    var allowFingerDrawing = false
    /// DESIGN §10: answer text items by typing instead of writing. A setting, never a per-question escape.
    var typedAnswers = false
    var minutesPerDay = 20
    /// Account-scope onboarding fact (ONBOARDING §6).
    var onboarded = false
    var activeCourseId: String?
    /// Times the review gate was overridden, by study day.
    var gateOverrides: [String] = []
}

/// The draft of an unfinished first run, so a relaunch resumes where it stopped (ONBOARDING §6).
struct FirstRunDraft: Codable, Sendable, Equatable {
    var step = 0
    var packId: String?
    var recallInkId: String?
    var recallText: String?
    var placementOffered = false
}

/// Keychain storage for the API key. The key never leaves the device.
enum Secrets {
    private static let service = "app.epistemics.ipad"

    static func get(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ account: String, _ value: String?) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value, !value.isEmpty else { return }
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static let anthropicKey = "anthropic-api-key"
}
