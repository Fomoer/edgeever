import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_WEBDAV_BACKUP_CONFIG,
  DEFAULT_WEBDAV_BACKUP_SCHEDULE,
  isWebDavBackupDue,
  loadWebDavBackupConfig,
  loadWebDavBackupPassword,
  loadWebDavBackupSchedule,
  normalizeWebDavBackupConfig,
  saveWebDavBackupConfig,
  saveWebDavBackupPassword,
  saveWebDavBackupSchedule,
  testWebDavConnection,
  uploadWebDavBackup,
} from "./webdav-backup.ts";

const DAY = 24 * 60 * 60 * 1000;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

const installStorage = (initial = {}, { throwOnRead = false } = {}) => {
  const values = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) => {
          if (throwOnRead) throw new Error("storage disabled");
          return values.has(key) ? values.get(key) : null;
        },
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
      },
    },
  });
  return values;
};

const servers = [];
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete globalThis.window;
  for (const server of servers.splice(0)) server.stop(true);
});

// Minimal WebDAV endpoint: enough of PROPFIND/MKCOL/PUT for the webdav client.
const startWebDav = ({ password = "secret", rejectPut = false } = {}) => {
  const requests = [];
  const files = new Map();
  const collections = new Set(["/"]);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "") || "/";
      const body = request.method === "PUT" ? new Uint8Array(await request.arrayBuffer()) : null;
      requests.push({ method: request.method, path, headers: Object.fromEntries(request.headers), body });
      if (request.headers.get("authorization") !== `Basic ${btoa(`alice:${password}`)}`) return new Response(null, { status: 401 });
      if (request.method === "PROPFIND") {
        if (!collections.has(path)) return new Response(null, { status: 404 });
        return new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${path}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`, { status: 207, headers: { "Content-Type": "application/xml" } });
      }
      if (request.method === "MKCOL") {
        if (collections.has(path)) return new Response(null, { status: 405 });
        collections.add(path);
        return new Response(null, { status: 201 });
      }
      if (request.method === "PUT") {
        if (rejectPut || (files.has(path) && request.headers.get("if-none-match") === "*")) return new Response(null, { status: 412 });
        files.set(path, body);
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 405 });
    },
  });
  servers.push(server);
  return { url: `http://127.0.0.1:${server.port}`, requests, files, collections };
};

describe("normalizeWebDavBackupConfig", () => {
  test("trims fields, drops trailing URL slashes and normalizes the remote path", () => {
    expect(normalizeWebDavBackupConfig({ url: " https://dav.example.com/remote.php/dav/// ", username: " alice ", remotePath: " \\Backups\\EdgeEver\\ " })).toEqual({
      url: "https://dav.example.com/remote.php/dav",
      username: "alice",
      remotePath: "/Backups/EdgeEver",
    });
  });

  test("collapses empty and root remote paths to /", () => {
    for (const remotePath of ["", "   ", "/", "///"]) {
      expect(normalizeWebDavBackupConfig({ url: "", username: "", remotePath }).remotePath).toBe("/");
    }
  });
});

describe("config persistence", () => {
  test("returns defaults when nothing is stored, the JSON is corrupt or storage throws", () => {
    installStorage();
    expect(loadWebDavBackupConfig()).toEqual(DEFAULT_WEBDAV_BACKUP_CONFIG);
    installStorage({ "edgeever.webdav-backup-config": "{not json" });
    expect(loadWebDavBackupConfig()).toEqual(DEFAULT_WEBDAV_BACKUP_CONFIG);
    installStorage({}, { throwOnRead: true });
    expect(loadWebDavBackupConfig()).toEqual(DEFAULT_WEBDAV_BACKUP_CONFIG);
  });

  test("saves the normalized config and merges partial stored values with defaults", () => {
    const values = installStorage();
    const saved = saveWebDavBackupConfig({ url: "https://dav.example.com/", username: " alice ", remotePath: "notes/" });
    expect(saved).toEqual({ url: "https://dav.example.com", username: "alice", remotePath: "/notes" });
    expect(JSON.parse(values.get("edgeever.webdav-backup-config"))).toEqual(saved);
    expect(loadWebDavBackupConfig()).toEqual(saved);

    installStorage({ "edgeever.webdav-backup-config": JSON.stringify({ url: "https://dav.example.com" }) });
    expect(loadWebDavBackupConfig()).toEqual({ ...DEFAULT_WEBDAV_BACKUP_CONFIG, url: "https://dav.example.com" });
  });
});

