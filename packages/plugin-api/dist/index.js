// src/index.ts
var PLUGIN_API_VERSION = "2";
var THEME_API_VERSION = "1";
var PLUGIN_PERMISSIONS = [
  "notes:read",
  "notes:write",
  "notes:delete",
  "metadata:read",
  "metadata:write",
  "resources:read",
  "resources:write",
  "templates:read",
  "templates:write",
  "network",
  "network:public",
  "ai:generate",
  "storage",
  "secrets",
  "schedules",
  "editor:read",
  "editor:write",
  "ui:commands",
  "ui:navigation",
  "ui:notices",
  "ui:panels",
  "ui:embeds"
];
var PLUGIN_API_ERROR_CODES = ["NOTE_CONFLICT", "RESOURCE_CONFLICT", "INVALID_MARKDOWN_EDIT"];
var THEME_TOKEN_NAMES = [
  "color.background",
  "color.surface",
  "color.surfaceMuted",
  "color.text",
  "color.textMuted",
  "color.border",
  "color.accent",
  "color.accentForeground",
  "color.success",
  "color.warning",
  "color.danger",
  "font.body",
  "font.mono",
  "font.size",
  "lineHeight.body",
  "radius.medium",
  "density.scale",
  "editor.contentWidth"
];
var MARKETPLACE_REGISTRY_VERSION = "1";
var definePlugin = (plugin) => plugin;
var defineTheme = (theme) => theme;
var ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
var VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var PANEL_CHROME_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
var PANEL_ACTION_VARIANTS = new Set(["default", "primary", "ghost"]);
var clipChromeText = (value, fallback = "", max = 200) => {
  if (typeof value !== "string")
    return fallback;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};
