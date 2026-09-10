import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RENDERER_STORAGE_MIGRATION_MARKER,
  migrateRendererStorageOrigin,
  rendererStorageMigrationDatabaseNames,
} from "./renderer-storage-migration.mjs";

describe("renderer storage origin migration", () => {
  test("covers every persistent IndexedDB database", () => {
    expect(rendererStorageMigrationDatabaseNames()).toEqual([
      "edgeever-local",
      "edgeever-plugin-packages-v1",
      "edgeever-plugin-secrets-v1",
    ]);
  });

  test("writes the marker only after export and import both succeed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edgeever-origin-migration-"));
    const markerPath = join(directory, RENDERER_STORAGE_MIGRATION_MARKER);
    const loadedUrls = [];
    const destroyed = [];
    const snapshot = { version: 1, localStorageEntries: [["theme", "dark"]], databases: [], pluginSecrets: [] };
    let executionIndex = 0;
    const createWindow = () => {
      let isDestroyed = false;
      return {
        async loadURL(url) { loadedUrls.push(url); },
        destroy() { isDestroyed = true; destroyed.push(0); },
        isDestroyed() { return isDestroyed; },
        webContents: {
          async executeJavaScript() {
            return executionIndex++ === 0 ? snapshot : { localStorageEntries: 1, databases: 0, pluginSecrets: 0 };
          },
        },
      };
    };

    try {
      const result = await migrateRendererStorageOrigin({
        createWindow,
        legacyBridgeUrl: "file:///bundle/desktop-storage-bridge.html",
        targetBridgeUrl: "edgeever-app://app/desktop-storage-bridge.html",
        markerPath,
      });
      expect(result.state).toBe("migrated");
      expect(loadedUrls).toEqual([
        "file:///bundle/desktop-storage-bridge.html",
        "edgeever-app://app/desktop-storage-bridge.html",
      ]);
      expect(destroyed).toEqual([0]);
      expect(JSON.parse(await readFile(markerPath, "utf8"))).toMatchObject({
        version: 1,
        counts: { localStorageEntries: 1, databases: 0, pluginSecrets: 0 },
      });

      const second = await migrateRendererStorageOrigin({
        createWindow: () => { throw new Error("should not create a window"); },
        legacyBridgeUrl: "file:///ignored",
        targetBridgeUrl: "edgeever-app://app/ignored",
        markerPath,
      });
      expect(second.state).toBe("already-migrated");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("does not mark a failed import as migrated", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edgeever-origin-migration-failure-"));
    const markerPath = join(directory, RENDERER_STORAGE_MIGRATION_MARKER);
    let executionIndex = 0;
    try {
      await expect(migrateRendererStorageOrigin({
        createWindow: () => {
          let destroyed = false;
          return {
            async loadURL() {},
            destroy() { destroyed = true; },
            isDestroyed() { return destroyed; },
            webContents: {
              async executeJavaScript() {
                if (executionIndex++ === 0) return { version: 1, localStorageEntries: [], databases: [], pluginSecrets: [] };
                throw new Error("import failed");
              },
            },
          };
        },
        legacyBridgeUrl: "file:///bundle/desktop-storage-bridge.html",
        targetBridgeUrl: "edgeever-app://app/desktop-storage-bridge.html",
        markerPath,
      })).rejects.toThrow("import failed");
      expect(await Bun.file(markerPath).exists()).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
