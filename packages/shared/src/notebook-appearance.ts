import type { Notebook } from "./types";

export type NotebookAppearance = Pick<Notebook, "icon" | "color" | "textColor" | "isBold" | "iconInverted" | "rowInverted">;
export const NOTEBOOK_COLOR_TARGETS = ["icon", "name", "both"] as const;
export const NOTEBOOK_COLORS = ["#475569", "#dc2626", "#ea580c", "#ca8a04", "#65a30d", "#16a34a", "#0d9488", "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#db2777"] as const;
export const NOTEBOOK_ICON_CATEGORIES = ["general", "work", "technology", "life", "finance", "leisure"] as const;
export const NOTEBOOK_ICONS = [
  { id: "notebook", category: "general", keywords: "notizbuch notizen notes book" },
  { id: "book-open", category: "general", keywords: "buch lesen wissen reading" },
  { id: "folder", category: "general", keywords: "ordner sammlung" },
  { id: "archive", category: "general", keywords: "archiv ablage" },
  { id: "inbox", category: "general", keywords: "eingang sammeln" },
  { id: "star", category: "general", keywords: "stern favorit wichtig" },
  { id: "bookmark", category: "general", keywords: "lesezeichen merken" },
  { id: "lightbulb", category: "general", keywords: "idee gedanke" },
  { id: "briefcase", category: "work", keywords: "arbeit beruf job" },
  { id: "building-2", category: "work", keywords: "firma büro arbeitgeber office" },
  { id: "clipboard-list", category: "work", keywords: "aufgaben liste tasks" },
  { id: "calendar", category: "work", keywords: "kalender termine geburtstag" },
  { id: "target", category: "work", keywords: "ziel plan" },
  { id: "graduation-cap", category: "work", keywords: "lernen studium weiterbildung" },
  { id: "file-text", category: "work", keywords: "dokument lebenslauf vertrag" },
  { id: "presentation", category: "work", keywords: "präsentation vortrag" },
  { id: "network", category: "technology", keywords: "netzwerk heimnetz vlan" },
  { id: "server", category: "technology", keywords: "server dienste homelab" },
  { id: "monitor", category: "technology", keywords: "computer pc gerät" },
  { id: "wifi", category: "technology", keywords: "wlan internet netz" },
  { id: "smartphone", category: "technology", keywords: "handy telefon mobil" },
  { id: "code", category: "technology", keywords: "programmieren software entwicklung" },
  { id: "database", category: "technology", keywords: "datenbank daten" },
  { id: "cpu", category: "technology", keywords: "hardware technik" },
  { id: "shield", category: "technology", keywords: "sicherheit firewall vpn" },
  { id: "bot", category: "technology", keywords: "assistent ki ai personal assistant" },
  { id: "house", category: "life", keywords: "haus wohnen zuhause home" },
  { id: "heart", category: "life", keywords: "liebe gesundheit beziehung" },
  { id: "users", category: "life", keywords: "menschen freunde kontakte familie" },
  { id: "gift", category: "life", keywords: "geschenk geburtstag" },
  { id: "baby", category: "life", keywords: "kind familie" },
  { id: "paw-print", category: "life", keywords: "tier haustier hund katze" },
  { id: "utensils", category: "life", keywords: "essen kochen ernährung rezept" },
  { id: "wrench", category: "life", keywords: "werkzeug wartung reparatur" },
  { id: "car", category: "life", keywords: "auto mobilität fahrzeug" },
  { id: "activity", category: "life", keywords: "gesundheit sport bewegung" },
  { id: "wallet", category: "finance", keywords: "finanzen geld budget" },
  { id: "landmark", category: "finance", keywords: "bank behörde verwaltung" },
  { id: "chart-line", category: "finance", keywords: "aktien kurs etf börse" },
  { id: "bitcoin", category: "finance", keywords: "bitcoin krypto" },
  { id: "receipt", category: "finance", keywords: "rechnung belege steuer" },
  { id: "piggy-bank", category: "finance", keywords: "sparen vorsorge" },
  { id: "plane", category: "leisure", keywords: "reise urlaub flug" },
  { id: "map", category: "leisure", keywords: "karte reise ort" },
  { id: "camera", category: "leisure", keywords: "foto fotografie erinnerung" },
  { id: "music", category: "leisure", keywords: "musik hobby" },
  { id: "gamepad-2", category: "leisure", keywords: "spiel gaming freizeit" },
  { id: "bike", category: "leisure", keywords: "fahrrad rad sport" },
  { id: "dumbbell", category: "leisure", keywords: "training fitness sport" },
  { id: "newspaper", category: "general", keywords: "news nachrichten rss" },
  { id: "globe", category: "general", keywords: "welt internet web" },
  { id: "coffee", category: "leisure", keywords: "kaffee café freizeit" },
] as const;

export const searchNotebookIcons = (query: string, category = "all") => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return NOTEBOOK_ICONS.filter(icon => (category === "all" || icon.category === category) &&
    words.every(word => `${icon.id} ${icon.keywords}`.toLocaleLowerCase().includes(word)));
};

export const isNotebookColor = (color: unknown): color is string =>
  typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);

const luminance = (rgb: number[]) => rgb.map(value => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

/** Preserve the selected hue while ensuring text contrast against the sidebar selection. */
export const readableNotebookColor = (color: string, dark: boolean): string => {
  if (!isNotebookColor(color)) return "inherit";
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const background = luminance(dark ? [51, 54, 56] : [221, 227, 233]);
  for (let step = 0; step <= 100; step++) {
    const channels = rgb.map(channel => Math.round(channel + ((dark ? 255 : 0) - channel) * step / 100));
    const foreground = luminance(channels);
    if ((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) >= 4.5) {
      return "#" + channels.map(channel => channel.toString(16).padStart(2, "0")).join("");
    }
  }
  return dark ? "#ffffff" : "#000000";
};
