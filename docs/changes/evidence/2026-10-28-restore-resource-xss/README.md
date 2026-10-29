# Resource MIME browser acceptance

[简体中文](README.zh-CN.md)

[`browser-results.json`](browser-results.json) records Chromium checks through the real EdgeEver API, using isolated SQLite/filesystem storage on loopback. The content was synthetic and contained no scripts or credentials.

- Historical image, audio and video records with multiple declared MIME types produced `application/octet-stream` attachment responses. Chromium emitted successful download events for all three rather than parsing their HTML bodies as pages.
- A quoted UTF-16LE SVG retained its charset and quoted comma/semicolon parameter, remained `image/svg+xml` with sandbox CSP, and exposed the expected `旧备份` text in the SVG document.
- A PNG with a quoted comma parameter remained `image/png` and decoded to its original one-pixel width.

The [API regressions](../../../../apps/api/src/resource-restore-security.test.mjs) additionally cover all three blob routes, rejected legacy/resumable restores, old upload completion, storage metadata, hidden control characters, and unchanged stored metadata. Run `bun test apps/api/src/resource-restore-security.test.mjs` to repeat those checks.

The browser checks do not exercise a deployed Cloudflare/R2 instance or other browser/native engines. The Worker bundle is checked separately. The temporary browser task and fixture service are closed after acceptance.