describe("password persistence", () => {
  test("never returns a stored password and purges it while automatic backups are disabled", () => {
    const values = installStorage();
    saveWebDavBackupPassword("hunter2");
    expect(values.get("edgeever.webdav-backup-password")).toBe("hunter2");
    expect(loadWebDavBackupPassword()).toBe("");
    expect(values.has("edgeever.webdav-backup-password")).toBe(false);
  });

  test("returns an empty password when storage is unavailable", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    expect(loadWebDavBackupPassword()).toBe("");
  });
});

describe("schedule persistence", () => {
  test("round-trips a saved schedule", () => {
    installStorage();
    const schedule = { enabled: true, intervalDays: 14, lastSuccessAt: "2026-10-01T00:00:00.000Z", lastAttemptAt: "2026-10-02T00:00:00.000Z" };
    expect(saveWebDavBackupSchedule(schedule)).toBe(schedule);
    expect(loadWebDavBackupSchedule()).toEqual(schedule);
  });

  test("sanitizes unknown intervals, non-boolean flags and non-string timestamps", () => {
    installStorage({ "edgeever.webdav-backup-schedule": JSON.stringify({ enabled: "true", intervalDays: 3, lastSuccessAt: 123, lastAttemptAt: null }) });
    expect(loadWebDavBackupSchedule()).toEqual(DEFAULT_WEBDAV_BACKUP_SCHEDULE);
    installStorage({ "edgeever.webdav-backup-schedule": JSON.stringify({ enabled: true, intervalDays: "30" }) });
    expect(loadWebDavBackupSchedule()).toEqual({ ...DEFAULT_WEBDAV_BACKUP_SCHEDULE, enabled: true, intervalDays: 30 });
  });

  test("returns defaults when nothing is stored or the JSON is corrupt", () => {
    installStorage();
    expect(loadWebDavBackupSchedule()).toEqual(DEFAULT_WEBDAV_BACKUP_SCHEDULE);
    installStorage({ "edgeever.webdav-backup-schedule": "[" });
    expect(loadWebDavBackupSchedule()).toEqual(DEFAULT_WEBDAV_BACKUP_SCHEDULE);
  });
});

describe("isWebDavBackupDue", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  const schedule = (overrides) => ({ ...DEFAULT_WEBDAV_BACKUP_SCHEDULE, enabled: true, intervalDays: 7, ...overrides });

  test("is never due while disabled", () => {
    expect(isWebDavBackupDue(schedule({ enabled: false }), now)).toBe(false);
  });

  test("is due when there is no previous run or the timestamp is unreadable", () => {
    expect(isWebDavBackupDue(schedule(), now)).toBe(true);
    expect(isWebDavBackupDue(schedule({ lastAttemptAt: "not a date" }), now)).toBe(true);
  });

  test("becomes due exactly when the interval has elapsed", () => {
    expect(isWebDavBackupDue(schedule({ lastSuccessAt: new Date(now - 7 * DAY + 1).toISOString() }), now)).toBe(false);
    expect(isWebDavBackupDue(schedule({ lastSuccessAt: new Date(now - 7 * DAY).toISOString() }), now)).toBe(true);
  });

  test("measures from the last attempt so failing servers are not retried on every tick", () => {
    expect(isWebDavBackupDue(schedule({ lastSuccessAt: new Date(now - 30 * DAY).toISOString(), lastAttemptAt: new Date(now - DAY).toISOString() }), now)).toBe(false);
  });
});

