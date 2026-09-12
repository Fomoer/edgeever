export type InlineFieldLanguage = "en" | "zh";

export type InlineFieldMatch = {
  from: number;
  to: number;
  key: string;
  value: string;
};

const FIELD_LABELS: Record<string, Record<InlineFieldLanguage, string>> = {
  due: { en: "Due", zh: "截止" },
  scheduled: { en: "Scheduled", zh: "计划" },
  start: { en: "Start", zh: "开始" },
  completion: { en: "Done", zh: "完成" },
  created: { en: "Created", zh: "创建" },
  cancelled: { en: "Cancelled", zh: "取消" },
  priority: { en: "Priority", zh: "优先级" },
  repeat: { en: "Repeat", zh: "重复" },
  id: { en: "ID", zh: "ID" },
  dependsOn: { en: "Depends", zh: "依赖" },
  onCompletion: { en: "On completion", zh: "完成后" },
};

const PRIORITY_VALUES: Record<string, Record<InlineFieldLanguage, string>> = {
  highest: { en: "Highest", zh: "最高" },
  high: { en: "High", zh: "高" },
  medium: { en: "Medium", zh: "中" },
  low: { en: "Low", zh: "低" },
  lowest: { en: "Lowest", zh: "最低" },
};

export const INLINE_FIELD_PATTERN = /\[([A-Za-z][A-Za-z0-9_-]*)::\s*([^\]]+?)\]/g;

export const languageFromLocale = (locale: string): InlineFieldLanguage =>
  locale.toLowerCase().startsWith("zh") ? "zh" : "en";

export const findInlineFields = (text: string): InlineFieldMatch[] => {
  const fields: InlineFieldMatch[] = [];
  const pattern = new RegExp(INLINE_FIELD_PATTERN.source, "g");
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    fields.push({
      from: match.index,
      to: match.index + match[0].length,
      key: match[1],
      value: match[2].trim(),
    });
  }
  return fields;
};

export const formatInlineFieldChip = (key: string, value: string, language: InlineFieldLanguage) => {
  const label = FIELD_LABELS[key]?.[language] ?? key;
  const displayValue = key === "priority"
    ? (PRIORITY_VALUES[value.toLowerCase()]?.[language] ?? value)
    : value;
  return `${label} ${displayValue}`;
};

export const rangesOverlap = (from: number, to: number, cursor: number) => cursor >= from && cursor <= to;
