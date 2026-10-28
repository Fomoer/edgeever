# Custom address for single-note share links

[简体中文](2026-10-27-memo-share-custom-address.zh-CN.md)

## Problem and outcome

Implements [Issue #691](https://github.com/tianma-if/edgeever/issues/691). A single-note share link is always `/share/<43-character random token>`. It is safe but cannot be read aloud, typed or remembered. The owner can now give an active note share an optional custom address, for example `/share/meeting-notes`, from the share dialog. The random token link keeps working, so links that were already sent and clients that do not know the new field are unaffected.

## Behavior

| ID | Behavior | Acceptance |
| --- | --- | --- |
| S01 | Migration `0081` adds a nullable `memo_shares.slug` with a partial unique index and a `memo_share_slug_claims` table. Existing rows keep their token, password and unlock state; `slug` starts as `NULL`. | Upgrading a database with existing password-protected and public shares keeps both reachable by token. |
| S02 | `PATCH /api/v1/memos/:id/share` accepts `slug` (string or `null`) in addition to `passwordProtected`; at least one is required. Slugs are trimmed and lowercased, 3–40 characters of `a-z`, `0-9` and single inner hyphens, and `notebook` is reserved. Invalid input returns 400; an address used by any other share on the instance returns 409 `share_slug_taken`. The first workspace to claim an address keeps it in `memo_share_slug_claims` even after it is cleared or the share is revoked, so another tenant cannot take over links that were already sent. | API tests cover valid, invalid, reserved, duplicate, unchanged and empty payloads, and a cross-workspace claim after release. |
| S03 | Public note routes and the server-rendered `/share/<address>` page and `/share/<address>.md` resolve either the token or the slug to the same share. Only the slug is lowercased on lookup, so `/share/Meeting-Notes` opens `meeting-notes`; the token stays case-sensitive. Password-protected notes stay out of the HTML and Markdown. Password gates, rate limits and attachment checks are unchanged. The unlock cookie is scoped to the address the visitor used. Links between public notes prefer the custom address. | API tests unlock through the slug and then read the note and an attachment; token links still work. Share page tests cover a slug in HTML and Markdown, mixed case and a password-protected slug. |
| S04 | Changing or clearing the address retires the previous one immediately; revoking the share retires both. | API tests check 404 for retired addresses. |
| S05 | The web share dialog shows a "Custom address" field with validation, a save action and a remove action with a Tooltip. The "already in use" message clears as soon as the field changes. The dialog link, copy action and the settings share list use the custom address when set. Copy is in all shipped locales. | Type check and web build; manual check in the running app. |

Android and iOS keep showing the token link, which remains valid. They can adopt the `slug` field later.

## Risk and rollback

Worst case: a short custom address is easier to guess than a random token, so the hint states this and password protection still applies. Rolling back the application leaves the additive column in place; custom addresses stop resolving and token links keep working. No existing migration is modified.
