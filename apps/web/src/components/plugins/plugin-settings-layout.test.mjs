import { describe, expect, test } from "bun:test";
import { groupPluginSettingFields } from "./plugin-settings-layout.ts";

describe("plugin settings layout", () => {
  test("groups consecutive topic switches without absorbing unrelated switches", () => {
    const fields = [
      { key: "topics.ai", type: "boolean", label: "AI" },
      { key: "topics.engineering", type: "boolean", label: "Engineering" },
      { key: "topics.science", type: "boolean", label: "Science" },
      { key: "translation.auto-enabled", type: "boolean", label: "Translate" },
      { key: "translation.target-language", type: "select", label: "Language", options: [{ value: "en", label: "English" }] },
      { key: "digest.auto-enabled", type: "boolean", label: "Digest" },
    ];

    const groups = groupPluginSettingFields(fields);
    expect(groups.map((group) => ({ compact: group.compact, keys: group.fields.map((field) => field.key) }))).toEqual([
      { compact: true, keys: ["topics.ai", "topics.engineering", "topics.science"] },
      { compact: false, keys: ["translation.auto-enabled", "translation.target-language"] },
      { compact: false, keys: ["digest.auto-enabled"] },
    ]);
  });

  test("keeps short boolean runs in the standard full-width layout", () => {
    const fields = [
      { key: "alerts.email", type: "boolean", label: "Email" },
      { key: "alerts.push", type: "boolean", label: "Push" },
    ];

    expect(groupPluginSettingFields(fields).map((group) => ({ compact: group.compact, keys: group.fields.map((field) => field.key) }))).toEqual([
      { compact: false, keys: ["alerts.email", "alerts.push"] },
    ]);
  });
});
