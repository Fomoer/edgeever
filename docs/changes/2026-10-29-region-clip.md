# Select a webpage region to clip

[简体中文](2026-10-29-region-clip.zh-CN.md) · [Issue #703](https://github.com/tianma-if/edgeever/issues/703)

## Problem and outcome

Automatic article extraction can include unrelated content. Add an explicit DOM-region picker to the browser extension so the user can save only the content they choose. Baseline: `a2342067`.

## Allowed changes and acceptance

1. Add **Select area** beside the existing popup capture action. Request the configured instance permission inside the click gesture, as today. Start the picker only on accessible HTTP(S) pages; surface existing access/configuration errors. Do not add browser permissions or persistent content scripts.
2. Highlight the content block under the pointer without changing source elements. Clicking locks the block, not its link or website action. Offer larger/smaller parent-child selection, reselect, save, and cancel. Follow MaoXian's keyboard model: Left/Right expands/shrinks, Up/Down selects adjacent visible siblings, Enter confirms a locked selection, and Escape leaves before saving. Reuse its wrapper normalization and parent-child history algorithm with MIT attribution (reference `e69fbf9c`, `src/js/content/ui.js`); omit its source-DOM hiding and saved-selector subsystem. Keep page scrolling available. Reinjection replaces the previous picker. Cancel/reinjection removes its UI/listeners and restores focus; neither creates a note.
3. Only an explicit save converts the selected, still-connected visible DOM into Markdown. Reuse the existing visible-content filter and HTML/table/code/link/image conversion; omit hidden content, scripts, form controls and extension UI. Keep the page title, source URL, capture time and existing image-localization behavior. Never fall back to the full page if the region is empty, removed or unreadable. Do not capture iframe interiors, screenshots or off-page private content.
4. Save through the existing notebook selection, memo creation, serialization queue and image pipeline. Validate the content-script sender and unchanged source page before writing. Disable duplicate confirmation while saving; show conversion/save failures with the selected area retained, and reuse existing success/partial-image feedback. No automatic retries. Cancellation is available before save, not after a write has begun.
5. Reuse the shared extension buttons/theme in a Shadow DOM toolbar; localize every new string in English, Simplified Chinese, Japanese and Polish. Add only the injection/build wiring needed for this entry, plus bilingual usage documentation. Keep current page/selection/platform capture behavior unchanged.

Acceptance: first add focused popup/background/capture checks for the new path; exercise the built picker in a real browser with selection, adjustment, scrolling, cancellation, repeated activation, visible-content conversion, failures and save readback. Inspect actual UI and verify a selected image uses the existing attachment pipeline. Run affected extension checks, Chromium/Firefox builds and Firefox lint, plus required root/mobile typechecks and Web build. Use isolated fixtures and storage, not user notes.

## Boundaries and risk

No API/schema/migration, authentication, backup, native client, main app release version, store submission, or deployment changes. The browser extension package version is bumped to `0.4.0` for this new capability. No new dependency.

The main risks are interference with webpage controls and saving the wrong region. The picker suppresses page activation only while selecting, shows the locked boundary, and checks the page again before saving. Revert the added popup/injection modules to roll back; notes already explicitly saved remain ordinary notes. Chromium and Firefox runtime compatibility must be reported separately from compilation.

## Completion

Items 1–5 are implemented and match the diff: popup action, attributed region-selection module and isolated toolbar, existing save/image pipeline, four locales, injection/build wiring, notices, usage documentation and extension version `0.4.0`. Duplicate activation replaces a selection-stage picker; during an in-flight save it keeps the original busy picker to prevent another confirmation. No permissions, API, schema, dependencies, main app release versions or original capture paths changed.

The final 149 affected checks, required typechecks/Web build, both extension builds and targeted lint passed. Browser fixture interactions and selected-content readback passed, including error/no-write paths and 390px layout. Firefox lint has 0 errors and 10 library warnings. [Evidence](evidence/2026-10-29-region-clip/README.md) records the initial aggregate popup timeout, successful affected rerun, actual test boundaries and screenshots. Installed-browser / real-instance acceptance remains outstanding. Changes are local and uncommitted; no push, publication or deployment.
