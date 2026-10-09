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
