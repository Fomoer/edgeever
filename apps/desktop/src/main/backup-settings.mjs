export const BACKUP_INTERVALS = ["daily", "weekly", "biweekly", "monthly"];
export const BACKUP_RETENTION = [1, 3, 5, 10, 20];
export const backupError = (code, message) => Object.assign(new Error(message), { code });

export const normalizeBackupConfig = (input, directory) => {
  if (input === undefined) return { enabled: false, interval: "weekly", retention: 1, directory, encrypted: false };
  if (!input || typeof input.enabled !== "boolean" || typeof input.encrypted !== "boolean"
    || !BACKUP_INTERVALS.includes(input.interval) || !BACKUP_RETENTION.includes(input.retention)
    || typeof input.directory !== "string" || !input.directory) throw backupError("backup_invalid_configuration", "The backup configuration is invalid.");
  return { enabled: input.enabled, interval: input.interval, retention: input.retention, directory: input.directory, encrypted: input.encrypted };
};

export const nextBackupAt = (lastSuccessAt, interval) => {
  if (!lastSuccessAt) return null;
  const date = new Date(lastSuccessAt);
  if (interval === "monthly") {
    const day = date.getDate();
    date.setDate(1); date.setMonth(date.getMonth() + 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, last));
  } else date.setDate(date.getDate() + ({ daily: 1, weekly: 7, biweekly: 14 })[interval]);
  return date.toISOString();
};

export const backupFileName = (value, encrypted) => {
  if (typeof value !== "string") throw backupError("backup_name_invalid", "Enter a backup name.");
  const name = value.trim().replace(/(?:\.edgeever\.enc|\.zip)$/i, "");
  const hasControlCharacter = Array.from(name).some((character) => character.charCodeAt(0) < 32);
  if (!name || hasControlCharacter || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw backupError("backup_name_invalid", "Use a filename without paths or reserved characters.");
  }
  return `${name}${encrypted ? ".edgeever.enc" : ".zip"}`;
};
