import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { globSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "./auth-crypto.ts";
import { registerAuthRoutes } from "./auth-routes.ts";
import {
  authenticateRequest,
  authenticateSession,
  createSession,
  getBearerToken,
  getInstanceAuthMode,
  getInstanceUser,
  getLoginAttemptKeys,
  revokeSession,
  setSessionCookie,
  tooManyLoginAttempts,
  verifyLogin,
} from "./auth-service.ts";
import { sha256 } from "./hash-utils.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { registerUserRoutes } from "./user-routes.ts";
import { ensureUserWorkspace } from "./workspace-provisioning.ts";

const ownerAuth = {
  kind: "user",
  actorType: "user",
  actorId: "usr_owner",
  username: "owner",
  displayName: "Owner",
  scopes: [],
  workspaceId: "ws_owner",
  role: "owner",
};

const createEnvironment = (rows = []) => ({
  storage: {
    db: {
      prepare: () => ({
        all: async () => ({ results: rows }),
      }),
      batch: async () => [],
    },
    resources: {},
  },
});

const createApp = (authenticateRequest) => {
  const app = new Hono();
  registerUserRoutes(app, {
    authenticateRequest,
    getInstanceUser: async () => null,
  });
  return app;
};

describe("user route contracts", () => {
  test("rejects unauthenticated user listing", async () => {
    const app = createApp(async () => null);
    const response = await app.request("/api/v1/users", {}, createEnvironment());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  test("rejects non-owner user listing", async () => {
    const app = createApp(async () => ({ ...ownerAuth, role: "member" }));
    const response = await app.request("/api/v1/users", {}, createEnvironment());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  test("maps owner-visible users at the HTTP boundary", async () => {
    const app = createApp(async () => ownerAuth);
    const response = await app.request("/api/v1/users", {}, createEnvironment([{
      id: "usr_member",
      username: "writer",
      password_hash: "hidden",
      display_name: "Writer",
      is_disabled: 0,
      last_login_at: null,
      created_at: "2026-08-08T00:00:00.000Z",
      role: "member",
    }]));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{
        id: "usr_member",
        username: "writer",
        displayName: "Writer",
        role: "member",
        isDisabled: false,
        lastLoginAt: null,
        createdAt: "2026-08-08T00:00:00.000Z",
      }],
    });
  });
});


describe("instance attachment storage usage", () => {
  for (const [name, auth, status] of [
    ["anonymous requests", null, 401],
    ["members", { ...ownerAuth, role: "member" }, 403],
    ["API tokens even with owner role", { ...ownerAuth, kind: "token", actorType: "agent", scopes: ["read:resources"] }, 403],
  ]) {
    test(`rejects ${name} before querying storage`, async () => {
      const app = createApp(async () => auth);
      const response = await app.request("/api/v1/instance/storage-usage", {}, {
        storage: { db: { prepare() { throw new Error("Unauthorized query"); } } },
      });
      expect(response.status).toBe(status);
    });
  }

  test("aggregates every workspace without a list limit, excluding deleted resources", async () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY, is_disabled INTEGER);
        CREATE TABLE workspace_members (workspace_id TEXT, user_id TEXT);
        CREATE TABLE memos (id TEXT PRIMARY KEY, workspace_id TEXT, is_deleted INTEGER);
        CREATE TABLE resources (memo_id TEXT, kind TEXT, byte_size INTEGER, is_deleted INTEGER);
        INSERT INTO users VALUES ('owner', 0), ('disabled_member', 1), ('empty_member', 0);
        INSERT INTO workspace_members VALUES ('ws_owner', 'owner'), ('ws_member', 'disabled_member'), ('ws_empty', 'empty_member');
        INSERT INTO memos VALUES ('owner_note', 'ws_owner', 0), ('member_note', 'ws_member', 0), ('trash_note', 'ws_member', 1);
        INSERT INTO resources VALUES ('member_note', 'attachment', 2048, 0), ('trash_note', 'image', 8192, 1), ('owner_note', 'attachment', 4096, 1);
      `);
      const insert = sqlite.query("INSERT INTO resources VALUES ('owner_note', 'image', 1024, 0)");
      for (let index = 0; index < 501; index++) insert.run();
      const env = { storage: { db: { prepare: (sql) => ({ first: async () => sqlite.query(sql).get(), all: async () => ({ results: sqlite.query(sql).all() }) }) } } };
      const app = createApp(async () => ownerAuth);
      const response = await app.request("/api/v1/instance/storage-usage", {}, env);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.summary).toEqual({
        totalCount: 502, totalBytes: 501 * 1024 + 2048, imageCount: 501, attachmentCount: 1,
      });
      expect(result.users.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
        { userId: "disabled_member", summary: { totalCount: 1, totalBytes: 2048, imageCount: 0, attachmentCount: 1 } },
        { userId: "empty_member", summary: { totalCount: 0, totalBytes: 0, imageCount: 0, attachmentCount: 0 } },
        { userId: "owner", summary: { totalCount: 501, totalBytes: 501 * 1024, imageCount: 501, attachmentCount: 0 } },
      ]);
      expect(result.users.reduce((sum, user) => sum + user.summary.totalBytes, 0)).toBe(result.summary.totalBytes);
      sqlite.exec("DELETE FROM resources");
      const empty = await app.request("/api/v1/instance/storage-usage", {}, env);
      const emptyResult = await empty.json();
      expect(emptyResult.summary).toEqual({
        totalCount: 0, totalBytes: 0, imageCount: 0, attachmentCount: 0,
      });
      expect(emptyResult.users).toHaveLength(3);
      for (const user of emptyResult.users) expect(user.summary).toEqual(emptyResult.summary);
    } finally {
      sqlite.close();
    }
  });
});

const instances = [];
afterEach(() => {
  for (const sqlite of instances.splice(0)) sqlite.close();
});

// A real instance: every migration, the production auth and user routes, and
// sessions that come from a genuine password login.
const createInstance = async () => {
  const sqlite = new Database(":memory:");
  instances.push(sqlite);
  for (const path of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(path, "utf8"));
  sqlite.query("INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)")
    .run("usr_owner", "owner", await hashPassword("owner-password"), "Owner");
  sqlite.query("INSERT INTO api_tokens (id, name, token_hash, scopes_json, workspace_id) VALUES (?, ?, ?, ?, ?)")
    .run("tok_agent", "Agent", await sha256("agent-token"), JSON.stringify(["read:memos", "write:memos"]), "ws_default");

  const app = new Hono();
  registerAuthRoutes(app, {
    authenticateRequest,
    authenticateSession,
    createSession,
    ensureUserWorkspace,
    getBearerToken,
    getInstanceAuthMode,
    getLoginAttemptKeys,
    isDemoEnvironment: () => false,
    isDemoMode: () => false,
    revokeSession,
    setSessionCookie,
    tooManyLoginAttempts,
    verifyLogin,
  });
  registerUserRoutes(app, { authenticateRequest, getInstanceUser });
  const environment = { storage: createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-user-routes-unused") };

  const request = (path, { token, method = "GET", body } = {}) => app.request(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, environment);
  const login = async (username, password) => {
    const response = await request("/api/v1/auth/login", { method: "POST", body: { username, password } });
    return { status: response.status, body: await response.json() };
  };
  const sessionsOf = (userId) => sqlite.query(
    "SELECT id, revoked_at FROM sessions WHERE user_id = ? ORDER BY created_at",
  ).all(userId);

  const owner = await login("owner", "owner-password");
  expect(owner.status).toBe(200);
  expect(owner.body.user.role).toBe("owner");
  return { sqlite, request, login, sessionsOf, ownerToken: owner.body.sessionToken };
};

const createMember = async (instance, input = {}) => {
  const response = await instance.request("/api/v1/users", {
    token: instance.ownerToken,
    method: "POST",
    body: { username: "writer", password: "writer-password", displayName: "Writer", ...input },
  });
  expect(response.status).toBe(201);
  return (await response.json()).user;
};

describe("instance user management with a real database", () => {
  test("lets the owner create a member with a provisioned personal workspace", async () => {
    const instance = await createInstance();
    const response = await instance.request("/api/v1/users", {
      token: instance.ownerToken,
      method: "POST",
      body: { username: "  writer  ", password: "writer-password", displayName: "Writer" },
    });

    expect(response.status).toBe(201);
    const { user } = await response.json();
    expect(user).toEqual({
      id: expect.stringMatching(/^usr_/),
      username: "writer",
      displayName: "Writer",
      role: "member",
      isDisabled: false,
      lastLoginAt: null,
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(user)).not.toContain("password");

    const stored = instance.sqlite.query("SELECT password_hash FROM users WHERE id = ?").get(user.id);
    expect(stored.password_hash).not.toBe("writer-password");
    expect(await verifyPassword("writer-password", stored.password_hash)).toBe(true);

    const membership = instance.sqlite.query(
      `SELECT wm.workspace_id, wm.role, w.name, w.is_personal
       FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ?`,
    ).all(user.id);
    expect(membership).toEqual([{
      workspace_id: expect.stringMatching(/^ws_/),
      role: "member",
      name: "Writer's workspace",
      is_personal: 1,
    }]);
    const workspaceId = membership[0].workspace_id;
    expect(workspaceId).not.toBe("ws_default");
    expect(instance.sqlite.query("SELECT COUNT(*) AS count FROM notebooks WHERE workspace_id = ?").get(workspaceId).count)
      .toBeGreaterThan(0);
    expect(instance.sqlite.query("SELECT COUNT(*) AS count FROM workspace_seed_localizations WHERE workspace_id = ?")
      .get(workspaceId).count).toBe(1);
    expect(instance.sqlite.query("SELECT actor_id, entity_id FROM audit_events WHERE action = 'user.create'").all())
      .toEqual([{ actor_id: "usr_owner", entity_id: user.id }]);

    const memberLogin = await instance.login("writer", "writer-password");
    expect(memberLogin.status).toBe(200);
    expect(memberLogin.body.user).toEqual({ id: user.id, username: "writer", displayName: "Writer", role: "member" });

    const listing = await instance.request("/api/v1/users", { token: instance.ownerToken });
    expect(listing.status).toBe(200);
    const { users } = await listing.json();
    expect(users.map((entry) => [entry.username, entry.role])).toEqual([["owner", "owner"], ["writer", "member"]]);
    expect(users[1].lastLoginAt).toEqual(expect.any(String));
    expect(JSON.stringify(users)).not.toContain("password");
  });

  test("defaults the display name to the username", async () => {
    const instance = await createInstance();
    const user = await createMember(instance, { username: "reader", displayName: undefined });
    expect(user.displayName).toBe("reader");
    expect(instance.sqlite.query(
      "SELECT w.name FROM workspaces w INNER JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = ?",
    ).get(user.id).name).toBe("reader's workspace");
  });

  test("rejects duplicate usernames exactly as stored, which is case-sensitive", async () => {
    const instance = await createInstance();
    await createMember(instance);

    for (const username of ["writer", " writer ", "owner"]) {
      const duplicate = await instance.request("/api/v1/users", {
        token: instance.ownerToken,
        method: "POST",
        body: { username, password: "another-password" },
      });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({ error: { code: "username_exists" } });
    }

    // users.username is a plain UNIQUE TEXT column and the lookup is an exact
    // match, so a case variant becomes a separate account.
    const caseVariant = await instance.request("/api/v1/users", {
      token: instance.ownerToken,
      method: "POST",
      body: { username: "Writer", password: "another-password" },
    });
    expect(caseVariant.status).toBe(201);
    expect(instance.sqlite.query("SELECT username FROM users ORDER BY username").all().map((row) => row.username))
      .toEqual(["Writer", "owner", "writer"]);
  });

  test("validates usernames and passwords before writing anything", async () => {
    const instance = await createInstance();
    for (const body of [
      { username: "   ", password: "long-enough" },
      { username: "x".repeat(81), password: "long-enough" },
      { username: "short-password", password: "1234567" },
      { username: "huge-password", password: "x".repeat(513) },
      { username: "long-name", password: "long-enough", displayName: "x".repeat(81) },
      { password: "long-enough" },
    ]) {
      const response = await instance.request("/api/v1/users", { token: instance.ownerToken, method: "POST", body });
      expect(response.status).toBe(400);
    }
    expect(instance.sqlite.query("SELECT COUNT(*) AS count FROM users").get().count).toBe(1);
    expect(instance.sqlite.query("SELECT COUNT(*) AS count FROM workspaces").get().count).toBe(1);
  });

  test("allows only the owner's interactive session to list, create and update users", async () => {
    const instance = await createInstance();
    const member = await createMember(instance);
    const memberToken = (await instance.login("writer", "writer-password")).body.sessionToken;

    const attempts = [
      ["/api/v1/users", { method: "GET" }],
      ["/api/v1/users", { method: "POST", body: { username: "intruder", password: "intruder-password" } }],
      [`/api/v1/users/${member.id}`, { method: "PATCH", body: { isDisabled: true } }],
      ["/api/v1/users/usr_owner", { method: "PATCH", body: { password: "taken-over-password" } }],
      ["/api/v1/instance/storage-usage", { method: "GET" }],
    ];
    for (const [path, options] of attempts) {
      expect((await instance.request(path, { ...options })).status).toBe(401);
      expect((await instance.request(path, { ...options, token: "not-a-session" })).status).toBe(401);
      expect((await instance.request(path, { ...options, token: memberToken })).status).toBe(403);
      expect((await instance.request(path, { ...options, token: "agent-token" })).status).toBe(403);
    }

    expect(instance.sqlite.query("SELECT username, is_disabled FROM users ORDER BY username").all()).toEqual([
      { username: "owner", is_disabled: 0 },
      { username: "writer", is_disabled: 0 },
    ]);
    expect((await instance.login("owner", "owner-password")).status).toBe(200);
  });

  test("does not let the owner disable the instance owner", async () => {
    const instance = await createInstance();
    const response = await instance.request("/api/v1/users/usr_owner", {
      token: instance.ownerToken,
      method: "PATCH",
      body: { isDisabled: true },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "bad_request" } });
    expect(instance.sqlite.query("SELECT is_disabled FROM users WHERE id = 'usr_owner'").get().is_disabled).toBe(0);
    expect(instance.sessionsOf("usr_owner").map((session) => session.revoked_at)).toEqual([null]);
    expect((await instance.request("/api/v1/users", { token: instance.ownerToken })).status).toBe(200);
  });

  test("rejects unknown users and invalid updates", async () => {
    const instance = await createInstance();
    const missing = await instance.request("/api/v1/users/usr_missing", {
      token: instance.ownerToken,
      method: "PATCH",
      body: { displayName: "Ghost" },
    });
    expect(missing.status).toBe(404);

    const member = await createMember(instance);
    for (const body of [{}, { password: "short" }, { isDisabled: "yes" }]) {
      const response = await instance.request(`/api/v1/users/${member.id}`, {
        token: instance.ownerToken,
        method: "PATCH",
        body,
      });
      expect(response.status).toBe(400);
    }
  });

  test("renames a member without ending their sessions", async () => {
    const instance = await createInstance();
    const member = await createMember(instance);
    const memberToken = (await instance.login("writer", "writer-password")).body.sessionToken;

    const response = await instance.request(`/api/v1/users/${member.id}`, {
      token: instance.ownerToken,
      method: "PATCH",
      body: { displayName: "Senior Writer" },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({ id: member.id, displayName: "Senior Writer", isDisabled: false });
    expect(instance.sessionsOf(member.id).map((session) => session.revoked_at)).toEqual([null]);
    expect((await instance.request("/api/v1/auth/sessions", { token: memberToken })).status).toBe(200);
  });

  test("resetting a member's password revokes every session of that member only", async () => {
    const instance = await createInstance();
    const member = await createMember(instance);
    const memberToken = (await instance.login("writer", "writer-password")).body.sessionToken;

    const response = await instance.request(`/api/v1/users/${member.id}`, {
      token: instance.ownerToken,
      method: "PATCH",
      body: { password: "replacement-password" },
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("password");
    expect(instance.sessionsOf(member.id).every((session) => session.revoked_at !== null)).toBe(true);
    expect(instance.sessionsOf("usr_owner").map((session) => session.revoked_at)).toEqual([null]);
    expect((await instance.request("/api/v1/auth/sessions", { token: memberToken })).status).toBe(401);
    expect((await instance.login("writer", "writer-password")).status).toBe(401);
    expect((await instance.login("writer", "replacement-password")).status).toBe(200);
    expect(JSON.parse(instance.sqlite.query(
      "SELECT metadata_json FROM audit_events WHERE action = 'user.update'",
    ).get().metadata_json)).toEqual({ passwordReset: true });
  });

  test("resetting the owner's own password signs out the current owner session too", async () => {
    const instance = await createInstance();
    const response = await instance.request("/api/v1/users/usr_owner", {
      token: instance.ownerToken,
      method: "PATCH",
      body: { password: "new-owner-password" },
    });

    expect(response.status).toBe(200);
    expect(instance.sessionsOf("usr_owner").every((session) => session.revoked_at !== null)).toBe(true);
    expect((await instance.request("/api/v1/users", { token: instance.ownerToken })).status).toBe(401);
    expect((await instance.login("owner", "new-owner-password")).body.user.role).toBe("owner");
  });

  test("disabling a member revokes their sessions and blocks login until re-enabled", async () => {
    const instance = await createInstance();
    const member = await createMember(instance);
    const memberToken = (await instance.login("writer", "writer-password")).body.sessionToken;

    const disabled = await instance.request(`/api/v1/users/${member.id}`, {
      token: instance.ownerToken,
      method: "PATCH",
      body: { isDisabled: true },
    });
    expect(disabled.status).toBe(200);
    expect((await disabled.json()).user.isDisabled).toBe(true);
    expect(instance.sessionsOf(member.id).every((session) => session.revoked_at !== null)).toBe(true);
    expect((await instance.request("/api/v1/auth/sessions", { token: memberToken })).status).toBe(401);
    expect((await instance.login("writer", "writer-password")).status).toBe(401);

    const listed = await (await instance.request("/api/v1/users", { token: instance.ownerToken })).json();
    expect(listed.users.find((entry) => entry.id === member.id).isDisabled).toBe(true);

    const enabled = await instance.request(`/api/v1/users/${member.id}`, {
      token: instance.ownerToken,
      method: "PATCH",
      body: { isDisabled: false },
    });
    expect(enabled.status).toBe(200);
    expect((await enabled.json()).user.isDisabled).toBe(false);
    // Re-enabling the account does not bring the revoked session back.
    expect((await instance.request("/api/v1/auth/sessions", { token: memberToken })).status).toBe(401);
    expect((await instance.login("writer", "writer-password")).status).toBe(200);
  });

  test("reports storage usage per member workspace from migrated tables", async () => {
    const instance = await createInstance();
    const member = await createMember(instance);
    const memberWorkspace = instance.sqlite.query("SELECT workspace_id FROM workspace_members WHERE user_id = ?")
      .get(member.id).workspace_id;
    const notebookIn = (workspaceId) => instance.sqlite.query(
      "SELECT id FROM notebooks WHERE workspace_id = ? LIMIT 1",
    ).get(workspaceId).id;
    const insertMemo = instance.sqlite.query("INSERT INTO memos (id, notebook_id, workspace_id) VALUES (?, ?, ?)");
    insertMemo.run("memo_owner", notebookIn("ws_default"), "ws_default");
    insertMemo.run("memo_member", notebookIn(memberWorkspace), memberWorkspace);
    const insertResource = instance.sqlite.query(
      "INSERT INTO resources (id, memo_id, object_key, kind, byte_size, is_deleted) VALUES (?, ?, ?, ?, ?, ?)",
    );
    insertResource.run("res_owner_image", "memo_owner", "owner/image", "image", 1000, 0);
    insertResource.run("res_member_file", "memo_member", "member/file", "attachment", 300, 0);
    insertResource.run("res_member_image", "memo_member", "member/image", "image", 20, 0);
    insertResource.run("res_member_deleted", "memo_member", "member/deleted", "attachment", 5000, 1);

    const response = await instance.request("/api/v1/instance/storage-usage", { token: instance.ownerToken });

    expect(response.status).toBe(200);
    const usage = await response.json();
    // The owner's first authenticated request also writes the installation example files.
    const seeded = instance.sqlite.query(
      `SELECT COUNT(*) AS totalCount,
              COALESCE(SUM(byte_size), 0) AS totalBytes,
              COALESCE(SUM(CASE WHEN kind = 'image' THEN 1 ELSE 0 END), 0) AS imageCount,
              COALESCE(SUM(CASE WHEN kind = 'attachment' THEN 1 ELSE 0 END), 0) AS attachmentCount
       FROM resources
       WHERE is_deleted = 0 AND object_key LIKE 'examples/%'`,
    ).get();
    expect(usage.summary).toEqual({
      totalCount: 3 + seeded.totalCount,
      totalBytes: 1320 + seeded.totalBytes,
      imageCount: 2 + seeded.imageCount,
      attachmentCount: 1 + seeded.attachmentCount,
    });
    const byUser = Object.fromEntries(usage.users.map((entry) => [entry.userId, entry.summary]));
    expect(byUser).toEqual({
      [member.id]: { totalCount: 2, totalBytes: 320, imageCount: 1, attachmentCount: 1 },
      usr_owner: {
        totalCount: 1 + seeded.totalCount,
        totalBytes: 1000 + seeded.totalBytes,
        imageCount: 1 + seeded.imageCount,
        attachmentCount: seeded.attachmentCount,
      },
    });
  });
});
