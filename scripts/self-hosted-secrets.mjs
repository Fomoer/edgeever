import { randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FILE_SECRET_NAMES = [
  "EDGE_EVER_AUTH_PASSWORD",
  "EDGE_EVER_AUTH_PASSWORD_HASH",
  // Legacy decryption fallback for credentials saved by older releases.
  "EDGE_EVER_STORAGE_ENCRYPTION_KEY",
  "EDGE_EVER_CREDENTIALS_ENCRYPTION_KEY",
  "EDGE_EVER_S3_ACCESS_KEY_ID",
  "EDGE_EVER_S3_SECRET_ACCESS_KEY",
];

export const SELF_HOSTED_SECRETS_FILE_NAME = "edgeever-secrets.json";
const SECRETS_VERSION = 1;

const trimSecret = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
};

export const resolveSelfHostedSecretsPath = (dataDirectory) => (
  join(dataDirectory, SELF_HOSTED_SECRETS_FILE_NAME)
);

export const loadSelfHostedEnvironment = async (environment = process.env) => {
  const resolved = { ...environment };

  for (const name of FILE_SECRET_NAMES) {
    const fileName = `${name}_FILE`;
    const filePath = environment[fileName]?.trim();
    if (!filePath) continue;
    if (environment[name] !== undefined) {
      throw new Error(`Set either ${name} or ${fileName}, not both`);
    }

    resolved[name] = (await readFile(filePath, "utf8")).replace(/[\r\n]+$/, "");
    delete resolved[fileName];
  }

  return resolved;
};

export const hasSelfHostedCredentialSeed = (environment) => Boolean(
  trimSecret(environment.EDGE_EVER_CREDENTIALS_ENCRYPTION_KEY)
  || trimSecret(environment.EDGE_EVER_AUTH_PASSWORD)
  || trimSecret(environment.EDGE_EVER_AUTH_PASSWORD_HASH),
);

const corruptSecretsMessage = (filePath) => (
  `Credential secrets file ${filePath} is corrupt or unsupported. Restore it from a /data backup; do not generate a replacement key.`
);

const readPersistedSecrets = async (filePath) => {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(corruptSecretsMessage(filePath));
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== SECRETS_VERSION) {
    throw new Error(corruptSecretsMessage(filePath));
  }

  const secrets = {
    version: SECRETS_VERSION,
    authPassword: trimSecret(parsed.authPassword),
    authPasswordHash: trimSecret(parsed.authPasswordHash),
    credentialsEncryptionKey: trimSecret(parsed.credentialsEncryptionKey),
  };
  if (!secrets.authPassword && !secrets.authPasswordHash && !secrets.credentialsEncryptionKey) {
    throw new Error(corruptSecretsMessage(filePath));
  }
  return secrets;
};

const serializeSecrets = (secrets) => `${JSON.stringify({
  version: SECRETS_VERSION,
  ...(secrets.authPassword ? { authPassword: secrets.authPassword } : {}),
  ...(secrets.authPasswordHash ? { authPasswordHash: secrets.authPasswordHash } : {}),
  ...(secrets.credentialsEncryptionKey ? { credentialsEncryptionKey: secrets.credentialsEncryptionKey } : {}),
}, null, 2)}\n`;

const writePersistedSecrets = async (filePath, secrets) => {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, serializeSecrets(secrets), { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
  await chmod(filePath, 0o600);
};

const fillMissingSecrets = (stored, envSecrets) => {
  const next = { ...stored };
  let changed = false;
  if (!next.authPassword && envSecrets.authPassword) {
    next.authPassword = envSecrets.authPassword;
    changed = true;
  }
  if (!next.authPasswordHash && envSecrets.authPasswordHash) {
    next.authPasswordHash = envSecrets.authPasswordHash;
    changed = true;
  }
  if (!next.credentialsEncryptionKey && envSecrets.credentialsEncryptionKey) {
    next.credentialsEncryptionKey = envSecrets.credentialsEncryptionKey;
    changed = true;
  }
  return { secrets: next, changed };
};

const applyPersistedSecrets = (environment, stored, envSecrets) => {
  if (!envSecrets.authPassword && stored.authPassword) {
    environment.EDGE_EVER_AUTH_PASSWORD = stored.authPassword;
  }
  if (!envSecrets.authPasswordHash && stored.authPasswordHash) {
    environment.EDGE_EVER_AUTH_PASSWORD_HASH = stored.authPasswordHash;
  }
  if (!envSecrets.credentialsEncryptionKey && stored.credentialsEncryptionKey) {
    environment.EDGE_EVER_CREDENTIALS_ENCRYPTION_KEY = stored.credentialsEncryptionKey;
  }
  if (stored.authPassword && envSecrets.authPassword && stored.authPassword !== envSecrets.authPassword) {
    environment.EDGE_EVER_AUTH_PASSWORD_FALLBACK = stored.authPassword;
  }
  if (
    stored.credentialsEncryptionKey
    && envSecrets.credentialsEncryptionKey
    && stored.credentialsEncryptionKey !== envSecrets.credentialsEncryptionKey
  ) {
    environment.EDGE_EVER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = stored.credentialsEncryptionKey;
  }
  return environment;
};

/**
 * Persist the self-hosted credential-encryption root on the data volume so NAS
 * GUI upgrades that drop container environment variables can still encrypt AI
 * and object-storage secrets. The file lives beside SQLite, never inside it.
 */
export const ensureSelfHostedCredentialSecrets = async (
  dataDirectory,
  environment,
  options = {},
) => {
  const generateIfMissing = options.generateIfMissing === true;
  const filePath = resolveSelfHostedSecretsPath(dataDirectory);
  const envSecrets = {
    authPassword: trimSecret(environment.EDGE_EVER_AUTH_PASSWORD),
    authPasswordHash: trimSecret(environment.EDGE_EVER_AUTH_PASSWORD_HASH),
    credentialsEncryptionKey: trimSecret(environment.EDGE_EVER_CREDENTIALS_ENCRYPTION_KEY),
  };
  let stored = await readPersistedSecrets(filePath);
  let persisted = false;
  let generated = false;

  if (!stored) {
    stored = {
      version: SECRETS_VERSION,
      authPassword: envSecrets.authPassword,
      authPasswordHash: envSecrets.authPasswordHash,
      credentialsEncryptionKey: envSecrets.credentialsEncryptionKey,
    };
    if (!stored.authPassword && !stored.authPasswordHash && !stored.credentialsEncryptionKey) {
      if (!generateIfMissing) return environment;
      stored.credentialsEncryptionKey = randomBytes(32).toString("hex");
      generated = true;
    }
    await writePersistedSecrets(filePath, stored);
    persisted = true;
  } else {
    const merged = fillMissingSecrets(stored, envSecrets);
    if (merged.changed) {
      stored = merged.secrets;
      await writePersistedSecrets(filePath, stored);
      persisted = true;
    } else {
      stored = merged.secrets;
    }
  }

  if (generated) {
    console.info(
      `[self-hosted] generated a credential encryption secret at ${filePath}. `
      + "Existing encrypted AI or object-storage credentials cannot be decrypted unless the original authentication secret is restored.",
    );
  } else if (persisted) {
    console.info(`[self-hosted] persisted credential encryption secret to ${filePath}`);
  }

  return applyPersistedSecrets(environment, stored, envSecrets);
};
