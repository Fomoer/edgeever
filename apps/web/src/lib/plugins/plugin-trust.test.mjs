import { describe, expect, test } from "bun:test";
import {
  acknowledgePluginTrustWarning,
  hasAcknowledgedPluginTrustWarning,
  PLUGIN_TRUST_ACKNOWLEDGEMENT_STORAGE_KEY,
  PLUGIN_TRUST_WARNING_COPY,
  shouldRequestPluginTrustAcknowledgement,
} from "./plugin-trust.ts";

describe("plugin trust acknowledgement", () => {
  test("uses a versioned key so materially changed copy can be acknowledged again", () => {
    expect(PLUGIN_TRUST_ACKNOWLEDGEMENT_STORAGE_KEY).toEndWith(String(PLUGIN_TRUST_WARNING_COPY.version));
  });

  test("persists a one-time acknowledgement", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(hasAcknowledgedPluginTrustWarning(storage)).toBe(false);
    acknowledgePluginTrustWarning(storage);
    expect(hasAcknowledgedPluginTrustWarning(storage)).toBe(true);
  });

  test("falls back to asking again when browser storage is unavailable", () => {
    const storage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };

    expect(hasAcknowledgedPluginTrustWarning(storage)).toBe(false);
    expect(() => acknowledgePluginTrustWarning(storage)).not.toThrow();
  });

  test("asks only before the first client-plugin enable", () => {
    expect(shouldRequestPluginTrustAcknowledgement({ acknowledged: false, enabled: true, extensionType: "plugin" })).toBe(true);
    expect(shouldRequestPluginTrustAcknowledgement({ acknowledged: true, enabled: true, extensionType: "plugin" })).toBe(false);
    expect(shouldRequestPluginTrustAcknowledgement({ acknowledged: false, enabled: false, extensionType: "plugin" })).toBe(false);
    expect(shouldRequestPluginTrustAcknowledgement({ acknowledged: false, enabled: true, extensionType: "theme" })).toBe(false);
  });
});
