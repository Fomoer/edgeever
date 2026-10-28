import { expect, test } from "bun:test";
import { nextBackupAt, normalizeBackupConfig } from "./backup-settings.mjs";

test("calendar schedules clamp month end and preserve successful history when frequency changes", () => {
  const jan = new Date(2026, 0, 31, 12, 0, 0);
  const feb = new Date(nextBackupAt(jan.toISOString(), "monthly"));
  expect([feb.getFullYear(), feb.getMonth(), feb.getDate(), feb.getHours()]).toEqual([2026, 1, 28, 12]);
  const weekly = new Date(nextBackupAt(jan.toISOString(), "weekly"));
  expect(weekly.getDate()).toBe(7);
  expect(weekly.getMonth()).toBe(1);
  expect(nextBackupAt(null, "weekly")).toBeNull();
});

test("accepts the specified defaults and choices, rejects invalid configuration", () => {
  const defaults = normalizeBackupConfig(undefined, "/Documents/EdgeEver Backups");
  expect(defaults).toEqual({ enabled: false, interval: "weekly", retention: 5, directory: "/Documents/EdgeEver Backups", encrypted: false });
  expect(() => normalizeBackupConfig({ ...defaults, interval: "hourly" }, defaults.directory)).toThrow();
  expect(() => normalizeBackupConfig({ ...defaults, retention: 4 }, defaults.directory)).toThrow();
  expect(() => normalizeBackupConfig({ ...defaults, directory: "" }, defaults.directory)).toThrow();
});
