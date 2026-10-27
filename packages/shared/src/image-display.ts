export const DEFAULT_IMAGE_WIDTH_PERCENT = 72;
export const MIN_IMAGE_WIDTH_PERCENT = 25;
export const MAX_IMAGE_WIDTH_PERCENT = 100;

export const IMAGE_WIDTH_PRESETS = [
  { id: "small", width: 35, labelKey: "editor.imageSizeSmall" },
  { id: "medium", width: 50, labelKey: "editor.imageSizeMedium" },
  { id: "large", width: 72, labelKey: "editor.imageSizeLarge" },
  { id: "full", width: 100, labelKey: "editor.imageSizeFull" },
] as const;

/** New uploads, and images with no stored width, use the large preset (较大). */
export const NEW_IMAGE_WIDTH_PERCENT = IMAGE_WIDTH_PRESETS.find((preset) => preset.id === "large")!.width;

/**
 * Phone columns are already narrow. A desktop percent such as 35% ("较小")
 * paints a stamp there, and the image action button covers most of it.
 * At or below this viewport, images fill the column. The stored percent stays
 * in the note for wide layouts.
 */
export const PHONE_IMAGE_FILL_MAX_WIDTH_PX = 640;

/**
 * `!important` overrides the inline percent on the image figure.
 * `screen` leaves print on the stored percent.
 * Share-as-image cards (`.edgeever-image-card`) keep the stored percent:
 * they are a fixed-width document, not the phone column.
 */
export const PHONE_IMAGE_FILL_CSS = `
@media screen and (max-width: ${PHONE_IMAGE_FILL_MAX_WIDTH_PX}px) {
  :is(.edgeever-image-node, .edgeever-image-upload-result, .edgeever-image-upload-placeholder, .ProseMirror img[data-width]):not(.edgeever-image-card *) {
    width: 100% !important;
    max-width: 100% !important;
  }
}
`;

export const installPhoneImageFillStyle = () => {
  if (typeof document === "undefined") return;
  if (document.head.querySelector("style[data-edgeever-phone-image-fill]")) return;
  const style = document.createElement("style");
  style.dataset.edgeeverPhoneImageFill = "true";
  style.textContent = PHONE_IMAGE_FILL_CSS;
  document.head.appendChild(style);
};

export type ImageWidthPresetId = (typeof IMAGE_WIDTH_PRESETS)[number]["id"];

export const clampImageWidth = (width: number): number =>
  Math.min(MAX_IMAGE_WIDTH_PERCENT, Math.max(MIN_IMAGE_WIDTH_PERCENT, Math.round(width)));

export const parseImageWidth = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampImageWidth(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = /(\d+(?:\.\d+)?)/.exec(value);
  return match ? clampImageWidth(Number(match[1])) : null;
};
