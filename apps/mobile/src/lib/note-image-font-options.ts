import type { enUS } from "@edgeever/shared/i18n";
import { FONT_CATALOG, FONT_IDS } from "@edgeever/shared/font-catalog";
import { NOTE_IMAGE_TEMPLATE_TYPOGRAPHY, resolveTheme, type NoteImageTheme, type NoteImageFontStyle } from "@edgeever/shared/note-image-card";

type ImageShareCopy = typeof enUS.editor.imageShare;
type FontStyleLabelKey = keyof ImageShareCopy["fontStyles"];

/** Labels from the resolved locale's `editor.imageShare` catalog. */
export type NoteImageFontLabels = {
  readonly fontStyles: { readonly [K in FontStyleLabelKey]: string };
  readonly templateFonts: { readonly [K in keyof ImageShareCopy["templateFonts"]]: string };
};

export const MOBILE_FONT_OPTIONS: Array<{ id: NoteImageFontStyle; labelKey: FontStyleLabelKey }> = [
  ...(["auto", "kai", "serif", "sans", "mono"] as const).map((id) => ({ id, labelKey: id })),
  ...FONT_IDS.map(id => ({ id, labelKey: FONT_CATALOG[id].labelKey.split(".").pop() as FontStyleLabelKey })),
];

export const getMobileNoteImageFontLabel = (
  fontStyle: NoteImageFontStyle,
  theme: NoteImageTheme,
  labels: NoteImageFontLabels,
  includeFollowTheme = false,
): string => {
  const option = MOBILE_FONT_OPTIONS.find(item => item.id === fontStyle);
  const label = option ? labels.fontStyles[option.labelKey] : "";
  if (fontStyle !== "auto") return label;
  const themeFontLabel = NOTE_IMAGE_TEMPLATE_TYPOGRAPHY[resolveTheme(undefined, theme)].body
    .map(font => labels.templateFonts[font])
    .join(" / ");
  return includeFollowTheme ? `${label} (${themeFontLabel})` : themeFontLabel;
};