describe("WebDAV client", () => {
  test("rejects non-HTTP URLs and missing passwords before any request", async () => {
    await expect(testWebDavConnection({ url: "ftp://dav.example.com", username: "alice", remotePath: "/" }, "secret")).rejects.toThrow("WebDAV URL must start with http:// or https://.");
    await expect(uploadWebDavBackup({ url: "https://dav.example.com", username: "alice", remotePath: "/" }, "", new Blob(["x"]))).rejects.toThrow("WebDAV password is required.");
  });

  test("tests the connection by listing the normalized remote directory with basic auth", async () => {
    const dav = startWebDav();
    dav.collections.add("/EdgeEver/backups");
    await testWebDavConnection({ url: `${dav.url}/`, username: " alice ", remotePath: "EdgeEver/backups/" }, "secret");
    expect(dav.requests.map(({ method, path }) => [method, path])).toEqual([["PROPFIND", "/EdgeEver/backups"]]);
  });

  test("surfaces authentication and missing-directory failures", async () => {
    const dav = startWebDav();
    await expect(testWebDavConnection({ url: dav.url, username: "alice", remotePath: "/" }, "wrong")).rejects.toThrow();
    await expect(testWebDavConnection({ url: dav.url, username: "alice", remotePath: "/missing" }, "secret")).rejects.toThrow();
  });

  test("creates the remote directory and uploads a timestamped archive without overwriting", async () => {
    const dav = startWebDav();
    const archive = new Blob([new Uint8Array([80, 75, 3, 4, 1, 2, 3])], { type: "application/zip" });
    const result = await uploadWebDavBackup({ url: dav.url, username: "alice", remotePath: "/EdgeEver/backups" }, "secret", archive, new Date("2026-10-29T08:15:30.123Z"));
    expect(result).toEqual({ filename: "edgeever-2026-10-29T08-15-30-123Z.zip", remotePath: "/EdgeEver/backups/edgeever-2026-10-29T08-15-30-123Z.zip", size: 7 });
    expect(dav.collections.has("/EdgeEver/backups")).toBe(true);
    expect(dav.files.get(result.remotePath)).toEqual(new Uint8Array([80, 75, 3, 4, 1, 2, 3]));
    const put = dav.requests.find(({ method }) => method === "PUT");
    expect(put.headers["if-none-match"]).toBe("*");
  });

  test("reports a rejected upload instead of claiming success", async () => {
    const dav = startWebDav({ rejectPut: true });
    await expect(uploadWebDavBackup({ url: dav.url, username: "alice", remotePath: "/EdgeEver/backups" }, "secret", new Blob(["zip"]))).rejects.toThrow();
  });

  test("does not overwrite an existing archive with the same timestamp", async () => {
    const dav = startWebDav();
    const config = { url: dav.url, username: "alice", remotePath: "/EdgeEver/backups" };
    const timestamp = new Date("2026-10-29T08:15:30.123Z");
    await uploadWebDavBackup(config, "secret", new Blob(["first"]), timestamp);
    await expect(uploadWebDavBackup(config, "secret", new Blob(["second"]), timestamp)).rejects.toThrow();
    expect(new TextDecoder().decode(dav.files.get("/EdgeEver/backups/edgeever-2026-10-29T08-15-30-123Z.zip"))).toBe("first");
  });

  test("uploads into the server root without a double slash", async () => {
    const dav = startWebDav();
    const result = await uploadWebDavBackup({ url: dav.url, username: "alice", remotePath: "/" }, "secret", new Blob(["zip"]), new Date("2026-10-29T08:15:30.123Z"));
    expect(result.remotePath).toBe("/edgeever-2026-10-29T08-15-30-123Z.zip");
  });
});
