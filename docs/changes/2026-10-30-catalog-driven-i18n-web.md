# Issue 606 catalog-driven localization (Web and desktop)

[简体中文](2026-10-30-catalog-driven-i18n-web.zh-CN.md)

Requirements: [Issue #606](https://github.com/tianma-if/edgeever/issues/606). Guide: [Localization](../i18n.md).

## Problem and outcome

Several surfaces chose text by comparing language strings, so only Chinese and English were covered and adding a language required code edits. Text now comes from catalogs keyed by locale code for all five languages (zh-CN, en-US, ja, pl, ru). Android and iOS are out of scope and follow in later PRs.

## Behavior

| ID | Behavior | Acceptance |
| --- | --- | --- |
| L01 | Desktop dialogs (page crash, startup failure, update ready, installation, instance switch), the application and edit menus, the Windows "Send to" label, the backup notification and the screenshot note title appear in all five languages. Japanese and Russian previously got English menus. | `desktop-copy.test.mjs`: same keys and placeholders in every locale, resolver agrees with the shared one; menu key parity for all five in `edit-context-menu.test.mjs`. |
| L02 | Web error screens (note, page, AI sidebar, mobile editor) use the language chosen in the app, not the OS or browser language, with English before the app language is ready. Polish and Japanese users previously saw Chinese on the mobile editor error screen. | `error-screen-copy.test.mjs`; `errorScreens` keys in all five catalogs. |
| L03 | AI companion replies and discovery reply language cover all five, including Russian. The server accepts `ru`; the client still sends `en-US` for a Russian UI for compatibility with older servers, and Russian messages are detected by script. | Schema accepts `ru`; reply-language tests for each locale and Cyrillic detection. |
| L04 | Diagram type labels and inline field chips (`[due:: …]`, priorities) follow the app language for all five; Japanese users previously saw Chinese diagram labels. Bundled content that exists only in Chinese and English (Evernote guide, demo notebook, samples) is chosen by one helper: Chinese for a Chinese UI, English otherwise — Japanese, Polish and Russian users previously got the Chinese guide and demo notebook. | `inline-fields.test.mjs`, `bilingual-content-locale.test.mjs`; new `inlineField` catalog keys. |
| L05 | `hardcoded-locale-guard.test.mjs` next to the shared catalogs rejects new language comparisons outside i18n code. Each exception (subtitle tracks, sample data, Chinese ordinals, compatibility mapping) is listed with its reason. | The test passes on the tree and fails on an injected `locale === "pl"`. |

## Risk and rollback

Text-only change: no data, API contract, storage or migration changes. The companion schema now also accepts `ru` (more permissive; older clients are unaffected). Rollback: revert the change.

Not verified: interactive checks on Windows and Linux desktop; Japanese and Russian translations were written without native-speaker review.
