import type { ExtensionManifest } from "@edgeever/plugin-api";
import type { PluginHostSnapshot, RegisteredPluginAction } from "./plugin-host";

export type PluginDetailPage = "overview" | "settings";

export const hasPluginSettings = (manifest: ExtensionManifest) =>
  manifest.type === "plugin" && (manifest.settings?.fields.length ?? 0) > 0;

export const getPluginDetailPath = (pluginId: string, page: PluginDetailPage = "overview") =>
  `/plugins/${encodeURIComponent(pluginId)}${page === "settings" ? "?view=settings" : ""}`;

export const getPluginDetailPage = (manifest: ExtensionManifest, requestedPage: string | null): PluginDetailPage =>
  requestedPage === "settings" && hasPluginSettings(manifest) ? "settings" : "overview";

/** Marketplace and manager cards list launcher commands; editor-context commands stay in the toolbar menu. */
export const isPluginCardCommand = (command: { listed?: boolean }) => command.listed !== false;

export const isPluginMenuCommand = (command: { menu?: boolean }) => command.menu !== false;

export const isPluginMenuPanel = (panel: { purpose?: string }) =>
  panel.purpose === "dashboard" || panel.purpose === "onboarding" || !panel.purpose;

const isDashboardLauncherCommand = (
  command: { title: string },
  panels: Array<{ title: string; purpose?: string }>,
) => panels.some((panel) => {
  if (panel.purpose && panel.purpose !== "dashboard" && panel.purpose !== "onboarding") return false;
  const panelTitle = panel.title?.trim() ?? "";
  const title = command.title?.trim() ?? "";
  if (!panelTitle || !title) return false;
  if (title === `打开${panelTitle}` || title === `打开${panelTitle}面板`) return true;
  const lower = title.toLocaleLowerCase();
  const panelLower = panelTitle.toLocaleLowerCase();
  return lower === `open ${panelLower}` || lower === `open ${panelLower} dashboard`;
});

export const getPluginToolbarGroups = (snapshot: Pick<PluginHostSnapshot, "extensions" | "commands" | "panels">) =>
  snapshot.extensions.flatMap((extension) => {
    if (extension.manifest.type !== "plugin") return [];
    const pluginPanels = snapshot.panels.filter((panel) => panel.pluginId === extension.manifest.id && isPluginMenuPanel(panel));
    const pluginCommands = snapshot.commands.filter((command) => (
      command.pluginId === extension.manifest.id
      && isPluginMenuCommand(command)
      && !isDashboardLauncherCommand(command, pluginPanels)
    ));
    const actions: RegisteredPluginAction[] = extension.enabled ? [
      ...pluginCommands.map((command) => ({ ...command, type: "command" as const })),
      ...pluginPanels.map((panel) => ({ ...panel, type: "panel" as const })),
    ] : [];
    return actions.length
      ? [{ pluginId: extension.manifest.id, name: extension.manifest.name, actions }]
      : [];
  });
