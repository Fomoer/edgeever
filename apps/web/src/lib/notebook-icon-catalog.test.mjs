import { expect, test } from "bun:test";
import { notebookIconNames, searchAvailableNotebookIcons } from "./notebook-icon-catalog.ts";

test("offers the installed icon collection and retains bilingual search", () => {
  expect(notebookIconNames.length).toBeGreaterThan(1900);
  expect(new Set(notebookIconNames).size).toBe(notebookIconNames.length);
  expect(searchAvailableNotebookIcons(" ALARM clock ")).toContainEqual({ id: "alarm-clock" });
  expect(searchAvailableNotebookIcons("heimnetz")).toContainEqual({ id: "network" });
  expect(searchAvailableNotebookIcons("personal assistant")).toContainEqual({ id: "bot" });
  expect(searchAvailableNotebookIcons("doesnotexist123")).toEqual([]);
});

test("falls back safely for unknown and inherited icon names", async () => {
  const { getNotebookIcon } = await import("../components/NotebookAppearanceContent.tsx");
  const fallback = getNotebookIcon(null);
  for (const name of ["constructor", "toString", "__proto__", "unknown-icon-123"]) {
    expect(getNotebookIcon(name)).toBe(fallback);
  }
  expect(getNotebookIcon("alarm-clock")).toBe(getNotebookIcon("alarm-clock"));
});