var normalizePanelAction = (value) => {
  if (!isRecord(value) || typeof value.id !== "string" || !PANEL_CHROME_ID.test(value.id))
    return null;
  const label = clipChromeText(value.label);
  if (!label)
    return null;
  const variant = PANEL_ACTION_VARIANTS.has(value.variant) ? value.variant : undefined;
  return { id: value.id, label, ...variant ? { variant } : {}, ...value.disabled === true ? { disabled: true } : {} };
};
var normalizePanelOptions = (value) => {
  if (!Array.isArray(value))
    return [];
  const options = [];
  for (const item of value.slice(0, 24)) {
    if (!isRecord(item) || typeof item.value !== "string" || !item.value || item.value.length > 64)
      continue;
    const label = clipChromeText(item.label, item.value);
    options.push({ value: item.value, label });
  }
  return options;
};
var normalizeToolbarItem = (value) => {
  if (!isRecord(value) || typeof value.key !== "string" || !PANEL_CHROME_ID.test(value.key))
    return null;
  if (value.type === "search") {
    return {
      type: "search",
      key: value.key,
      ...typeof value.placeholder === "string" ? { placeholder: clipChromeText(value.placeholder, "", 80) } : {},
      ...typeof value.value === "string" ? { value: value.value.slice(0, 200) } : {}
    };
  }
  if (value.type === "tabs" || value.type === "select") {
    const options = normalizePanelOptions(value.options);
    if (!options.length)
      return null;
    const selected = typeof value.value === "string" && options.some((option) => option.value === value.value) ? value.value : options[0].value;
    return {
      type: value.type,
      key: value.key,
      value: selected,
      options,
      ...value.type === "select" && typeof value.label === "string" ? { label: clipChromeText(value.label, "", 40) } : {}
    };
  }
  if (value.type === "button") {
    const action = normalizePanelAction({ ...value, id: value.key });
    if (!action)
      return null;
    return { type: "button", key: value.key, label: action.label, ...action.variant ? { variant: action.variant } : {}, ...action.disabled ? { disabled: true } : {} };
  }
  return null;
};
var normalizePluginPanelChrome = (value) => {
  if (!isRecord(value))
    return {};
  const chrome = {};
  if (isRecord(value.header)) {
    const actions = Array.isArray(value.header.actions) ? value.header.actions.map(normalizePanelAction).filter((action) => Boolean(action)).slice(0, 8) : [];
    chrome.header = {
      ...typeof value.header.title === "string" ? { title: clipChromeText(value.header.title, "", 80) } : {},
      ...value.header.description === null ? { description: null } : typeof value.header.description === "string" ? { description: clipChromeText(value.header.description, "", 200) } : {},
      ...actions.length ? { actions } : {}
    };
  }
  if (Array.isArray(value.toolbar)) {
    chrome.toolbar = value.toolbar.map(normalizeToolbarItem).filter((item) => Boolean(item)).slice(0, 16);
  }
  if (value.empty === null)
    chrome.empty = null;
  else if (isRecord(value.empty)) {
    const title = clipChromeText(value.empty.title, "", 80);
    if (title) {
      chrome.empty = {
        title,
        ...typeof value.empty.description === "string" ? { description: clipChromeText(value.empty.description) } : {},
        ...normalizePanelAction(value.empty.action) ? { action: normalizePanelAction(value.empty.action) } : {}
      };
    }
  }
  if (typeof value.onAction === "function")
    chrome.onAction = value.onAction;
  if (typeof value.onChange === "function")
    chrome.onChange = value.onChange;
  return chrome;
};
var COLOR_THEME_TOKENS = new Set([
  "color.background",
  "color.surface",
  "color.surfaceMuted",
  "color.text",
  "color.textMuted",
  "color.border",
  "color.accent",
  "color.accentForeground",
  "color.success",
  "color.warning",
  "color.danger"
]);
var FONT_THEME_TOKENS = new Set(["font.body", "font.mono"]);
var LENGTH_THEME_TOKENS = new Set(["font.size", "radius.medium", "editor.contentWidth"]);
var validateThemeToken = (key, value) => {
  if (COLOR_THEME_TOKENS.has(key) && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) {
    throw new Error(`Theme color token ${key} must use #RRGGBB or #RRGGBBAA.`);
  }
  if (FONT_THEME_TOKENS.has(key) && (!/^[a-z0-9 ,_'"-]+$/i.test(value) || value.length > 200)) {
    throw new Error(`Theme font token ${key} contains unsupported characters.`);
  }
  if (LENGTH_THEME_TOKENS.has(key) && !/^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(value)) {
    throw new Error(`Theme length token ${key} must use px, rem, em, or %.`);
  }
  if (key === "lineHeight.body" && !/^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(value)) {
    throw new Error("Theme lineHeight.body must be a number or a supported CSS length.");
  }
  if (key === "density.scale" && !/^(?:0\.[5-9]\d?|1(?:\.\d{1,2})?)$/.test(value)) {
    throw new Error("Theme density.scale must be between 0.5 and 1.99.");
  }
};
var assertCommonManifest = (value) => {
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) {
    throw new Error("Extension id must be a reverse-domain style identifier using lowercase letters, numbers, dots, dashes, or underscores.");
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error("Extension name is required.");
  }
  if (typeof value.version !== "string" || !VERSION_PATTERN.test(value.version)) {
    throw new Error("Extension version must use SemVer.");
  }
};
var normalizeThemeTokens = (value) => {
  if (!isRecord(value))
    throw new Error("Theme tokens must be an object.");
  const allowed = new Set(THEME_TOKEN_NAMES);
  const tokens = {};
  for (const [key, tokenValue] of Object.entries(value)) {
    if (!allowed.has(key))
      throw new Error(`Unsupported theme token: ${key}`);
    if (typeof tokenValue !== "string" || !tokenValue.trim())
      throw new Error(`Theme token ${key} must be a non-empty string.`);
    const normalizedValue = tokenValue.trim();
    validateThemeToken(key, normalizedValue);
    tokens[key] = normalizedValue;
  }
  return tokens;
};
var SETTING_KEY_PATTERN = /^[a-z][a-z0-9._-]*$/;
var normalizeSettingList = (field, key) => {
  if (field.list === undefined)
    return;
  if (!isRecord(field.list) || !Array.isArray(field.list.items) || field.list.items.length === 0 || field.list.items.length > 100) {
    throw new Error(`Plugin setting ${key} list requires between 1 and 100 items.`);
  }
  if (field.list.title !== undefined && (typeof field.list.title !== "string" || !field.list.title.trim() || field.list.title.length > 200)) {
    throw new Error(`Plugin setting ${key} list title must be at most 200 characters.`);
  }
  if (field.list.actionLabel !== undefined && (typeof field.list.actionLabel !== "string" || !field.list.actionLabel.trim() || field.list.actionLabel.length > 40)) {
    throw new Error(`Plugin setting ${key} list action label must be at most 40 characters.`);
  }
  const items = field.list.items.map((item, index) => {
    if (!isRecord(item) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 200) {
      throw new Error(`Plugin setting ${key} list item ${index + 1} requires a title of at most 200 characters.`);
    }
    if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 200)) {
      throw new Error(`Plugin setting ${key} list item ${index + 1} description is too long.`);
    }
    return {
      title: item.title.trim(),
      ...typeof item.description === "string" && item.description.trim() ? { description: item.description.trim() } : {}
    };
  });
  return {
    items,
    ...typeof field.list.title === "string" ? { title: field.list.title.trim() } : {},
    ...typeof field.list.actionLabel === "string" ? { actionLabel: field.list.actionLabel.trim() } : {}
  };
};
var normalizePluginSettings = (value) => {
  if (!isRecord(value) || !Array.isArray(value.fields))
    throw new Error("Plugin settings must contain a fields array.");
  if (value.fields.length > 50)
    throw new Error("Plugin settings cannot contain more than 50 fields.");
  const keys = new Set;
  const fields = value.fields.map((field) => {
    if (!isRecord(field) || typeof field.key !== "string" || !SETTING_KEY_PATTERN.test(field.key)) {
      throw new Error("Plugin setting keys must start with a lowercase letter and contain only lowercase letters, numbers, dots, dashes, or underscores.");
    }
    if (keys.has(field.key))
      throw new Error(`Duplicate plugin setting key: ${field.key}`);
    keys.add(field.key);
    if (typeof field.label !== "string" || !field.label.trim() || field.label.length > 200)
      throw new Error(`Plugin setting ${field.key} requires a label of at most 200 characters.`);
    if (typeof field.description === "string" && field.description.length > 1000)
      throw new Error(`Plugin setting ${field.key} description is too long.`);
    const list = normalizeSettingList(field, field.key);
    const common = {
      key: field.key,
      label: field.label.trim(),
      ...typeof field.description === "string" && field.description.trim() ? { description: field.description.trim() } : {},
      ...field.required === true ? { required: true } : {},
      ...list ? { list } : {}
    };
    if (field.type === "text" || field.type === "secret") {
      if (field.type === "secret" && field.default !== undefined)
        throw new Error(`Secret setting ${field.key} cannot declare a default value.`);
      if (field.default !== undefined && typeof field.default !== "string")
        throw new Error(`Plugin setting ${field.key} default must be a string.`);
      if (field.placeholder !== undefined && typeof field.placeholder !== "string")
        throw new Error(`Plugin setting ${field.key} placeholder must be a string.`);
      return {
        ...common,
        type: field.type,
        ...typeof field.default === "string" ? { default: field.default } : {},
        ...typeof field.placeholder === "string" ? { placeholder: field.placeholder } : {}
      };
    }
    if (field.type === "number") {
      for (const key of ["default", "min", "max", "step"]) {
        if (field[key] !== undefined && (typeof field[key] !== "number" || !Number.isFinite(field[key]))) {
          throw new Error(`Plugin setting ${field.key} ${key} must be a finite number.`);
        }
      }
      if (typeof field.min === "number" && typeof field.max === "number" && field.min > field.max)
        throw new Error(`Plugin setting ${field.key} min cannot exceed max.`);
      if (typeof field.step === "number" && field.step <= 0)
        throw new Error(`Plugin setting ${field.key} step must be positive.`);
      if (typeof field.default === "number" && (typeof field.min === "number" && field.default < field.min || typeof field.max === "number" && field.default > field.max)) {
        throw new Error(`Plugin setting ${field.key} default is outside its allowed range.`);
      }
      return { ...common, type: "number", ...Object.fromEntries(["default", "min", "max", "step"].flatMap((key) => typeof field[key] === "number" ? [[key, field[key]]] : [])) };
    }
    if (field.type === "boolean") {
      if (field.default !== undefined && typeof field.default !== "boolean")
        throw new Error(`Plugin setting ${field.key} default must be a boolean.`);
      return { ...common, type: "boolean", ...typeof field.default === "boolean" ? { default: field.default } : {} };
    }
    if (field.type === "select") {
      if (!Array.isArray(field.options) || field.options.length === 0 || field.options.length > 100)
        throw new Error(`Plugin setting ${field.key} requires between 1 and 100 select options.`);
      const optionValues = new Set;
      const options = field.options.map((option) => {
        if (!isRecord(option) || typeof option.value !== "string" || !option.value || typeof option.label !== "string" || !option.label.trim()) {
          throw new Error(`Plugin setting ${field.key} has an invalid select option.`);
        }
        if (optionValues.has(option.value))
          throw new Error(`Plugin setting ${field.key} has a duplicate select value.`);
        optionValues.add(option.value);
        return { value: option.value, label: option.label.trim() };
      });
      if (field.default !== undefined && (typeof field.default !== "string" || !optionValues.has(field.default)))
        throw new Error(`Plugin setting ${field.key} default must match a select option.`);
      return { ...common, type: "select", options, ...typeof field.default === "string" ? { default: field.default } : {} };
    }
    throw new Error(`Plugin setting ${field.key} has an unsupported type.`);
  });
  return { fields };
};
var parseExtensionManifest = (value) => {
  if (!isRecord(value))
    throw new Error("Extension manifest must be an object.");
  assertCommonManifest(value);
  if (value.type === "plugin") {
    if (value.apiVersion !== PLUGIN_API_VERSION)
      throw new Error(`Unsupported plugin API version: ${String(value.apiVersion)}`);
    if (value.settingsUi !== "host") {
      throw new Error('Plugin API v2 requires settingsUi to be "host".');
    }
    if (typeof value.entry !== "string" || !value.entry.trim())
      throw new Error("Plugin entry is required.");
    if (value.permissions !== undefined && !Array.isArray(value.permissions))
      throw new Error("Plugin permissions must be an array.");
    const allowedPermissions = new Set(PLUGIN_PERMISSIONS);
    const permissions = [...new Set((value.permissions ?? []).map(String))];
    const unsupported = permissions.find((permission) => !allowedPermissions.has(permission));
    if (unsupported)
      throw new Error(`Unsupported plugin permission: ${unsupported}`);
    const networkHosts = value.networkHosts === undefined ? undefined : Array.isArray(value.networkHosts) ? value.networkHosts.map(String) : (() => {
      throw new Error("networkHosts must be an array.");
    })();
    if (networkHosts?.some((host) => !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))) {
      throw new Error("networkHosts entries must be hostnames without a scheme, port, or path.");
    }
    const platforms = value.platforms === undefined ? undefined : Array.isArray(value.platforms) && value.platforms.every((platform) => ["web", "desktop", "android", "ios"].includes(String(platform))) ? [...new Set(value.platforms.map(String))] : (() => {
      throw new Error("Plugin platforms contains an unsupported platform.");
    })();
    const settings = value.settings === undefined ? undefined : normalizePluginSettings(value.settings);
    return { ...value, type: "plugin", permissions, networkHosts, platforms, settings };
  }
  if (value.type === "theme") {
    if (value.themeApiVersion !== THEME_API_VERSION)
      throw new Error(`Unsupported theme API version: ${String(value.themeApiVersion)}`);
    if (!Array.isArray(value.modes) || value.modes.length === 0 || value.modes.some((mode) => mode !== "light" && mode !== "dark")) {
      throw new Error("Theme modes must contain light and/or dark.");
    }
    return {
      ...value,
      type: "theme",
      modes: [...new Set(value.modes)],
      light: normalizeThemeTokens(value.light),
      dark: value.dark === undefined ? undefined : normalizeThemeTokens(value.dark)
    };
  }
  throw new Error("Extension type must be plugin or theme.");
};
var normalizeChecksum = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value))
    throw new Error(`${label} must be a SHA-256 hex digest.`);
  return value.toLocaleLowerCase();
};
var GITHUB_REPOSITORY_PATTERN = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i;
var parseMarketplaceRegistry = (value) => {
  if (!isRecord(value) || value.registryVersion !== MARKETPLACE_REGISTRY_VERSION || !Array.isArray(value.entries)) {
    throw new Error("Unsupported marketplace registry format.");
  }
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) {
    throw new Error("Marketplace registry updatedAt must be an ISO date.");
  }
  const ids = new Set;
  const entries = value.entries.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !ID_PATTERN.test(item.id))
      throw new Error("Marketplace entry id is invalid.");
    if (ids.has(item.id))
      throw new Error(`Duplicate marketplace entry id: ${item.id}`);
    ids.add(item.id);
    for (const field of ["name", "description", "author", "category", "repositoryUrl"]) {
      if (typeof item[field] !== "string" || !item[field].trim())
        throw new Error(`Marketplace entry ${item.id} is missing ${field}.`);
    }
    const name = item.name;
    const description = item.description;
    const author = item.author;
    if (item.publisher !== undefined && item.publisher !== "edgeever") {
      throw new Error(`Marketplace entry ${item.id} has an invalid publisher.`);
    }
    const category = item.category;
    const repositoryUrl = item.repositoryUrl;
    if (!GITHUB_REPOSITORY_PATTERN.test(repositoryUrl))
      throw new Error(`Marketplace entry ${item.id} repositoryUrl must be a GitHub repository.`);
    if (!isRecord(item.distribution) || item.distribution.type !== "github" && item.distribution.type !== "manifest") {
      throw new Error(`Marketplace entry ${item.id} has an invalid distribution.`);
    }
    const distribution = item.distribution.type === "github" ? typeof item.distribution.repositoryUrl === "string" && GITHUB_REPOSITORY_PATTERN.test(item.distribution.repositoryUrl) ? { type: "github", repositoryUrl: item.distribution.repositoryUrl } : (() => {
      throw new Error(`Marketplace entry ${item.id} has an invalid GitHub repository.`);
    })() : typeof item.distribution.manifestUrl === "string" && (/^https:\/\//i.test(item.distribution.manifestUrl) || item.distribution.manifestUrl.startsWith("/")) ? { type: "manifest", manifestUrl: item.distribution.manifestUrl } : (() => {
      throw new Error(`Marketplace entry ${item.id} has an invalid manifest URL.`);
    })();
    if (!isRecord(item.verification) || typeof item.verification.version !== "string" || !VERSION_PATTERN.test(item.verification.version)) {
      throw new Error(`Marketplace entry ${item.id} has an invalid verified version.`);
    }
    const checksums = item.verification.checksums === undefined ? undefined : isRecord(item.verification.checksums) ? Object.fromEntries(Object.entries(item.verification.checksums).map(([key, checksum]) => {
      if (!["manifestJson", "mainJs", "stylesCss"].includes(key))
        throw new Error(`Marketplace entry ${item.id} has an unsupported checksum.`);
      return [key, normalizeChecksum(checksum, `${item.id} ${key}`)];
    })) : (() => {
      throw new Error(`Marketplace entry ${item.id} checksums must be an object.`);
    })();
    if (!checksums?.manifestJson)
      throw new Error(`Marketplace entry ${item.id} must pin the manifest.json checksum.`);
    return {
      id: item.id,
      name: name.trim(),
      description: description.trim(),
      author: author.trim(),
      ...item.publisher === "edgeever" ? { publisher: "edgeever" } : {},
      category: category.trim(),
      repositoryUrl: repositoryUrl.trim(),
      distribution,
      verification: { version: item.verification.version, checksums }
    };
  });
  return { registryVersion: MARKETPLACE_REGISTRY_VERSION, updatedAt: value.updatedAt, entries };
};
export {
  parseMarketplaceRegistry,
  parseExtensionManifest,
  normalizePluginPanelChrome,
  defineTheme,
  definePlugin,
  THEME_TOKEN_NAMES,
  THEME_API_VERSION,
  PLUGIN_PERMISSIONS,
  PLUGIN_API_VERSION,
  PLUGIN_API_ERROR_CODES,
  MARKETPLACE_REGISTRY_VERSION
};
