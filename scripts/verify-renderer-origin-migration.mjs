import { app, BrowserWindow, protocol } from "electron";
import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DESKTOP_APP_ORIGIN,
  DESKTOP_APP_SCHEME,
  createDesktopAppProtocolHandler,
} from "../apps/desktop/src/main/app-protocol.mjs";
import {
  RENDERER_STORAGE_MIGRATION_MARKER,
  migrateRendererStorageOrigin,
} from "../apps/desktop/src/main/renderer-storage-migration.mjs";

console.log("renderer-origin: verifier loaded");

protocol.registerSchemesAsPrivileged([{
  scheme: DESKTOP_APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
}]);

const testDirectory = mkdtempSync(join(tmpdir(), "edgeever-renderer-origin-"));
const userDataDirectory = join(testDirectory, "profile");
const webRoot = join(testDirectory, "web");
const legacyEntryPath = join(webRoot, "index.html");
const bridgePath = join(webRoot, "desktop-storage-bridge.html");
const markerPath = join(userDataDirectory, RENDERER_STORAGE_MIGRATION_MARKER);
app.setPath("userData", userDataDirectory);

const createWindow = () => new BrowserWindow({
  show: false,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});

const execute = (webContents, fn) =>
  webContents.executeJavaScript(`(${fn.toString()})()`, true);

const seedLegacyStorage = async () => {
  const requestResult = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transactionDone = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  localStorage.setItem("edgeever.test.origin-migration", "preserved");

  const localOpen = indexedDB.open("edgeever-local", 1);
  localOpen.onupgradeneeded = () => localOpen.result.createObjectStore("drafts", { keyPath: "memoId" });
  const local = await requestResult(localOpen);
  const localTransaction = local.transaction("drafts", "readwrite");
  const localCompleted = transactionDone(localTransaction);
  localTransaction.objectStore("drafts").put({ memoId: "draft-1", title: "Unsynced draft", updatedAt: "2026-09-09T00:00:00.000Z" });
  await localCompleted;
  local.close();

  const packageOpen = indexedDB.open("edgeever-plugin-packages-v1", 2);
  packageOpen.onupgradeneeded = () => {
    const store = packageOpen.result.createObjectStore("packageVersions", { keyPath: ["pluginId", "version"] });
    store.createIndex("pluginId", "pluginId");
  };
  const packages = await requestResult(packageOpen);
  const packageTransaction = packages.transaction("packageVersions", "readwrite");
  const packageCompleted = transactionDone(packageTransaction);
  packageTransaction.objectStore("packageVersions").put({ pluginId: "org.edgeever.test", version: "1.0.0", mainJs: "export default {}" });
  await packageCompleted;
  packages.close();

  const secretOpen = indexedDB.open("edgeever-plugin-secrets-v1", 1);
  secretOpen.onupgradeneeded = () => {
    secretOpen.result.createObjectStore("keys");
    secretOpen.result.createObjectStore("secrets", { keyPath: "id" });
  };
  const secrets = await requestResult(secretOpen);
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("secret-value"));
  const secretTransaction = secrets.transaction(["keys", "secrets"], "readwrite");
  const secretCompleted = transactionDone(secretTransaction);
  secretTransaction.objectStore("keys").put(key, "device-master-key");
  secretTransaction.objectStore("secrets").put({ id: "org.edgeever.test:token", iv, ciphertext });
  await secretCompleted;
  secrets.close();
};

const inspectStorage = async () => {
  const requestResult = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transactionDone = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const local = await requestResult(indexedDB.open("edgeever-local"));
  const localTransaction = local.transaction("drafts", "readonly");
  const localCompleted = transactionDone(localTransaction);
  const draft = await requestResult(localTransaction.objectStore("drafts").get("draft-1"));
  await localCompleted;
  local.close();

  const packages = await requestResult(indexedDB.open("edgeever-plugin-packages-v1"));
  const packageTransaction = packages.transaction("packageVersions", "readonly");
  const packageCompleted = transactionDone(packageTransaction);
  const pluginPackage = await requestResult(packageTransaction.objectStore("packageVersions").get(["org.edgeever.test", "1.0.0"]));
  await packageCompleted;
  packages.close();

  const secrets = await requestResult(indexedDB.open("edgeever-plugin-secrets-v1"));
  const secretTransaction = secrets.transaction(["keys", "secrets"], "readonly");
  const secretCompleted = transactionDone(secretTransaction);
  const key = await requestResult(secretTransaction.objectStore("keys").get("device-master-key"));
  const encrypted = await requestResult(secretTransaction.objectStore("secrets").get("org.edgeever.test:token"));
  await secretCompleted;
  secrets.close();
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: encrypted.iv }, key, encrypted.ciphertext);
  return {
    origin: window.location.origin,
    localStorageValue: localStorage.getItem("edgeever.test.origin-migration"),
    draftTitle: draft?.title,
    packageVersion: pluginPackage?.version,
    secret: new TextDecoder().decode(plaintext),
  };
};

let legacyWindow;
let targetWindow;
const run = async () => {
try {
  console.log("renderer-origin: app ready");
  await mkdir(webRoot, { recursive: true });
  await writeFile(legacyEntryPath, "<!doctype html><meta charset=\"utf-8\"><title>Legacy entry</title>");
  await writeFile(bridgePath, "<!doctype html><meta charset=\"utf-8\"><title>Storage bridge</title>");
  protocol.handle(DESKTOP_APP_SCHEME, createDesktopAppProtocolHandler({ webRoot }));
  const legacyBridgeUrl = pathToFileURL(bridgePath).href;
  const legacyEntryUrl = pathToFileURL(legacyEntryPath).href;
  const targetBridgeUrl = `${DESKTOP_APP_ORIGIN}/desktop-storage-bridge.html`;

  legacyWindow = createWindow();
  await legacyWindow.loadURL(legacyEntryUrl);
  console.log("renderer-origin: legacy entry loaded");
  await execute(legacyWindow.webContents, seedLegacyStorage);
  console.log("renderer-origin: legacy storage seeded");

  const migration = await migrateRendererStorageOrigin({
    createWindow,
    legacyBridgeUrl,
    targetBridgeUrl,
    markerPath,
  });
  console.log("renderer-origin: migration completed");
  if (migration.state !== "migrated") throw new Error(`Unexpected migration state: ${migration.state}`);

  targetWindow = createWindow();
  await targetWindow.loadURL(targetBridgeUrl);
  console.log("renderer-origin: target bridge loaded");
  const migrated = await execute(targetWindow.webContents, inspectStorage);
  targetWindow.destroy();
  targetWindow = null;
  if (migrated.origin !== DESKTOP_APP_ORIGIN) throw new Error(`Unexpected target origin: ${migrated.origin}`);
  if (migrated.localStorageValue !== "preserved") throw new Error("localStorage was not migrated");
  if (migrated.draftTitle !== "Unsynced draft") throw new Error("Offline drafts were not migrated");
  if (migrated.packageVersion !== "1.0.0") throw new Error("Plugin packages were not migrated");
  if (migrated.secret !== "secret-value") throw new Error("Plugin secrets were not migrated");

  const legacy = await execute(legacyWindow.webContents, inspectStorage);
  if (legacy.localStorageValue !== "preserved" || legacy.draftTitle !== "Unsynced draft") {
    throw new Error("Legacy file origin was modified during migration");
  }

  console.log(JSON.stringify({ ok: true, migration, migrated }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (legacyWindow && !legacyWindow.isDestroyed()) legacyWindow.destroy();
  if (targetWindow && !targetWindow.isDestroyed()) targetWindow.destroy();
  await rm(testDirectory, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
}
};

app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});
