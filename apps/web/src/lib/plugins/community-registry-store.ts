import type { MarketplaceRevocation } from "@edgeever/plugin-api";

const DATABASE_NAME = "edgeever-community-registry-v1";
const DATABASE_VERSION = 1;
const REGISTRY_STORE = "registries";
const REVOCATION_STORE = "revocations";

export interface CachedCommunityRegistry {
  instanceKey: string;
  registryBase64: string;
  signatureBase64: string;
  updatedAt: string;
}

export interface CommunityRegistryStorage {
  readRegistry(instanceKey: string): Promise<CachedCommunityRegistry | null>;
  writeRegistry(value: CachedCommunityRegistry): Promise<void>;
  readRevocations(): Promise<MarketplaceRevocation[]>;
  writeRevocations(values: readonly MarketplaceRevocation[]): Promise<void>;
}

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.addEventListener("complete", () => resolve(), { once: true });
  transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")), { once: true });
  transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")), { once: true });
});

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("IndexedDB is unavailable."));
    return;
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(REGISTRY_STORE)) {
      request.result.createObjectStore(REGISTRY_STORE, { keyPath: "instanceKey" });
    }
    if (!request.result.objectStoreNames.contains(REVOCATION_STORE)) {
      request.result.createObjectStore(REVOCATION_STORE, { keyPath: "id" });
    }
  });
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("Community registry storage is unavailable.")), { once: true });
});

export class WebCommunityRegistryStore implements CommunityRegistryStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private database() {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  async readRegistry(instanceKey: string) {
    const database = await this.database();
    const transaction = database.transaction(REGISTRY_STORE, "readonly");
    const value = await requestResult(transaction.objectStore(REGISTRY_STORE).get(instanceKey)) as CachedCommunityRegistry | undefined;
    await transactionDone(transaction);
    return value ?? null;
  }

  async writeRegistry(value: CachedCommunityRegistry) {
    const database = await this.database();
    const transaction = database.transaction(REGISTRY_STORE, "readwrite");
    transaction.objectStore(REGISTRY_STORE).put(value);
    await transactionDone(transaction);
  }

  async readRevocations() {
    const database = await this.database();
    const transaction = database.transaction(REVOCATION_STORE, "readonly");
    const values = await requestResult(transaction.objectStore(REVOCATION_STORE).getAll()) as MarketplaceRevocation[];
    await transactionDone(transaction);
    return values;
  }

  async writeRevocations(values: readonly MarketplaceRevocation[]) {
    const database = await this.database();
    const transaction = database.transaction(REVOCATION_STORE, "readwrite");
    const store = transaction.objectStore(REVOCATION_STORE);
    store.clear();
    for (const value of values) store.put(value);
    await transactionDone(transaction);
  }
}

export const createMemoryCommunityRegistryStorage = (): CommunityRegistryStorage => {
  const registries = new Map<string, CachedCommunityRegistry>();
  let revocations: MarketplaceRevocation[] = [];
  return {
    readRegistry: async (instanceKey) => registries.get(instanceKey) ?? null,
    writeRegistry: async (value) => {
      registries.set(value.instanceKey, value);
    },
    readRevocations: async () => revocations.map((item) => ({ ...item })),
    writeRevocations: async (values) => {
      revocations = values.map((item) => ({ ...item }));
    },
  };
};

let defaultStore: CommunityRegistryStorage | null = null;

export const communityRegistryStorage = () => {
  if (!defaultStore) {
    defaultStore = typeof indexedDB === "undefined"
      ? createMemoryCommunityRegistryStorage()
      : new WebCommunityRegistryStore();
  }
  return defaultStore;
};

export const readRevokedPluginIds = async (storage = communityRegistryStorage()) => {
  try {
    const revocations = await storage.readRevocations();
    return new Set(revocations.map((item) => item.id));
  } catch {
    return new Set<string>();
  }
};

export const isPluginIdRevoked = async (pluginId: string, storage = communityRegistryStorage()) =>
  (await readRevokedPluginIds(storage)).has(pluginId);
