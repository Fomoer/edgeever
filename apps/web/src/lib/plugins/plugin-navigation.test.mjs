import { describe, expect, test } from "bun:test";
import { getPluginDetailPage, getPluginDetailPath, getPluginToolbarGroups, hasPluginSettings, isPluginCardCommand, isPluginMenuCommand, isPluginMenuPanel } from "./plugin-navigation.ts";

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

  test("omits unlisted commands from marketplace cards but keeps them in the toolbar menu", () => {
    expect(isPluginCardCommand({ listed: undefined })).toBe(true);
    expect(isPluginCardCommand({ listed: true })).toBe(true);
    expect(isPluginCardCommand({ listed: false })).toBe(false);
    expect(isPluginMenuCommand({ menu: undefined })).toBe(true);
    expect(isPluginMenuCommand({ menu: false })).toBe(false);
    expect(isPluginMenuPanel({ purpose: "dashboard" })).toBe(true);
    expect(isPluginMenuPanel({ purpose: "workflow" })).toBe(false);
    const groups = getPluginToolbarGroups({
      extensions: [{ manifest: { type: "plugin", id: "actions" }, enabled: true }],
      commands: [{ pluginId: "actions", id: "insert", listed: false }, { pluginId: "actions", id: "open" }],
      panels: [{ pluginId: "actions", id: "panel", purpose: "dashboard" }],
    });
    expect(groups[0].actions.map((action) => action.id)).toEqual(["insert", "open", "panel"]);
  });

  test("keeps editor commands in the toolbar and drops duplicate dashboard launchers", () => {
    const groups = getPluginToolbarGroups({
      extensions: [{ manifest: { type: "plugin", id: "tasks" }, enabled: true }],
      commands: [
        { pluginId: "tasks", id: "open-dashboard", title: "打开待办任务面板", menu: false },
        { pluginId: "tasks", id: "insert-task", title: "在光标处插入待办任务", listed: false },
        { pluginId: "tasks", id: "create-or-edit", title: "创建或编辑任务", listed: false },
      ],
      panels: [
        { pluginId: "tasks", id: "tasks", title: "待办任务", purpose: "dashboard" },
        { pluginId: "tasks", id: "edit-task", title: "创建或编辑任务", purpose: "workflow" },
      ],
    });
    expect(groups[0].actions.map((action) => `${action.type}:${action.id}`)).toEqual([
      "command:insert-task",
      "command:create-or-edit",
      "panel:tasks",
    ]);
  });

  test("hides a dashboard opener command even when menu is left at the default", () => {
    const groups = getPluginToolbarGroups({
      extensions: [{ manifest: { type: "plugin", id: "tasks" }, enabled: true }],
      commands: [{ pluginId: "tasks", id: "open-dashboard", title: "打开待办任务面板" }],
      panels: [{ pluginId: "tasks", id: "tasks", title: "待办任务", purpose: "dashboard" }],
    });
    expect(groups[0].actions.map((action) => `${action.type}:${action.id}`)).toEqual(["panel:tasks"]);
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
      panels: [{ pluginId: "actions", id: "panel", purpose: "dashboard" }],
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
