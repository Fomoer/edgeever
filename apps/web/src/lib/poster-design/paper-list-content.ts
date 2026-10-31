import type { PosterDocument } from "@edgeever/shared";
import {
  legacyPosterSampleCopy,
  paperListSampleCopy,
  posterTemplateSampleCopy,
  type PosterTemplateCopy,
} from "./template-sample-copy";

export { legacyPosterSampleCopy, paperListSampleCopy, posterTemplateSampleCopy };

export function parsePaperListRow(row: string) {
  const [heading = "", ...lines] = row.split("\n");
  const match = /^(?:副标题[：:]|Subtitle:)\s*(.*)$/i.exec(lines[0] ?? "");
  return { heading, subtitle: match?.[1], body: (match ? lines.slice(1) : lines).join("\n") };
}

type Copy = PosterTemplateCopy;

const sameCopy = (a: Copy, b: Copy) =>
  a.title === b.title && a.subtitle === b.subtitle && a.badge === b.badge;

export function posterTemplateSelectionCopy(
  document: PosterDocument,
  copy: Copy,
  templateId: string,
  zh: boolean,
  starterCopy?: Pick<Copy, "title" | "subtitle">,
): Copy {
  const sample = paperListSampleCopy(zh);
  const previousSample = sample.subtitle.replace(/\n(?:副标题[：:]|Subtitle:)\s*[^\n]*\n/g, "\n");
  // Upgrade the previous bundled example only when every word is untouched.
  if (
    !document.sourceMemoId &&
    document.templateId === "paper-list" &&
    templateId === "paper-list" &&
    copy.title === sample.title &&
    copy.subtitle === previousSample &&
    !copy.badge
  ) {
    return sample;
  }
  // Only replace the editor's starter text or an untouched template sample.
  // Imported notes, structured sections, and user edits must never be overwritten.
  if (
    !starterCopy ||
    document.sourceMemoId ||
    document.elements.some((element) => /^(?:section|card)-\d+-/.test(element.id))
  ) {
    return copy;
  }
  const isStarter =
    copy.title === starterCopy.title &&
    copy.subtitle === starterCopy.subtitle &&
    !copy.badge;
  const isUntouchedCurrentSample = Boolean(
    document.templateId &&
      [true, false].some((lang) =>
        sameCopy(copy, posterTemplateSampleCopy(document.templateId!, lang)),
      ),
  );
  const isLegacySample = [true, false].some((lang) =>
    sameCopy(copy, legacyPosterSampleCopy(lang)),
  );
  if (isStarter || isUntouchedCurrentSample || isLegacySample) {
    return posterTemplateSampleCopy(templateId, zh);
  }
  return copy;
}

export function paperListSelectionCopy(
  document: PosterDocument,
  copy: Copy,
  zh: boolean,
  starterCopy?: Pick<Copy, "title" | "subtitle">,
): Copy {
  return posterTemplateSelectionCopy(document, copy, "paper-list", zh, starterCopy);
}

// Row and checklist text is independently editable. Reconstruct from the current
// layers so resizing or reapplying cannot restore an older copy over user edits.
export function paperListCurrentCopy(document: PosterDocument, copy: Copy): Copy {
  if (document.templateId === "paper-list") {
    const rows = new Map<number, { heading?: string; subtitle?: string; body?: string; paragraphs?: Map<number, string> }>();
    for (const element of document.elements) {
      if (element.type !== "text") continue;
      const match = /^paper-list:row:(\d+):(heading|subtitle|body|paragraph:(\d+))$/.exec(element.name ?? "");
      if (!match) continue;
      const row = rows.get(Number(match[1])) ?? {};
      if (match[3]) {
        row.paragraphs ??= new Map();
        row.paragraphs.set(Number(match[3]), element.sourceText ?? element.text);
      } else row[match[2] as "heading" | "subtitle" | "body"] = element.sourceText ?? element.text;
      rows.set(Number(match[1]), row);
    }
    if (!rows.size) return copy;
    return {
      ...copy,
      subtitle: [...rows]
        .sort(([a], [b]) => a - b)
        .map(([, row]) =>
          [
            row.heading,
            row.subtitle === undefined
              ? undefined
              : `${/副标题[：:]/.test(copy.subtitle) ? "副标题：" : "Subtitle: "}${row.subtitle}`,
            row.body,
            ...[...(row.paragraphs ?? [])]
              .sort(([a], [b]) => a - b)
              .map(([, text]) => text),
          ]
            .filter((value) => value !== undefined)
            .join("\n"),
        )
        .join("\n\n"),
    };
  }
  const compareItems = new Map<number, string>();
  const listItems = new Map<number, string>();
  for (const element of document.elements) {
    if (element.type !== "text") continue;
    const compareMatch = /^poster:compare:(\d+)$/.exec(element.name ?? "");
    if (compareMatch) {
      compareItems.set(Number(compareMatch[1]), element.sourceText ?? element.text);
    }
    const itemMatch = /^poster:item:(\d+)$/.exec(element.name ?? "");
    if (itemMatch) {
      listItems.set(Number(itemMatch[1]), element.sourceText ?? element.text);
    }
  }
  if (compareItems.size >= 2) {
    const parts = copy.subtitle.split(/\s*[|｜]\s*|\s+vs\.?\s+/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        ...copy,
        subtitle: [...compareItems]
          .sort(([a], [b]) => a - b)
          .map(([, text]) => text)
          .join(" | "),
      };
    }
  }
  if (listItems.size >= 2) {
    const parts = copy.subtitle.split(/[\n,，、；;|｜]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length === listItems.size) {
      const joiner = copy.subtitle.includes("\n")
        ? "\n"
        : copy.subtitle.includes("、")
          ? "、"
          : copy.subtitle.includes("，")
            ? "，"
            : ", ";
      return {
        ...copy,
        subtitle: [...listItems]
          .sort(([a], [b]) => a - b)
          .map(([, text]) => text)
          .join(joiner),
      };
    }
  }
  return copy;
}

// Derive the paragraph lead-in from its current text rather than storing a
// duplicate label or adding rich-text data to saved poster documents.
export function paperListParagraphStyles(element: { type: string; name?: string; text?: string }) {
  if (element.type !== "text" || !/^paper-list:row:\d+:(?:body|paragraph:\d+)$/.test(element.name ?? "")) return undefined;
  const prefix = /^[^\n：:]{1,16}[：:]/u.exec(element.text ?? "")?.[0];
  if (!prefix) return undefined;
  return { 0: Object.fromEntries(Array.from(prefix).map((_, index) => [index, { fontWeight: "bold" as const }])) };
}
