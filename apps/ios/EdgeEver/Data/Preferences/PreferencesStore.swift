import Foundation
import Observation
import SwiftUI

enum AppUILanguage: String {
    case chinese
    case english
    case japanese
    case polish
}

enum AppUILocale {
    /// Unmatched system languages use English, not Simplified Chinese.
    static func language(preferenceCode: String, systemLanguageCode: String?) -> AppUILanguage {
        switch preferenceCode {
        case "en-US": return .english
        case "zh-CN": return .chinese
        case "ja": return .japanese
        case "pl": return .polish
        default:
            let code = (systemLanguageCode ?? "").lowercased()
            if code.isEmpty { return .english }
            if code.hasPrefix("zh") { return .chinese }
            if code.hasPrefix("ja") { return .japanese }
            if code.hasPrefix("pl") { return .polish }
            return .english
        }
    }

    static func usesEnglish(preferenceCode: String, systemLanguageCode: String?) -> Bool {
        language(preferenceCode: preferenceCode, systemLanguageCode: systemLanguageCode) == .english
    }
}

@Observable
@MainActor
final class PreferencesStore {
    private let defaults: UserDefaults

    /// system | zh-CN | en-US | ja | pl — matches Android locale preference.
    var localeCode: String {
        didSet { defaults.set(localeCode, forKey: Keys.locale) }
    }

    var useCompression: Bool {
        didSet { defaults.set(useCompression, forKey: Keys.compression) }
    }

    /// Parent notebooks keep listing their sub-notebooks' notes unless turned off.
    var showDescendantNotes: Bool {
        didSet { defaults.set(showDescendantNotes, forKey: Keys.showDescendantNotes) }
    }

    /// system | light | dark
    var theme: String {
        didSet { defaults.set(theme, forKey: Keys.theme) }
    }

    var listDensity: ListDensity {
        didSet { defaults.set(listDensity.rawValue, forKey: Keys.density) }
    }

    var aiAssistantLastActionStore: AiAssistantLastActionStore {
        didSet { persistAiAssistantLastAction() }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.localeCode = defaults.string(forKey: Keys.locale) ?? "system"
        self.useCompression = defaults.object(forKey: Keys.compression) as? Bool ?? true
        self.showDescendantNotes = defaults.object(forKey: Keys.showDescendantNotes) as? Bool ?? true
        self.theme = defaults.string(forKey: Keys.theme) ?? "system"
        let densityRaw = defaults.string(forKey: Keys.density) ?? ListDensity.preview.rawValue
        // Migrate legacy "comfortable" → preview
        if densityRaw == "comfortable" {
            self.listDensity = .preview
        } else {
            self.listDensity = ListDensity(rawValue: densityRaw) ?? .preview
        }
        self.aiAssistantLastActionStore = Self.decodeAiAssistantLastActionStore(defaults.string(forKey: Keys.aiAssistantLastAction))
    }

    var resolvedLocale: Locale {
        switch localeCode {
        case "zh-CN": return Locale(identifier: "zh-Hans")
        case "en-US": return Locale(identifier: "en-US")
        case "ja": return Locale(identifier: "ja-JP")
        case "pl": return Locale(identifier: "pl-PL")
        default: return .autoupdatingCurrent
        }
    }

    var uiLanguage: AppUILanguage {
        AppUILocale.language(
            preferenceCode: localeCode,
            systemLanguageCode: Locale.autoupdatingCurrent.language.languageCode?.identifier
        )
    }

    /// Leftover two-way UI branches: Japanese and Polish must not fall through to Chinese.
    var isEnglish: Bool { uiLanguage != .chinese }

    var apiLocale: String {
        switch uiLanguage {
        case .english: return "en-US"
        case .japanese: return "ja"
        case .polish: return "pl"
        case .chinese: return "zh-CN"
        }
    }

    var colorScheme: ColorScheme? {
        switch theme {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    func t(_ zh: String, en: String, ja: String? = nil, pl: String? = nil) -> String {
        switch uiLanguage {
        case .english: return en
        case .japanese: return ja ?? en
        case .polish: return pl ?? en
        case .chinese: return zh
        }
    }

    func lastAiAssistantAction(isSelection: Bool) -> AiAssistantLastActionPreference? {
        isSelection ? aiAssistantLastActionStore.selected : aiAssistantLastActionStore.wholeNote
    }

    func setLastAiAssistantAction(_ preference: AiAssistantLastActionPreference, isSelection: Bool) {
        if isSelection {
            aiAssistantLastActionStore.selected = preference
        } else {
            aiAssistantLastActionStore.wholeNote = preference
        }
    }

    private func persistAiAssistantLastAction() {
        if let data = try? JSONEncoder().encode(aiAssistantLastActionStore),
           let raw = String(data: data, encoding: .utf8) {
            defaults.set(raw, forKey: Keys.aiAssistantLastAction)
        }
    }

    private static func decodeAiAssistantLastActionStore(_ raw: String?) -> AiAssistantLastActionStore {
        guard let raw, let data = raw.data(using: .utf8) else { return AiAssistantLastActionStore() }
        if let store = try? JSONDecoder().decode(AiAssistantLastActionStore.self, from: data) {
            return store
        }
        if let legacy = try? JSONDecoder().decode(AiAssistantLastActionPreference.self, from: data) {
            return AiAssistantLastActionStore(wholeNote: legacy)
        }
        return AiAssistantLastActionStore()
    }

    private enum Keys {
        static let locale = "edgeever.ios.locale"
        static let compression = "edgeever.ios.imageCompression"
        static let showDescendantNotes = "edgeever.ios.showDescendantNotes"
        static let theme = "edgeever.ios.theme"
        static let density = "edgeever.ios.listDensity"
        static let aiAssistantLastAction = "edgeever.aiAssistant.lastAction"
    }
}
