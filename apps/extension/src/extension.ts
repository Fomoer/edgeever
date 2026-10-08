import { t } from "./i18n";

export type ExtensionSettings = {
  instanceUrl: string;
  token: string;
  notebookId: string;
};

export type Notebook = {
  id: string;
  name: string;
  slug?: string | null;
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  instanceUrl: "",
  token: "",
  notebookId: "",
};

const isInboxNotebook = (notebook: { id: string; slug?: string | null }) =>
  notebook.slug === "inbox" || notebook.id === "nb_inbox" || notebook.id.endsWith("_inbox");

// An empty or stale choice means 等待分类. A notebook the user picked still wins.
export const clipNotebookId = (savedId: string, notebooks: { id: string; slug?: string | null }[]) => {
  const saved = savedId.trim();
  if (saved && notebooks.some((notebook) => notebook.id === saved)) return saved;
  return notebooks.find((notebook) => notebook.id.trim() && isInboxNotebook(notebook))?.id ?? "";
};

export const getSettings = async (): Promise<ExtensionSettings> => {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    instanceUrl: typeof stored.instanceUrl === "string" ? stored.instanceUrl : "",
    token: typeof stored.token === "string" ? stored.token : "",
    notebookId: typeof stored.notebookId === "string" ? stored.notebookId : "",
  };
};

export const saveSettings = async (settings: ExtensionSettings) => {
  await chrome.storage.local.set(settings);
};

export const normalizeInstanceUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
};

export const getInstanceOrigin = (instanceUrl: string) => {
  const url = new URL(normalizeInstanceUrl(instanceUrl));
  return url.origin;
};

export const requestInstancePermission = async (instanceUrl: string) => {
  const origin = getInstanceOrigin(instanceUrl);
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    throw new Error(t("instancePermissionRequired"));
  }
};

export const edgeEverRequest = async <T>(settings: ExtensionSettings, path: string, init?: RequestInit): Promise<T> => {
  const instanceUrl = normalizeInstanceUrl(settings.instanceUrl);
  if (!instanceUrl || !settings.token) {
    throw new Error(t("missingSettingsDetails"));
  }

  const response = await fetch(`${instanceUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || t("requestFailed", String(response.status)));
  }

  return response.json() as Promise<T>;
};

export const edgeEverFormRequest = async <T>(
  settings: ExtensionSettings,
  path: string,
  form: FormData,
  signal?: AbortSignal,
): Promise<T> => {
  const instanceUrl = normalizeInstanceUrl(settings.instanceUrl);
  if (!instanceUrl || !settings.token) {
    throw new Error(t("missingSettingsDetails"));
  }

  const response = await fetch(`${instanceUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}` },
    body: form,
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || t("requestFailed", String(response.status)));
  }

  return response.json() as Promise<T>;
};

export const uploadMemoImage = async (
  settings: ExtensionSettings,
  memoId: string,
  file: { bytes: Uint8Array; mimeType: string; filename: string },
  signal?: AbortSignal,
) => {
  const buffer = new ArrayBuffer(file.bytes.byteLength);
  new Uint8Array(buffer).set(file.bytes);
  const form = new FormData();
  form.append("file", new File([buffer], file.filename, { type: file.mimeType }));
  return edgeEverFormRequest<{ resource: { id: string } }>(
    settings,
    `/api/v1/memos/${encodeURIComponent(memoId)}/resources`,
    form,
    signal,
  );
};

export const listNotebooks = (settings: ExtensionSettings) =>
  edgeEverRequest<{ notebooks: Notebook[] }>(settings, "/api/v1/notebooks");

export const testConnection = async (settings: ExtensionSettings) => {
  await requestInstancePermission(settings.instanceUrl);
  const result = await listNotebooks(settings);
  return result.notebooks;
};
