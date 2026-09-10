import { existsSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";

export const RENDERER_STORAGE_MIGRATION_VERSION = 1;
export const RENDERER_STORAGE_MIGRATION_MARKER = "renderer-origin-v1-migrated";

const MIGRATED_DATABASE_NAMES = [
  "edgeever-local",
  "edgeever-plugin-packages-v1",
];
const PLUGIN_SECRET_DATABASE_NAME = "edgeever-plugin-secrets-v1";

// These functions intentionally contain all helpers in their own bodies. The
// main process serializes them into an isolated renderer whose only job is to
// move origin-scoped browser storage; they are never executed in Node.js.
export const exportLegacyRendererStorage = async () => {
  const requestResult = (request) => new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed")), { once: true });
  });
  const transactionDone = (transaction) => new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed")), { once: true });
  });
  const existingNames = new Set((await indexedDB.databases()).map((entry) => entry.name).filter(Boolean));
  const databases = [];

  for (const name of ["edgeever-local", "edgeever-plugin-packages-v1"]) {
    if (!existingNames.has(name)) continue;
    const database = await requestResult(indexedDB.open(name));
    try {
      const storeNames = Array.from(database.objectStoreNames);
      const transaction = database.transaction(storeNames, "readonly");
      const completed = transactionDone(transaction);
      const stores = await Promise.all(storeNames.map(async (storeName) => {
        const store = transaction.objectStore(storeName);
        const indexes = Array.from(store.indexNames).map((indexName) => {
          const index = store.index(indexName);
          return { name: index.name, keyPath: index.keyPath, multiEntry: index.multiEntry, unique: index.unique };
        });
        const [keys, values] = await Promise.all([
          requestResult(store.getAllKeys()),
          requestResult(store.getAll()),
        ]);
        return {
          name: store.name,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes,
          records: values.map((value, index) => ({ key: keys[index], value })),
        };
      }));
      await completed;
      databases.push({ name, version: database.version, stores });
    } finally {
      database.close();
    }
  }

  const pluginSecrets = [];
  if (existingNames.has("edgeever-plugin-secrets-v1")) {
    const database = await requestResult(indexedDB.open("edgeever-plugin-secrets-v1"));
    try {
      if (database.objectStoreNames.contains("keys") && database.objectStoreNames.contains("secrets")) {
        const transaction = database.transaction(["keys", "secrets"], "readonly");
        const completed = transactionDone(transaction);
        const key = await requestResult(transaction.objectStore("keys").get("device-master-key"));
        const records = await requestResult(transaction.objectStore("secrets").getAll());
        await completed;
        if (!key && records.length > 0) throw new Error("Plugin secret key is missing");
        for (const record of records) {
          const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: record.iv },
            key,
            record.ciphertext,
          );
          pluginSecrets.push({ id: record.id, value: new TextDecoder().decode(plaintext) });
        }
      }
    } finally {
      database.close();
    }
  }

  const localStorageEntries = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) localStorageEntries.push([key, localStorage.getItem(key)]);
  }
  return { version: 1, localStorageEntries, databases, pluginSecrets };
};

