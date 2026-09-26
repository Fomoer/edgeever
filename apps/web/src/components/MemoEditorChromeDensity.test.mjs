import { describe, expect, test } from "bun:test";
import { nextTitleStatusClearance } from "./MemoEditorChromeDensity.ts";

describe("title status clearance", () => {
  test("pads the title until it clears the status cluster", () => {
    expect(nextTitleStatusClearance(0, 1750, 1680)).toBe(78);
    expect(nextTitleStatusClearance(78, 1672, 1680)).toBe(78);
  });

  test("drops clearance once the title already sits clear of the status", () => {
    expect(nextTitleStatusClearance(40, 1500, 1700)).toBe(0);
    expect(nextTitleStatusClearance(0, 1500, 1700)).toBe(0);
  });

  test("stops growing once the inset reaches the header cap", () => {
    expect(nextTitleStatusClearance(480, 2000, 1000)).toBe(480);
  });
});
