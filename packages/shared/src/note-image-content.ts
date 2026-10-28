import { parseImageWidth } from "./image-display";

/** Prepare an export-only clone; never pass the live editor DOM here. */
export const prepareNoteImageContent = (root: HTMLElement): void => {
  root.querySelectorAll("button, .edgeever-image-panel, .edgeever-image-controls, .edgeever-code-copy-button, .edgeever-image-size-controls, .edgeever-native-gallery-toolbar, .column-resize-handle").forEach(element => element.remove());
  root.querySelectorAll(".edgeever-native-gallery-content").forEach(content => content.replaceWith(...Array.from(content.childNodes)));
  const releaseDimensions = (element: HTMLElement) => {
    for (const property of ["width", "min-width", "max-width", "height", "min-height", "max-height", "overflow", "overflow-x", "overflow-y"]) element.style.removeProperty(property);
  };
  root.querySelectorAll<HTMLElement>(".tableWrapper, .edgeever-image-node, [data-edgeever-image-gallery], .edgeever-code-block, .edgeever-code-source").forEach(element => {
    const imageWidth = element.matches(".edgeever-image-node") && !element.closest("[data-edgeever-image-gallery]")
      ? parseImageWidth(element.getAttribute("data-width") ?? element.style.width) : null;
    releaseDimensions(element);
    if (imageWidth !== null) element.style.width = `${imageWidth}%`;
  });
  root.querySelectorAll<HTMLImageElement>("img").forEach(image => {
    const percent = (image.style.width || image.style.maxWidth).match(/^(\d+(?:\.\d+)?)%$/)?.[1];
    releaseDimensions(image);
    image.removeAttribute("width");
    image.removeAttribute("height");
    image.style.setProperty("max-width", percent ? `${Math.min(100, Math.max(1, Number(percent)))}%` : "100%", "important");
  });
  root.querySelectorAll<HTMLTableElement>("table").forEach(table => {
    releaseDimensions(table);
    table.removeAttribute("width");
    table.querySelectorAll<HTMLElement>("colgroup, col").forEach(column => column.remove());
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr")).filter(row => row.closest("table") === table);
    const cells = rows.map(row => Array.from(row.children).filter((cell): cell is HTMLTableCellElement => /^(TH|TD)$/.test(cell.tagName)));
    for (const row of cells) for (const cell of row) {
      releaseDimensions(cell);
      cell.removeAttribute("width");
      cell.removeAttribute("colwidth");
    }
    if (table.hasAttribute("data-edgeever-export-table")) return;
    const headings = cells[0];
    // Reflow only simple, header-labelled wide tables. Preserve merged-cell
    // tables as tables rather than guessing which label belongs to a value.
    if (!headings || headings.length <= 4 || !headings.every(cell => cell.tagName === "TH" && cell.textContent?.trim())
      || cells.length < 2 || !cells.every(row => row.length === headings.length && row.every(cell =>
        Number(cell.getAttribute("colspan") || 1) === 1 && Number(cell.getAttribute("rowspan") || 1) === 1))) return;
    const labels = headings.map(cell => cell.textContent!.trim());
    table.setAttribute("data-edgeever-export-table", "stacked");
    rows[0]!.setAttribute("data-edgeever-export-header", "true");
    for (const row of cells.slice(1)) row.forEach((cell, index) => {
      const label = root.ownerDocument.createElement("span");
      label.className = "edgeever-table-label";
      label.textContent = labels[index]!;
      const value = root.ownerDocument.createElement("div");
      value.className = "edgeever-table-value";
      while (cell.firstChild) value.appendChild(cell.firstChild);
      cell.appendChild(label);
      cell.appendChild(value);
    });
  });
};