export const importRendererStorage = async (snapshot) => {
  if (!snapshot || snapshot.version !== 1) throw new Error("Unsupported renderer storage migration snapshot");
  const requestResult = (request) => new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed")), { once: true });
  });
  const transactionDone = (transaction) => new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed")), { once: true });
  });
  const deleteDatabase = (name) => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.addEventListener("success", resolve, { once: true });
    request.addEventListener("error", () => reject(request.error || new Error(`Could not reset ${name}`)), { once: true });
    request.addEventListener("blocked", () => reject(new Error(`Reset of ${name} was blocked`)), { once: true });
  });

  localStorage.clear();
  for (const [key, value] of snapshot.localStorageEntries) {
    if (typeof key === "string" && typeof value === "string") localStorage.setItem(key, value);
  }

  for (const databaseSnapshot of snapshot.databases) {
    await deleteDatabase(databaseSnapshot.name);
    const openRequest = indexedDB.open(databaseSnapshot.name, databaseSnapshot.version);
    openRequest.addEventListener("upgradeneeded", () => {
      for (const storeSnapshot of databaseSnapshot.stores) {
        const options = { autoIncrement: Boolean(storeSnapshot.autoIncrement) };
        if (storeSnapshot.keyPath !== null) options.keyPath = storeSnapshot.keyPath;
        const store = openRequest.result.createObjectStore(storeSnapshot.name, options);
        for (const indexSnapshot of storeSnapshot.indexes) {
          store.createIndex(indexSnapshot.name, indexSnapshot.keyPath, {
            multiEntry: Boolean(indexSnapshot.multiEntry),
            unique: Boolean(indexSnapshot.unique),
          });
        }
      }
    });
    const database = await requestResult(openRequest);
    try {
      const storeNames = databaseSnapshot.stores.map((store) => store.name);
      if (storeNames.length === 0) continue;
      const transaction = database.transaction(storeNames, "readwrite");
      const completed = transactionDone(transaction);
      for (const storeSnapshot of databaseSnapshot.stores) {
        const store = transaction.objectStore(storeSnapshot.name);
        for (const record of storeSnapshot.records) {
          if (store.keyPath === null) store.put(record.value, record.key);
          else store.put(record.value);
        }
      }
      await completed;
    } finally {
      database.close();
    }
  }

  await deleteDatabase("edgeever-plugin-secrets-v1");
  if (snapshot.pluginSecrets.length > 0) {
    const openRequest = indexedDB.open("edgeever-plugin-secrets-v1", 1);
    openRequest.addEventListener("upgradeneeded", () => {
      openRequest.result.createObjectStore("keys");
      openRequest.result.createObjectStore("secrets", { keyPath: "id" });
    });
    const database = await requestResult(openRequest);
    try {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const encryptedSecrets = await Promise.all(snapshot.pluginSecrets.map(async (secret) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(secret.value),
        );
        return { id: secret.id, iv, ciphertext };
      }));
      const transaction = database.transaction(["keys", "secrets"], "readwrite");
      const completed = transactionDone(transaction);
      transaction.objectStore("keys").put(key, "device-master-key");
      const secretStore = transaction.objectStore("secrets");
      for (const secret of encryptedSecrets) secretStore.put(secret);
      await completed;
    } finally {
      database.close();
    }
  }

  return {
    localStorageEntries: snapshot.localStorageEntries.length,
    databases: snapshot.databases.length,
    pluginSecrets: snapshot.pluginSecrets.length,
  };
};

const executeFunction = (webContents, fn, argument) => {
  const serializedArgument = argument === undefined
    ? ""
    : JSON.stringify(argument).replaceAll("<", "\\u003c");
  return webContents.executeJavaScript(`(${fn.toString()})(${serializedArgument})`, true);
};

export const migrateRendererStorageOrigin = async ({
  createWindow,
  legacyBridgeUrl,
  targetBridgeUrl,
  markerPath,
}) => {
  if (existsSync(markerPath)) return { state: "already-migrated" };
  let migrationWindow = null;
  try {
    migrationWindow = createWindow();
    await migrationWindow.loadURL(legacyBridgeUrl);
    const snapshot = await executeFunction(migrationWindow.webContents, exportLegacyRendererStorage);
    await migrationWindow.loadURL(targetBridgeUrl);
    const counts = await executeFunction(migrationWindow.webContents, importRendererStorage, snapshot);
    const temporaryMarkerPath = `${markerPath}.tmp`;
    await writeFile(temporaryMarkerPath, JSON.stringify({
      version: RENDERER_STORAGE_MIGRATION_VERSION,
      migratedAt: new Date().toISOString(),
      counts,
    }), { mode: 0o600 });
    await rename(temporaryMarkerPath, markerPath);
    return { state: "migrated", counts };
  } finally {
    if (migrationWindow && !migrationWindow.isDestroyed()) migrationWindow.destroy();
  }
};

export const rendererStorageMigrationDatabaseNames = () => [
  ...MIGRATED_DATABASE_NAMES,
  PLUGIN_SECRET_DATABASE_NAME,
];
