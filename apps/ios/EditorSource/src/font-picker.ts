import { FONT_IDS, isRemoteNoteImageFont, shouldLoadFontPreview } from "@edgeever/shared/font-catalog";
import { resolveNoteImageTypography, type NoteImageFontStyle, type NoteImageTheme } from "@edgeever/shared/note-image-card";
import { prepareNoteImageAssets } from "@edgeever/shared/note-image-fonts";
import { noteImageAssetUrls } from "@edgeever/shared/note-image-assets";

type PickerConfiguration = {
  selected: NoteImageFontStyle;
  theme: NoteImageTheme;
  dark: boolean;
  title: string;
  sample: string;
  latinSample: string;
  loading: string;
  unavailable: string;
  options: Array<{ id: NoteImageFontStyle; label: string }>;
};

type PickerWindow = Window & {
  EdgeEverFontPickerConfiguration?: PickerConfiguration;
  webkit?: { messageHandlers?: { fontPicker?: { postMessage: (message: unknown) => void } } };
};

const host = window as PickerWindow;
const config = host.EdgeEverFontPickerConfiguration;
const list = document.getElementById("font-list");

if (config && list) {
  const supported = new Set<string>(["auto", "kai", "serif", "sans", "mono", ...FONT_IDS]);
  const latinFonts = new Set(["anton", "inter", "dmserif", "bebas", "spacegrotesk", "jetbrains", "mono"]);
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: ${config.dark ? "dark" : "light"}; font: -apple-system-body; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: ${config.dark ? "#111c18" : "#ffffff"}; color: ${config.dark ? "#f8fafc" : "#0f172a"}; }
    #font-list { padding: 0 16px max(16px, env(safe-area-inset-bottom)); }
    .font-option { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 88px; padding: 14px 12px; border: 0; border-bottom: 1px solid ${config.dark ? "#26382f" : "#e2e8f0"}; background: transparent; color: inherit; text-align: left; font: inherit; }
    .font-option[aria-checked="true"] { background: ${config.dark ? "#0b3328" : "#ecfdf5"}; }
    .font-option:focus-visible { outline: 2px solid #16a06e; outline-offset: -2px; }
    .font-copy { min-width: 0; }
    .font-name { display: block; font: -apple-system-subheadline; font-weight: 600; }
    .font-sample { display: block; margin-top: 6px; font-size: 1.2rem; line-height: 1.5; overflow-wrap: anywhere; }
    .font-status { display: block; margin-top: 6px; color: ${config.dark ? "#94a3b8" : "#64748b"}; font: -apple-system-footnote; }
    .font-check { flex: 0 0 24px; color: ${config.dark ? "#6ee7b7" : "#16a06e"}; font-size: 24px; font-weight: 700; }
  `;
  document.head.append(style);
  list.setAttribute("aria-label", config.title);
  const rows: Array<{ button: HTMLButtonElement; sample: HTMLSpanElement; id: NoteImageFontStyle; text: string }> = [];
  let choosing = false;

  for (const item of config.options) {
    if (!supported.has(item.id)) continue;
    const text = latinFonts.has(item.id) ? config.latinSample : config.sample;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "font-option";
    button.dataset.font = item.id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(item.id === config.selected));
    const copy = document.createElement("span");
    copy.className = "font-copy";
    const name = document.createElement("span");
    name.className = "font-name";
    name.textContent = item.label;
    const sample = document.createElement("span");
    const needsFont = item.id === "auto" || isRemoteNoteImageFont(item.id);
    const previewEnabled = shouldLoadFontPreview(item.id, item.id === config.selected);
    sample.className = needsFont && previewEnabled ? "font-status" : "font-sample";
    sample.textContent = needsFont && previewEnabled ? config.loading : text;
    if (!needsFont) sample.style.fontFamily = resolveNoteImageTypography(config.theme, item.id).bodyFamily;
    copy.append(name, sample);
    const check = document.createElement("span");
    check.className = "font-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = item.id === config.selected ? "✓" : "";
    button.append(copy, check);
    button.addEventListener("click", () => {
      const bridge = host.webkit?.messageHandlers?.fontPicker;
      if (choosing || !bridge) return;
      choosing = true;
      bridge.postMessage({ type: "select", id: item.id });
    });
    list.append(button);
    rows.push({ button, sample, id: item.id, text });
  }

  // Register only visible previews, using the exporter's existing byte cache.
  const byElement = new Map(rows.map(row => [row.button, row]));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const row = byElement.get(entry.target as HTMLButtonElement);
      if (!row) continue;
      if (!shouldLoadFontPreview(row.id, row.id === config.selected)) continue;
      void prepareNoteImageAssets({ theme: config.theme, fontStyle: row.id, text: row.text, urls: noteImageAssetUrls, embed: false })
        .then(() => {
          row.sample.className = "font-sample";
          row.sample.style.fontFamily = resolveNoteImageTypography(config.theme, row.id).bodyFamily;
          row.sample.textContent = row.text;
        })
        .catch(() => {
          row.sample.className = "font-status";
          row.sample.textContent = config.unavailable;
        });
    }
  });
  rows.forEach(row => observer.observe(row.button));
  list.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "center" });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  host.webkit?.messageHandlers?.fontPicker?.postMessage({ type: "ready" });
}
