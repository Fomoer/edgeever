# Region clipping verification

[简体中文](README.zh-CN.md)

## Browser interaction and content

The actual built popup and `region-clip.js` were exercised in Ego Lite Chromium on an isolated page. `serve-ui.mjs` supplies the browser-extension message boundary and records save payloads; it does not use a real instance or installed extension. Run `bun run build:extension`, then `bun docs/changes/evidence/2026-10-29-region-clip/serve-ui.mjs` and visit `http://127.0.0.1:18703/` to reproduce the UI fixture.

- Pointer preview, lock, Left/Right expansion/history, Up/Down sibling selection, Enter save and source link suppression worked. After cancellation the original link handler worked again, without creating a note.
- Selected output preserved headings, links, a table, code blank lines and the image URL. Navigation, the intro, the next section, CSS/HTML-hidden text and input values were absent from the selected payload. See `browser-captures.json`.
- Repeated activation left one picker. Scrolling kept the outline at the selected element's rectangle (observed top: `-57.4844px`, element: `-57.484375px`).
- A controlled save failure retained the region and showed the error. Repeated Enter while the save response was held produced exactly one completed save. Removed regions and changed URLs produced no write. Replacing the hovered DOM before clicking selected the new click target, not the stale element.
- At a 390px viewport (`https://aihot.news/`), the toolbar occupied x=12–378, width=366, and bottom=824 inside height=844 (`x=12–363, width=351, bottom=809` at 375px available width on the local fixture). See `selected-390px.png`; `selected-desktop.png` and `popup.png` show the desktop card selection and popup entry on `https://aihot.news/`. Shadow-root translation and sizing were corrected during inspection.

## Source and build checks

- Nine initial checks failed before implementation because the new popup action, content conversion and background handler did not exist.
- The final affected check set passed: **149 tests**, 0 failures (`affected-tests.txt`), including actual bundled-background memo creation and image upload/rewrite with mocked HTTP boundaries. New sender/frame validation, indivisible container shrinking, and injection-without-write checks passed.
- The first aggregate extension command passed 505 checks but timed out in the first React popup test at its 5-second limit; two following popup checks then encountered overlapping `act()` state. The isolated popup file passed all 9 checks, and the final 149-test affected run also passed. Unchanged extension checks were reused rather than rerunning the aggregate command.
- `bun run typecheck`, `bun run typecheck:mobile`, `bun run build:web`, targeted oxlint, Chromium and Firefox builds passed. Firefox lint: 0 errors, 0 notices, 10 bundled-library warnings (`firefox-lint.txt`), including React DOM's static innerHTML warnings in the added self-contained bundle; no warning was suppressed.

Installed Chrome/Edge/Firefox runtime acceptance and saving to a real instance remain unverified. The source changes are local, uncommitted and unpushed; no store submission or deployment was performed.
