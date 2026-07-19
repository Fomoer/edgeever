import "./styles.css";
import { getSettings, requestInstancePermission } from "./extension";
import { localizeDocument, t } from "./i18n";

localizeDocument();

const saveButton = document.querySelector<HTMLButtonElement>("#save");
const settingsButton = document.querySelector<HTMLButtonElement>("#settings");
const status = document.querySelector<HTMLParagraphElement>("#status");

const setStatus = (message: string, kind: "normal" | "error" | "success" = "normal") => {
  if (status) {
    status.textContent = message;
    status.dataset.kind = kind;
  }
};

saveButton?.addEventListener("click", async () => {
  saveButton.disabled = true;
  setStatus(t("readingAndSaving"));

  try {
    const settings = await getSettings();
    if (!settings.instanceUrl || !settings.token) {
      throw new Error(t("completePluginConfiguration"));
    }

    await requestInstancePermission(settings.instanceUrl);
    const response = await chrome.runtime.sendMessage({ type: "captureCurrentPage" });
    if (!response?.ok) {
      throw new Error(response?.message || t("saveFailed"));
    }

    setStatus(t("savedToEdgeEver"), "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t("saveFailed"), "error");
  } finally {
    saveButton.disabled = false;
  }
});

settingsButton?.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
