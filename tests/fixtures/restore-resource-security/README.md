# Previous-release restore fixture

[简体中文](README.zh-CN.md)

`v2.12.0.zip` was generated with `createEdgeEverZip` extracted using `git archive v2.12.0 packages/shared`, from official release commit `eeaab088f41d0417fbce2266f58ff4adde7f5d76`. The released exporter ran directly under Bun with the installed lockfile dependencies; the patched exporter was not used. `source.json` records its synthetic inputs and attachment bytes.

The archive contains one notebook, one pinned/tagged note, one historical revision, a PNG, an inert SVG, an image with null MIME, and a downloadable HTML attachment. The null-MIME image uses a `.bin` filename to exercise the existing binary fallback without file-extension MIME inference. It has no credentials, user data, scripts, or external requests. The security regression test restores this frozen archive through both legacy and resumable APIs and reads the resulting data and bytes back.

Run: `bun test apps/api/src/resource-restore-security.test.mjs`.
