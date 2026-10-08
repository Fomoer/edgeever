# Mobile store assets

This directory contains the current EdgeEver store listing artwork, screenshots,
and metadata.

Listing copy is pasted in App Store Connect and Play Console. It is not uploaded
by `bun run publish:stores`. That command only delivers store binaries; adding
an incomplete Japanese locale there would block App Review.

The root-level artwork is used by Google Play:

- `feature-graphic.png`: 1024 × 500 feature graphic.
- `phone-*.jpg`: source mobile screenshots captured from the public demo workspace.
- `phone-*-1080x1920.jpg`: Play-ready portrait screenshots used for phone and tablet listing slots.

The `app-store/` directory contains the App Store metadata source of truth and
Apple-ready iPhone screenshots. Keep English, Simplified Chinese, and Japanese
metadata files aligned when changing listing content.

The `play/` directory contains Google Play listing copy for English, Simplified
Chinese, Japanese, and Polish.

## Publish a Japanese listing

Japanese in-app UI is not required. Japanese users currently see English chrome.
Reuse the existing screenshots.

### App Store Connect

1. Open the EdgeEver app → App Information.
2. Add the **Japanese** (`ja`) localization if it is missing.
3. Paste `app-store/metadata.ja.md` into name, subtitle, promotional text,
   description, keywords, URLs, and the current version's What's New.
4. Save. Do not attach this locale to a binary review until those fields are
   complete.

### Google Play Console

Play may already show Japanese from an earlier translation. Replace it with the
copy in this repository.

1. Open Grow → Store presence → Main store listing → Manage translations.
2. Add **Japanese (Japan)** if it is missing.
3. Paste `play/metadata.ja-JP.md` into title, short description, and full
   description.
4. Publish the store listing. This does not upload a new AAB.

## Publish a Polish Google Play listing

The Android app ships a Polish in-app UI. Reuse the existing screenshots.

1. Open Grow → Store presence → Main store listing → Manage translations.
2. Add **Polish (Poland)** if it is missing.
3. Paste `play/metadata.pl-PL.md` into title, short description, and full
   description.
4. Publish the store listing. This does not upload a new AAB.
