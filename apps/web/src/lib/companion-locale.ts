import { companionTurnLocale } from "@edgeever/shared";

// Servers before Russian companion support reject "ru", so a Russian interface
// still sends English; the server answers Russian messages in Russian.
export function companionLocale(language?: string): "zh-CN" | "en-US" | "ja" | "pl" {
  const locale = companionTurnLocale(language);
  return locale === "ru" ? "en-US" : locale;
}
