# EdgeEver iOS (Swift)

Native SwiftUI client for EdgeEver. This replaces the React Native / Expo iOS target.

**App Store binaries on macOS beta:** use **Xcode Cloud** — [`docs/ios-xcode-cloud.md`](../../docs/ios-xcode-cloud.md). Formal Releases start Cloud through store-delivery.

## Status

UI/interaction is aligned with the Android RN app (`apps/mobile`):

- Login / session (Keychain with UserDefaults fallback) / device id
- GRDB local mirror + bootstrap / incremental sync
- SQLite outbox (create/update, create-absorbs-update, conflict/retry)
- Workspace chrome: notebook title picker, search (250ms debounce), filter chips, list options (sort/density/batch), FAB create, long-press multi-select, swipe pin/delete
- Memo detail + create/edit autosave, share link, revisions, soft delete
- EditorBundle (WKWebView body + toolbar)
- Image pick + materialize-for-upload (K24) + protected resource blob loading
- Settings: general / account / tags / API tokens / devices / users (owner) / about
- Share Extension (text/URL → App Group → new draft)
- Locale (system/zh/en) + theme + list density

Android remains Expo / React Native in `apps/mobile`. Store builds for iOS use this native tree (`Scripts/archive-app-store.sh`), not EAS.

## Motion / animations

Motion stack: **SwiftUI Animation** (short easing transitions) + **[Pow](https://github.com/EmergeTools/Pow)** (Emerge) for focused feedback.

| Effect | Where |
|--------|--------|
| Static list cards and press targets | List entry, create/edit return, card / create / filter presses |
| Short easing transitions | Search, filters, settings, loading states |
| **Shine / Shake / Haptic** | Pin success, errors, selection |

Curves & wrappers: `EdgeEver/DesignSystem/Motion.swift`.

## Requirements

- Xcode 16+ (Xcode 27 beta OK for local dev)
- iOS 17+ deployment target
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) to regenerate the project

```sh
brew install xcodegen
```

## Generate & open

```sh
cd apps/ios
xcodegen generate
open EdgeEver.xcodeproj
```

## Tests

```sh
# Unit + live API tests (live tests skip if local server is down)
xcodebuild test \
  -project EdgeEver.xcodeproj \
  -scheme EdgeEver \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Live API tests login to `http://127.0.0.1:8787` using `EDGE_EVER_AUTH_PASSWORD` or monorepo `.env.wrangler.generated.local`.

## Simulator auto-login (QA)

With local `bun run dev` running:

```sh
xcrun simctl launch booted org.edgeever.mobile \
  -EdgeEverAutoLoginURL "http://127.0.0.1:8787" \
  -EdgeEverAutoLoginUser admin \
  -EdgeEverAutoLoginPassword "$EDGE_EVER_AUTH_PASSWORD"
```

## Versioning

| Field | File | Notes |
| --- | --- | --- |
| `MARKETING_VERSION` | `Config/Version.xcconfig` | Align with monorepo release `X.Y.Z` on store submissions |
| `CURRENT_PROJECT_VERSION` | `Config/Version.xcconfig` | Local floor for build numbers |

**Xcode Cloud** stamps `CFBundleVersion` from App Store Connect → Xcode Cloud → **Build Number** (not only this file). Before a Cloud store run, set that counter **above** the latest ASC build (`Scripts/ensure-xcode-cloud-build-number.sh` prints the recommended value).

## App Store archive

### Preferred: Xcode Cloud

If the Mac runs **macOS beta**, local archives are rejected by App Store Connect (**ITMS-90111**) even with release Xcode. Day-to-day development stays local; **only store / TestFlight binaries** should use **Xcode Cloud** (25 compute hours/month with Apple Developer Program). Formal Releases start Cloud through store-delivery; keep the Cloud workflow start condition **Manual** so git pushes do not consume hours.

- Setup and workflow: **[`docs/ios-xcode-cloud.md`](../../docs/ios-xcode-cloud.md)**
- Cloud hooks: `ci_scripts/ci_post_clone.sh` → `ci_pre_xcodebuild.sh` → `ci_post_xcodebuild.sh`
- Workflow start condition must stay **Manual** so hours are not burned on every push
- Put ASC API secrets in Xcode Cloud **shared environment variables** so `ci_post_xcodebuild.sh` auto-uploads the App Store IPA

```sh
# Before Start Build (optional but recommended)
cd apps/ios
bash Scripts/ensure-xcode-cloud-build-number.sh

# If Cloud produced ARCHIVE_EXPORT but ASC has no build:
bash Scripts/upload-app-store-ipa.sh /path/to/EdgeEver-*-app-store.zip
```

### Local archive (release macOS only)

Use the stable Xcode app (not beta) on a **non-beta** host OS:

```sh
cd apps/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer bash Scripts/archive-app-store.sh
bash Scripts/upload-app-store-ipa.sh build/export/EdgeEver.ipa
```

On a beta host the script **exits** unless you set `EDGE_EVER_IOS_ALLOW_BETA_HOST=1` (upload will still likely fail ASC).

Signing in the Xcode project is **Automatic** (Cloud-friendly). Local export still uses `ExportOptions.plist` with App Store profiles. Then submit the exact build with:

```sh
cd apps/ios
APP_STORE_VERSION=X.Y.Z APP_STORE_BUILD_NUMBER=N \
APP_STORE_CONNECT_API_KEY_ID=... \
APP_STORE_CONNECT_API_ISSUER_ID=... \
APP_STORE_CONNECT_API_KEY_P8_BASE64=... \
fastlane ios submit_review
```

## Regenerating the Xcode project

Edit `project.yml`, then:

```sh
xcodegen generate
```
