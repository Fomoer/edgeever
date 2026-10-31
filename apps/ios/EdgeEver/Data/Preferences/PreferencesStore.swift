import Foundation

// BEGIN GENERATED FONT CATALOG — bun scripts/sync-font-catalog.mjs
enum NoteImageFontCatalog {
    static let choices: [(id: String, zh: String, en: String)] = [
        (id: "smiley", zh: "得意黑", en: "Smiley Sans"),
        (id: "wenkai", zh: "霞鹜文楷", en: "LXGW WenKai"),
        (id: "zhuque", zh: "朱雀仿宋", en: "Zhuque Fangsong"),
        (id: "heavy", zh: "思源黑体 Heavy", en: "Noto Sans SC Heavy"),
        (id: "puhui", zh: "普惠体", en: "PuHuiTi"),
        (id: "puhui-heavy", zh: "普惠体 Heavy", en: "PuHuiTi Heavy"),
        (id: "youshe", zh: "优设标题黑", en: "YouShe Title"),
        (id: "shuhei", zh: "阿里妈妈数黑体", en: "Alimama ShuHei"),
        (id: "source-han-serif", zh: "思源宋体", en: "Noto Serif SC"),
        (id: "anton", zh: "Anton", en: "Anton"),
        (id: "douyin", zh: "抖音美好体", en: "Douyin Sans"),
        (id: "mashan", zh: "马善政楷书", en: "Ma Shan Zheng"),
        (id: "jiangcheng", zh: "江城圆体", en: "Jiangcheng Rounded"),
        (id: "huangyou", zh: "站酷庆科黄油体", en: "ZCOOL QingKe HuangYou"),
        (id: "glow", zh: "未来荧黑", en: "Glow Sans"),
        (id: "kuaile", zh: "站酷快乐体", en: "ZCOOL KuaiLe"),
        (id: "source-han-sans", zh: "思源黑体", en: "Noto Sans SC"),
        (id: "source-han-serif-heavy", zh: "思源宋体 Heavy", en: "Noto Serif SC Heavy"),
        (id: "inter", zh: "Inter", en: "Inter"),
        (id: "dmserif", zh: "DM Serif Display", en: "DM Serif Display"),
        (id: "bebas", zh: "Bebas Neue", en: "Bebas Neue"),
        (id: "spacegrotesk", zh: "Space Grotesk", en: "Space Grotesk"),
        (id: "maple-mono-cn", zh: "Maple Mono CN", en: "Maple Mono CN"),
        (id: "jetbrains", zh: "JetBrains Mono", en: "JetBrains Mono"),
    ]
    static let templateLabels: [String: (zh: String, en: String, ja: String, pl: String)] = [
        "glass": (zh: "MiSans", en: "MiSans", ja: "MiSans", pl: "MiSans"),
        "quote": (zh: "汇文明朝体", en: "Huiwen Mincho", ja: "匯文明朝体", pl: "Huiwen Mincho"),
        "book": (zh: "思源宋体", en: "Source Han Serif", ja: "源ノ明朝", pl: "Source Han Serif"),
        "memo": (zh: "MiSans", en: "MiSans", ja: "MiSans", pl: "MiSans"),
        "bento": (zh: "MiSans", en: "MiSans", ja: "MiSans", pl: "MiSans"),
        "black-sun": (zh: "Geist Mono / MiSans", en: "Geist Mono / MiSans", ja: "Geist Mono / MiSans", pl: "Geist Mono / MiSans"),
        "frame": (zh: "思源宋体", en: "Source Han Serif", ja: "源ノ明朝", pl: "Source Han Serif"),
        "handwritten": (zh: "龙藏体", en: "Long Cang", ja: "Long Cang", pl: "Long Cang"),
        "code": (zh: "Geist Mono", en: "Geist Mono", ja: "Geist Mono", pl: "Geist Mono"),
    ]
}
// END GENERATED FONT CATALOG
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

/// Local image-share choices, independent of the current note or sheet lifetime.
struct NoteImageSharePreferences: Codable, Equatable {
    var theme: String = "glass"
    var fontStyle: String = "auto"
    var fontSize: String = "lg"
    var cardWidth: String = "wide"
    var format: String = "png"
    var showTitle: Bool = false
    var showNotebook: Bool = false
    var showTags: Bool = false
    var showUpdatedAt: Bool = true
    var showBranding: Bool = true

    init() {}

    private enum CodingKeys: String, CodingKey {
        case theme, fontStyle, fontSize, cardWidth, format, showTitle, showNotebook, showTags, showUpdatedAt, showBranding
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        if let value = try? values.decode(String.self, forKey: .theme),
           ["gradient", "glass", "quote", "book", "memo", "bento", "black-sun", "frame", "handwritten", "code"].contains(value) {
            theme = value == "gradient" ? "glass" : value
        }
        if let value = try? values.decode(String.self, forKey: .fontStyle),
           (["auto", "serif", "sans", "mono", "kai"] + NoteImageFontCatalog.choices.map(\.id)).contains(value) {
            fontStyle = value
        }
        if let value = try? values.decode(String.self, forKey: .fontSize),
           ["sm", "md", "lg"].contains(value) {
            fontSize = value
        }
        if let value = try? values.decode(String.self, forKey: .cardWidth),
           ["compact", "standard", "wide"].contains(value) {
            cardWidth = value
        }
        if let value = try? values.decode(String.self, forKey: .format),
           ["png", "jpeg"].contains(value) {
            format = value
        }
        showTitle = (try? values.decode(Bool.self, forKey: .showTitle)) ?? false
        showNotebook = (try? values.decode(Bool.self, forKey: .showNotebook)) ?? false
        showTags = (try? values.decode(Bool.self, forKey: .showTags)) ?? false
        showUpdatedAt = (try? values.decode(Bool.self, forKey: .showUpdatedAt)) ?? true
        showBranding = (try? values.decode(Bool.self, forKey: .showBranding)) ?? true
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

    var noteImageShare: NoteImageSharePreferences {
        didSet {
            if let data = try? JSONEncoder().encode(noteImageShare) {
                defaults.set(data, forKey: Keys.noteImageShare)
            }
        }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Keys.noteImageShare),
           let saved = try? JSONDecoder().decode(NoteImageSharePreferences.self, from: data) {
            self.noteImageShare = saved
        } else {
            self.noteImageShare = NoteImageSharePreferences()
        }
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
        static let noteImageShare = "edgeever.ios.noteImagePreferences"
        static let locale = "edgeever.ios.locale"
        static let compression = "edgeever.ios.imageCompression"
        static let showDescendantNotes = "edgeever.ios.showDescendantNotes"
        static let theme = "edgeever.ios.theme"
        static let density = "edgeever.ios.listDensity"
        static let aiAssistantLastAction = "edgeever.aiAssistant.lastAction"
    }
}
