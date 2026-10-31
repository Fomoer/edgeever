# Save only part of a webpage

[简体中文](browser-clipper-regions.zh-CN.md)

Open the EdgeEver extension and choose **Select area**. Move over the page to preview its content boundaries, then click the area you want to keep. The click selects the content instead of opening its links.

- **Larger / Smaller**, or **Left / Right**, adjusts the selected parent/child region.
- **Up / Down** moves to the previous/next visible sibling region.
- **Reselect** returns to pointer selection. **Cancel** or **Esc** exits without saving.
- **Save to EdgeEver**, or **Enter** after selecting, creates a note in the extension's configured notebook. Scroll normally to inspect a long selection before saving.

The note keeps the page title, source link, capture time and the chosen content as Markdown, including supported tables, code, links and images. It uses the existing image-localization process and its partial-image feedback. Hidden content and form controls are omitted. The original webpage is not edited. An empty or removed region produces an error rather than saving the whole page.

Saving disables repeated confirmation and cancellation until the request finishes. On failure, the picker keeps the selection and displays the error; it does not retry automatically.

The picker works on accessible HTTP(S) pages. Browser-internal pages and extension-store restrictions still apply. It selects DOM content, not screenshot rectangles or iframe interiors. The existing **Clip current page** and selected-text actions remain available.

## Reference and verification

The selection interaction and wrapper/history algorithm are adapted from [MaoXian Web Clipper](https://github.com/mika-cn/maoxian-web-clipper/blob/e69fbf9c04bad7051d3810e1cef4d82138f812df/src/js/content/ui.js). Its MIT notice is preserved in [third-party notices](../apps/extension/THIRD_PARTY_NOTICES.md) and included in built extension packages.

See the [change checklist](changes/2026-10-29-region-clip.md) for validation evidence and remaining platform checks. Build Chromium with `bun run build:extension` and load `apps/extension/dist` as an unpacked development extension; Firefox uses `bun run build:extension:firefox`. These builds do not update an installed extension or publish to a store.
