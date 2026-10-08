// Native editing context menu for the desktop renderer.
//
// Electron does not show any context menu by default, so right-clicking a text
// field in the desktop app did nothing while the same page in a browser offers
// Cut / Copy / Paste / Paste as plain text. This module only restores that
// standard browser parity; it intentionally adds no app-specific commands.
//
// Chromium emits `webContents` "context-menu" only when the page did not call
// `preventDefault()` on the DOM `contextmenu` event, so the web app's own
// context menus (images, memo cards, ...) keep working without interference.

const MAX_SPELLING_SUGGESTIONS = 5;

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Builds an Electron menu template from `context-menu` params.
 *
 * @param {object} params Electron `context-menu` params.
 * @param {object} copy Localized labels (see desktop-menu.mjs).
 * @param {object} actions Side effects: replaceMisspelling(word), addToDictionary(word), copyLink(url).
 * @returns {Array<object>} Menu template; empty when there is nothing to show.
 */
export const buildEditContextMenuTemplate = (params = {}, copy = {}, actions = {}) => {
  const editFlags = params.editFlags ?? {};
  const isEditable = params.isEditable === true;
  const hasSelection = hasText(params.selectionText);
  const sections = [];

  if (isEditable && hasText(params.misspelledWord)) {
    const suggestions = Array.isArray(params.dictionarySuggestions)
      ? params.dictionarySuggestions.filter(hasText).slice(0, MAX_SPELLING_SUGGESTIONS)
      : [];
    const misspelledWord = params.misspelledWord;
    sections.push([
      ...suggestions.map((suggestion) => ({
        label: suggestion,
        click: () => actions.replaceMisspelling?.(suggestion),
      })),
      {
        label: copy.addToDictionary,
        click: () => actions.addToDictionary?.(misspelledWord),
      },
    ]);
  }

  if (hasText(params.linkURL)) {
    const linkURL = params.linkURL;
    sections.push([
      {
        label: copy.copyLinkAddress,
        click: () => actions.copyLink?.(linkURL),
      },
    ]);
  }

  if (isEditable) {
    sections.push([
      { label: copy.cut, role: "cut", enabled: editFlags.canCut !== false },
      { label: copy.copy, role: "copy", enabled: editFlags.canCopy !== false },
      { label: copy.paste, role: "paste", enabled: editFlags.canPaste !== false },
      { label: copy.pasteAsPlainText, role: "pasteAndMatchStyle", enabled: editFlags.canPaste !== false },
    ]);
    sections.push([
      { label: copy.selectAll, role: "selectAll", enabled: editFlags.canSelectAll !== false },
    ]);
  } else if (hasSelection) {
    sections.push([
      { label: copy.copy, role: "copy", enabled: editFlags.canCopy !== false },
    ]);
  }

  return sections.flatMap((section, index) => (
    index === 0 ? section : [{ type: "separator" }, ...section]
  ));
};
