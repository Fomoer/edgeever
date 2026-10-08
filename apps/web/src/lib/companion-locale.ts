export function companionLocale(language?: string): "zh-CN" | "en-US" | "ja" | "pl" {
  if (language?.startsWith("zh")) return "zh-CN";
  if (language?.startsWith("ja")) return "ja";
  if (language?.startsWith("pl")) return "pl";
  return "en-US";
}
