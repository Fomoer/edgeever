type PluginTrustStorage = Pick<Storage, "getItem" | "setItem">;

export const PLUGIN_TRUST_WARNING_COPY = {
  version: 1,
  titleKey: "plugins.trustWarning.title",
  descriptionKey: "plugins.trustWarning.description",
  confirmLabelKey: "plugins.trustWarning.confirm",
} as const;

export const PLUGIN_TRUST_ACKNOWLEDGEMENT_STORAGE_KEY =
  `edgeever:plugins:trusted-code:${PLUGIN_TRUST_WARNING_COPY.version}`;

const getDefaultStorage = (): PluginTrustStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const hasAcknowledgedPluginTrustWarning = (storage?: PluginTrustStorage | null) => {
  const resolvedStorage = storage === undefined ? getDefaultStorage() : storage;
  try {
    return resolvedStorage?.getItem(PLUGIN_TRUST_ACKNOWLEDGEMENT_STORAGE_KEY) === "acknowledged";
  } catch {
    return false;
  }
};

export const acknowledgePluginTrustWarning = (storage?: PluginTrustStorage | null) => {
  const resolvedStorage = storage === undefined ? getDefaultStorage() : storage;
  try {
    resolvedStorage?.setItem(PLUGIN_TRUST_ACKNOWLEDGEMENT_STORAGE_KEY, "acknowledged");
  } catch {
    // The current enable action may proceed; browsers that block storage will ask again next time.
  }
};

export const shouldRequestPluginTrustAcknowledgement = ({
  acknowledged,
  enabled,
  extensionType,
}: {
  acknowledged: boolean;
  enabled: boolean;
  extensionType: "plugin" | "theme";
}) => enabled && extensionType === "plugin" && !acknowledged;
