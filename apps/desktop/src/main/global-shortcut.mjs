const SUPPORTED_KEY = /^(?:[a-z]|[0-9]|f(?:[1-9]|1[0-2]))$/;

export const normalizeGlobalShortcutBinding = (value, platform = process.platform) => {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const key = typeof value.key === "string" ? value.key.toLowerCase() : "";
  if (!SUPPORTED_KEY.test(key)) return undefined;
  if (["ctrl", "meta", "alt", "shift"].some((modifier) => typeof value[modifier] !== "boolean")) return undefined;
  if (platform !== "darwin" && value.meta) return undefined;
  const modifiers = [value.ctrl, value.meta, value.alt, value.shift].filter(Boolean).length;
  if (modifiers < 2) return undefined;
  return { key, ctrl: value.ctrl, meta: value.meta, alt: value.alt, shift: value.shift };
};

export const globalShortcutAccelerator = (binding) => {
  if (!binding) return null;
  return [
    binding.ctrl && "Control",
    binding.meta && "Command",
    binding.alt && "Alt",
    binding.shift && "Shift",
    binding.key.toUpperCase(),
  ].filter(Boolean).join("+");
};

export const formatGlobalShortcutForHumans = (binding, platform = process.platform) => {
  if (!binding) return "";
  const mac = platform === "darwin";
  const parts = [
    binding.ctrl && (mac ? "⌃" : "Ctrl"),
    binding.meta && (mac ? "⌘" : "Meta"),
    binding.alt && (mac ? "⌥" : "Alt"),
    binding.shift && (mac ? "⇧" : "Shift"),
    binding.key.toUpperCase(),
  ].filter(Boolean);
  return parts.join(mac ? "" : "+");
};

export const globalShortcutAcceleratorsConflict = (left, right) => {
  const first = globalShortcutAccelerator(left);
  const second = globalShortcutAccelerator(right);
  return Boolean(first && second && first === second);
};

// Older installs stored only the window shortcut. Keep that binding and treat a
// missing screenshot shortcut as unset.
export const parseStoredGlobalShortcuts = (stored, platform = process.platform) => {
  const normalize = (value) => {
    const binding = normalizeGlobalShortcutBinding(value, platform);
    return binding === undefined ? null : binding;
  };
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { binding: null, screenshot: null };
  }
  return {
    binding: normalize(stored.binding),
    screenshot: normalize(stored.screenshot),
  };
};

export const toggleMainWindow = ({ window, showWindow, activateApp }) => {
  if (!window || window.isDestroyed()) return false;
  if (window.isVisible() && !window.isMinimized() && window.isFocused()) {
    window.hide();
    return true;
  }
  activateApp?.();
  showWindow(window);
  return true;
};

export const replaceGlobalShortcut = async ({ globalShortcut, previous, next, callback, persist }) => {
  const oldAccelerator = globalShortcutAccelerator(previous);
  const nextAccelerator = globalShortcutAccelerator(next);
  if (nextAccelerator && nextAccelerator !== oldAccelerator) {
    try {
      if (!globalShortcut.register(nextAccelerator, callback)) return { ok: false, reason: "unavailable" };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
  try {
    await persist(next);
  } catch {
    if (nextAccelerator && nextAccelerator !== oldAccelerator) globalShortcut.unregister(nextAccelerator);
    return { ok: false, reason: "saveFailed" };
  }
  if (oldAccelerator && oldAccelerator !== nextAccelerator) globalShortcut.unregister(oldAccelerator);
  return { ok: true };
};
