import { requestInstancePermission, type ExtensionSettings } from "./extension";
import { t } from "./i18n";

// Called directly by the React click handler: request permissions before yielding
// so Firefox retains the user gesture. UI rendering must never request access.
export async function captureCurrentPage(settings: ExtensionSettings): Promise<string> {
  if (!settings.instanceUrl || !settings.token) throw new Error(t("completePluginConfiguration"));
  await requestInstancePermission(settings.instanceUrl);
  const response = await chrome.runtime.sendMessage({ type: "captureCurrentPage" });
  if (!response?.ok) throw new Error(response?.message || t("saveFailed"));
  return typeof response.message === "string" && response.message ? response.message : t("savedToEdgeEver");
}

export async function startRegionClip(settings: ExtensionSettings): Promise<void> {
  if (!settings.instanceUrl || !settings.token) throw new Error(t("completePluginConfiguration"));
  await requestInstancePermission(settings.instanceUrl);
  const response = await chrome.runtime.sendMessage({ type: "startRegionClip" });
  if (!response?.ok) throw new Error(response?.message || t("saveFailed"));
}
