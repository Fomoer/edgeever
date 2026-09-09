import { describe, expect, test } from "bun:test";
import { getPluginDetailPage, getPluginDetailPath, getPluginToolbarGroups, hasPluginSettings } from "./plugin-navigation.ts";

const plugin = { type: "plugin", id: "example", settings: { fields: [{ key: "token", type: "secret", label: "Token" }] } };

describe("plugin settings navigation", () => {
  test("links directly to settings while preserving the existing overview URL", () => {
    expect(getPluginDetailPath("example")).toBe("/plugins/example");
    expect(getPluginDetailPath("example", "settings")).toBe("/plugins/example?view=settings");
    expect(getPluginDetailPath("scope/name?", "settings")).toBe("/plugins/scope%2Fname%3F?view=settings");
  });

  test("shows settings only for plugins with declared fields", () => {
    expect(hasPluginSettings(plugin)).toBe(true);
    expect(hasPluginSettings({ type: "plugin" })).toBe(false);
    expect(hasPluginSettings({ type: "plugin", settings: { fields: [] } })).toBe(false);
    expect(hasPluginSettings({ type: "theme" })).toBe(false);
  });

  test("does not expose disabled plugins through the command menu", () => {
    const groups = getPluginToolbarGroups({
      extensions: [{ manifest: plugin, enabled: false }],
      commands: [{ pluginId: "example", id: "run" }],
      panels: [{ pluginId: "example", id: "panel" }],
    });
    expect(groups).toEqual([]);
  });

  test("keeps commands and panels while hiding settings-only plugins, inactive plugins, and themes", () => {
    const groups = getPluginToolbarGroups({
      extensions: [
        { manifest: { type: "plugin", id: "actions" }, enabled: true },
        { manifest: plugin, enabled: true },
        { manifest: { type: "plugin", id: "inactive" }, enabled: false },
        { manifest: { type: "theme", id: "theme" }, enabled: true },
      ],
      commands: [{ pluginId: "actions", id: "run" }, { pluginId: "inactive", id: "hidden" }],
      panels: [{ pluginId: "actions", id: "panel" }],
    });
    expect(groups.map((group) => group.pluginId)).toEqual(["actions"]);
    expect(groups[0].actions.map((action) => action.type)).toEqual(["command", "panel"]);
  });

  test("resolves deep links and safely falls back for unsupported settings pages", () => {
    expect(getPluginDetailPage(plugin, "settings")).toBe("settings");
    expect(getPluginDetailPage(plugin, null)).toBe("overview");
    expect(getPluginDetailPage(plugin, "invalid")).toBe("overview");
    expect(getPluginDetailPage({ type: "plugin" }, "settings")).toBe("overview");
    expect(getPluginDetailPage({ type: "theme" }, "settings")).toBe("overview");
  });
});
