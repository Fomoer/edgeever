import type { Mapping } from "@tiptap/pm/transform";
import type { OutlineItem } from "./editor-outline";

export type OutlineSnapshot = { items: OutlineItem[]; collapsed: number[] };
const storageKey = (memoId: string) => `edgeever.editor.outline.v1.${encodeURIComponent(memoId)}`;
const unsaved = new Map<string, OutlineSnapshot>();

export const readOutlineSnapshot = (memoId: string): OutlineSnapshot | null => {
  if (unsaved.has(memoId)) return unsaved.get(memoId)!;
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(memoId)) ?? "null");
    if (!value || !Array.isArray(value.items) || !Array.isArray(value.collapsed)) return null;
    if (!value.items.every((item: OutlineItem) => item && Number.isInteger(item.pos) && item.pos >= 0
      && Number.isInteger(item.level) && item.level >= 1 && item.level <= 6 && typeof item.text === "string")
      || !value.collapsed.every((pos: number) => Number.isInteger(pos) && pos >= 0)) return null;
    return value;
  } catch {
    return null;
  }
};

export const writeOutlineSnapshot = (memoId: string, snapshot: OutlineSnapshot) => {
  try {
    window.localStorage.setItem(storageKey(memoId), JSON.stringify(snapshot));
    unsaved.delete(memoId);
  } catch {
    // Keep navigation choices usable when storage is unavailable or full.
    unsaved.set(memoId, snapshot);
    if (unsaved.size > 50) unsaved.delete(unsaved.keys().next().value!);
  }
};

// Transactions preserve identity through renames, duplicate titles and position
// shifts without adding attributes to the user's document. Deleted headings
// must never transfer their state to a replacement at the same position.
export const mapCollapsedOutlinePositions = (
  collapsed: ReadonlySet<number>, mapping: Mapping, items: OutlineItem[],
): Set<number> => {
  const available = new Set(items.map((item) => item.pos));
  const result = new Set<number>();
  for (const pos of collapsed) {
    const mapped = mapping.mapResult(pos, 1);
    // Heading-level changes replace the opening token but preserve its
    // content. A full node deletion/replacement removes both anchors.
    const survives = !mapped.deleted || !mapping.mapResult(pos + 1, 1).deleted;
    if (survives && available.has(mapped.pos)) result.add(mapped.pos);
  }
  return result;
};

export const restoreOutlinePositions = (snapshot: OutlineSnapshot | null, items: OutlineItem[]): Set<number> => {
  if (!snapshot) return new Set();
  const collapsed = new Set(snapshot.collapsed);
  const identity = (item: OutlineItem) => JSON.stringify([item.level, item.text]);
  // The same heading sequence also handles edits to intervening body text.
  if (snapshot.items.length === items.length && snapshot.items.every((item, i) => identity(item) === identity(items[i]!))) {
    return new Set(items.filter((_, i) => collapsed.has(snapshot.items[i]!.pos)).map((item) => item.pos));
  }
  const oldCounts = new Map<string, number>();
  const newCounts = new Map<string, number>();
  for (const item of snapshot.items) oldCounts.set(identity(item), (oldCounts.get(identity(item)) ?? 0) + 1);
  for (const item of items) newCounts.set(identity(item), (newCounts.get(identity(item)) ?? 0) + 1);
  const collapsedIdentities = new Set(snapshot.items.filter((item) => collapsed.has(item.pos)).map(identity));
  // After external edits, only restore unambiguous matches. Newly added or
  // renamed headings default to expanded rather than guessing by position.
  return new Set(items.filter((item) => {
    const key = identity(item);
    return oldCounts.get(key) === 1 && newCounts.get(key) === 1 && collapsedIdentities.has(key);
  }).map((item) => item.pos));
};
