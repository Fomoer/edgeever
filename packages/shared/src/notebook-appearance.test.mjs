import { describe, expect, test } from "bun:test";
import { NotebookUpdateSchema } from "./schemas.ts";
import { NOTEBOOK_COLORS, NOTEBOOK_ICONS, readableNotebookColor, searchNotebookIcons } from "./notebook-appearance.ts";

test("finds notebook icons with German and English search terms and categories", () => {
  expect(searchNotebookIcons("heimnetz").map(icon => icon.id)).toContain("network");
  expect(searchNotebookIcons("personal assistant").map(icon => icon.id)).toContain("bot");
  expect(searchNotebookIcons("", "finance").every(icon => icon.category === "finance")).toBe(true);
  expect(searchNotebookIcons("heimnetz", "finance")).toEqual([]);
  expect(new Set(NOTEBOOK_ICONS.map(icon => icon.id)).size).toBe(NOTEBOOK_ICONS.length);
});

test("validates safe appearance updates and preserves explicit reset values", () => {
  expect(NotebookUpdateSchema.parse({ icon: null, color: null, colorTarget: "icon" })).toEqual({ icon: null, color: null, colorTarget: "icon" });
  expect(NotebookUpdateSchema.parse({ isBold: false })).toEqual({ isBold: false });
  for (const input of [{ isBold: "true" }, { isBold: 1 }, { color: "red" }, { color: "#12345z" }, { colorTarget: "background" }, { icon: "<svg onload=alert(1)>" }]) {
    expect(NotebookUpdateSchema.safeParse(input).success).toBe(false);
  }
  expect(NotebookUpdateSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
});

const luminance = hex => {
  const values = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};

describe("notebook color contrast", () => {
  for (const dark of [false, true]) test(`keeps all preset and extreme custom colors readable (${dark ? "dark" : "light"})`, () => {
    for (const color of [...NOTEBOOK_COLORS, "#ffffff", "#000000", "#ffff00", "#333638", "#dde3e9"]) {
      const result = readableNotebookColor(color, dark);
      const a = luminance(result), b = luminance(dark ? "#333638" : "#dde3e9");
      expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(readableNotebookColor("url(unsafe)", dark)).toBe("inherit");
  });
});
