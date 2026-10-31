'use dom';

import { useEffect, useRef, useState } from "react";
import type { DOMProps } from "expo/dom";
import { isRemoteNoteImageFont, shouldLoadFontPreview } from "@edgeever/shared/font-catalog";
import { resolveNoteImageTypography, type NoteImageFontStyle, type NoteImageTheme } from "@edgeever/shared/note-image-card";
import { prepareNoteImageAssets } from "@edgeever/shared/note-image-fonts";
import { getMobileNoteImageFontLabel, MOBILE_FONT_OPTIONS, type NoteImageFontLabels } from "../lib/note-image-font-options";
import { noteImageAssetUrls } from "./note-image-asset-urls";

export type MobileNoteImageFontPickerCopy = NoteImageFontLabels & {
  title: string;
  loadingPreview: string;
  previewUnavailable: string;
};

type Props = {
  selected: NoteImageFontStyle;
  theme: NoteImageTheme;
  /** Picks the Chinese sample sentence for CJK fonts; UI copy comes from `copy`. */
  chinese: boolean;
  copy: MobileNoteImageFontPickerCopy;
  onSelect: (font: NoteImageFontStyle) => Promise<void>;
  dom?: DOMProps;
};

// Latin-only fonts need Latin characters to make their appearance comparable.
const LATIN_FONTS = new Set(["anton", "inter", "dmserif", "bebas", "spacegrotesk", "jetbrains", "mono"]);

export default function MobileNoteImageFontPicker({ selected, theme, chinese, copy, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);
  const [previews, setPreviews] = useState<Record<string, "ready" | "error">>({});
  const sampleFor = (id: string) => chinese && !LATIN_FONTS.has(id) ? "记录此刻的灵感" : "Capture a little inspiration";

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let active = true;
    setPreviews({});
    list.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "center" });
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const id = entry.target.getAttribute("data-font") as NoteImageFontStyle;
        if (!shouldLoadFontPreview(id, id === selected)) continue;
        const text = chinese && !LATIN_FONTS.has(id) ? "记录此刻的灵感" : "Capture a little inspiration";
        void prepareNoteImageAssets({ theme, fontStyle: id, text, urls: noteImageAssetUrls, embed: false })
          .then(() => { if (active) setPreviews(previous => ({ ...previous, [id]: "ready" })); })
          .catch(() => { if (active) setPreviews(previous => ({ ...previous, [id]: "error" })); });
      }
    }, { root: list });
    list.querySelectorAll("[data-font]").forEach(node => observer.observe(node));
    return () => { active = false; observer.disconnect(); };
    // The selection is fixed during this panel's lifetime; selecting closes it.
  }, [theme, chinese, selected]);

  return (
    <>
      <style>{`
        html, body, #root { margin: 0; height: 100%; background: #fff; }
        * { box-sizing: border-box; }
        .font-list { height: 100dvh; overflow-y: auto; overscroll-behavior: contain; font-family: system-ui, sans-serif; padding: 0 0 12px; }
        .font-option { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 88px; padding: 14px 12px; border: 0; border-bottom: 1px solid #e2e8f0; background: #fff; text-align: left; color: #0f172a; }
        .font-option[aria-checked="true"] { background: #ecfdf5; }
        .font-option:focus-visible { outline: 2px solid #16a06e; outline-offset: -2px; }
        .font-option-copy { min-width: 0; }
        .font-name { display: block; font: 600 14px/1.5 system-ui, sans-serif; }
        .font-sample { display: block; margin-top: 6px; font-size: 20px; line-height: 1.5; overflow-wrap: anywhere; }
        .font-status { display: block; margin-top: 6px; color: #64748b; font: 13px/1.5 system-ui, sans-serif; }
        .font-check { flex: 0 0 24px; color: #16a06e; font: 700 24px/1 system-ui, sans-serif; }
      `}</style>
      <div className="font-list" role="radiogroup" aria-label={copy.title} ref={listRef}>
        {MOBILE_FONT_OPTIONS.map(item => {
          const label = getMobileNoteImageFontLabel(item.id, theme, copy, true);
          const loaded = previews[item.id] === "ready";
          const failed = previews[item.id] === "error";
          const needsFont = item.id === "auto" || isRemoteNoteImageFont(item.id);
          const previewEnabled = shouldLoadFontPreview(item.id, item.id === selected);
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected === item.id}
              aria-label={label}
              className="font-option"
              data-font={item.id}
              onClick={async () => {
                if (selectingRef.current) return;
                selectingRef.current = true;
                try { await onSelect(item.id); } finally { selectingRef.current = false; }
              }}
            >
              <span className="font-option-copy">
                <span className="font-name">{label}</span>
                {loaded || !needsFont || !previewEnabled ? (
                  <span className="font-sample" style={previewEnabled ? { fontFamily: resolveNoteImageTypography(theme, item.id).bodyFamily } : undefined}>{sampleFor(item.id)}</span>
                ) : (
                  <span className="font-status">{failed
                    ? copy.previewUnavailable
                    : copy.loadingPreview}</span>
                )}
              </span>
              <span className="font-check" aria-hidden="true">{selected === item.id ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
