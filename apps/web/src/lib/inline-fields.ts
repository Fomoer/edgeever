/** Resolves a catalog key such as `inlineField.label.due` in the current UI locale. */
export type InlineFieldTranslate = (catalogKey: string) => string;

export type InlineFieldMatch = {
  from: number;
  to: number;
  key: string;
  value: string;
};

const FIELD_LABEL_KEYS = new Set([
  "due",
  "scheduled",
  "start",
  "completion",
  "created",
  "cancelled",
  "priority",
  "repeat",
  "id",
  "dependsOn",
  "onCompletion",
]);

const PRIORITY_VALUE_KEYS = new Set(["highest", "high", "medium", "low", "lowest"]);

export const INLINE_FIELD_PATTERN = /\[([A-Za-z][A-Za-z0-9_-]*)::\s*([^\]]+?)\]/g;

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

export const formatInlineFieldChip = (key: string, value: string, translate: InlineFieldTranslate) => {
  const label = FIELD_LABEL_KEYS.has(key) ? translate(`inlineField.label.${key}`) : key;
  const priority = value.toLowerCase();
  const displayValue = key === "priority" && PRIORITY_VALUE_KEYS.has(priority)
    ? translate(`inlineField.priority.${priority}`)
    : value;
  return `${label} ${displayValue}`;
};

export const rangesOverlap = (from: number, to: number, cursor: number) => cursor >= from && cursor <= to;
