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
  getLoginAttemptKeys,
  revokeSession,
  setSessionCookie,
  tooManyLoginAttempts,
  verifyLogin,
} from "./auth-service.ts";
import { sha256 } from "./hash-utils.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { ensureUserWorkspace } from "./workspace-provisioning.ts";

const interactiveAuth = {
  kind: "user",
  actorType: "user",
  actorId: "usr_owner",
  username: "owner",
  displayName: "Owner",
  scopes: [],
  workspaceId: "ws_owner",
  role: "owner",
  sessionId: "session_current",
};

const environment = {
  storage: {
    db: {
      prepare: () => {
        throw new Error("Database access was not expected");
      },
      batch: async () => [],
    },
    resources: {},
  },
};

const createApp = (overrides = {}) => {
  const app = new Hono();
  registerAuthRoutes(app, {
    authenticateRequest: async () => null,
    authenticateSession: async () => null,
    createSession: async () => ({ id: "session", token: "token", maxAge: 60 }),
    ensureUserWorkspace: async () => ({ workspaceId: "workspace", role: "owner" }),
    getBearerToken: () => null,
    getInstanceAuthMode: async () => "required",
    getLoginAttemptKeys: async () => [],
    isDemoEnvironment: () => false,
    isDemoMode: () => false,
    revokeSession: async () => undefined,
    setSessionCookie: () => undefined,
    tooManyLoginAttempts: () => new Response(null, { status: 429 }),
    verifyLogin: async () => null,
    ...overrides,
  });
  return app;
};

describe("auth route contracts", () => {
  test("reports the local owner when authentication is disabled", async () => {
    const app = createApp({
      getInstanceAuthMode: async () => "disabled",
      isDemoEnvironment: () => true,
    });
    const response = await app.request("/api/v1/auth/session", {}, environment);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authRequired: false,
      authenticated: true,
      demoMode: true,
      user: {
        id: "local",
        username: "owner",
        displayName: "Owner",
        role: "owner",
      },
    });
  });

  test("reports an anonymous required-auth session without touching storage", async () => {
    const app = createApp();
    const response = await app.request("/api/v1/auth/session", {}, environment);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authRequired: true,
      authenticated: false,
      user: null,
    });
  });

  test("does not allow the current session to revoke itself", async () => {
    const app = createApp({ authenticateRequest: async () => interactiveAuth });
    const response = await app.request(
      "/api/v1/auth/sessions/session_current",
      { method: "DELETE" },
      environment,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "current_session_cannot_be_revoked" },
    });
  });

  test("accepts a bearer backed interactive session for password changes", async () => {
    const app = createApp({
      authenticateRequest: async (context) =>
        context.req.header("Authorization") === "Bearer desktop-session" ? interactiveAuth : null,
      isDemoMode: () => true,
    });
    const response = await app.request(
      "/api/v1/auth/change-password",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer desktop-session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: "old-password",
          newPassword: "new-password",
          confirmPassword: "new-password",
        }),
      },
      environment,
    );

    expect(response.status).toBe(403);
  });

  test("does not allow an API token to change a password", async () => {
    const app = createApp({
      authenticateRequest: async () => ({ ...interactiveAuth, kind: "agent" }),
    });
    const response = await app.request(
      "/api/v1/auth/change-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "old-password",
          newPassword: "new-password",
          confirmPassword: "new-password",
        }),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  test("changes a password with an existing desktop bearer session and revokes other sessions", async () => {
    const sqlite = new Database(":memory:");
    try {
      for (const path of globSync("migrations/*.sql").sort()) {
        sqlite.exec(readFileSync(path, "utf8"));
      }
      const oldPasswordHash = await hashPassword("old-password");
      sqlite.query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .run("usr_owner", "owner", oldPasswordHash);
      sqlite.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)")
        .run("ws_default", "usr_owner", "owner");
      const expiry = new Date(Date.now() + 86_400_000).toISOString();
      sqlite.query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .run("session_current", "usr_owner", await sha256("existing-desktop-token"), expiry);
      sqlite.query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .run("session_other", "usr_owner", await sha256("other-device-token"), expiry);

      const app = createApp({ authenticateRequest });
      const existingSessionEnvironment = {
        storage: createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-auth-route-test-resources"),
      };
      const response = await app.request(
        "/api/v1/auth/change-password",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer existing-desktop-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentPassword: "old-password",
            newPassword: "new-password",
            confirmPassword: "new-password",
          }),
        },
        existingSessionEnvironment,
      );

      expect(response.status).toBe(200);
      const passwordHash = sqlite.query("SELECT password_hash FROM users WHERE id = ?")
        .get("usr_owner").password_hash;
      expect(await verifyPassword("new-password", passwordHash)).toBe(true);
      expect(await verifyPassword("old-password", passwordHash)).toBe(false);
      expect(sqlite.query("SELECT revoked_at FROM sessions WHERE id = ?").get("session_current").revoked_at).toBeNull();
      expect(sqlite.query("SELECT revoked_at FROM sessions WHERE id = ?").get("session_other").revoked_at).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });
});

describe("first sign-in seed localization", () => {
  const signIn = async ({ demo = false, body = {}, headers = {} } = {}) => {
    const sqlite = new Database(":memory:");
    for (const file of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(file, "utf8"));
    sqlite.exec("INSERT INTO users (id, username, password_hash, display_name) VALUES ('usr_owner', 'admin', 'unused', 'admin')");
    const app = createApp({
      ensureUserWorkspace: (...args) => ensureUserWorkspace(...args),
      isDemoEnvironment: () => demo,
      verifyLogin: async () => ({ id: "usr_owner", username: "admin", display_name: "admin", is_disabled: 0 }),
    });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ username: "admin", password: "secret", ...body }),
    }, { storage: createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-auth-routes-unused") });
    const inbox = sqlite.query("SELECT name FROM notebooks WHERE workspace_id = 'ws_default' AND slug = 'inbox'").get();
    const pending = sqlite.query("SELECT COUNT(*) AS count FROM workspace_seed_localizations").get();
    sqlite.close();
    return { status: response.status, inbox: inbox.name, pending: pending.count };
  };

  test("prefers the client's resolved UI locale over Accept-Language", async () => {
    expect(await signIn({ body: { locale: "pl" }, headers: { "Accept-Language": "ja-JP,ja;q=0.9" } }))
      .toEqual({ status: 200, inbox: "Skrzynka", pending: 0 });
  });

  test("falls back to Accept-Language for clients that do not send a locale", async () => {
    expect(await signIn({ headers: { "Accept-Language": "ja-JP,ja;q=0.9" } }))
      .toEqual({ status: 200, inbox: "受信トレイ", pending: 0 });
  });

  test("keeps the demo's own seed in the visitor's language", async () => {
    expect(await signIn({ demo: true, body: { locale: "en-US" } }))
      .toEqual({ status: 200, inbox: "等待分类", pending: 0 });
  });
});

describe("login session management with a real database", () => {
  const instances = [];
  afterEach(() => {
    for (const sqlite of instances.splice(0)) sqlite.close();
  });

  const DEVICE_A = "device-a-0000000001";
  const DEVICE_B = "device-b-0000000002";
  const DEVICE_C = "device-c-0000000003";
  const DAY_MS = 86_400_000;

  const createInstance = async () => {
    const sqlite = new Database(":memory:");
    instances.push(sqlite);
    for (const path of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(path, "utf8"));
    const insertUser = sqlite.query("INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)");
    insertUser.run("usr_owner", "owner", await hashPassword("owner-password"), "Owner");
    insertUser.run("usr_member", "writer", await hashPassword("writer-password"), "Writer");
    sqlite.query("INSERT INTO api_tokens (id, name, token_hash, scopes_json, workspace_id) VALUES (?, ?, ?, ?, ?)")
      .run("tok_agent", "Agent", await sha256("agent-token"), JSON.stringify(["read:memos"]), "ws_default");

    const app = createApp({
      authenticateRequest,
      authenticateSession,
      createSession,
      ensureUserWorkspace,
      getBearerToken,
      getInstanceAuthMode,
      getLoginAttemptKeys,
      revokeSession,
      setSessionCookie,
      tooManyLoginAttempts,
      verifyLogin,
    });
    const realEnvironment = { storage: createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-auth-sessions-unused") };

    const request = (path, { token, cookie, method = "GET", body, headers = {} } = {}) => app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: `edgeever_session=${cookie}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, realEnvironment);
    const login = async (username, password, deviceId, headers = {}) => {
      const response = await request("/api/v1/auth/login", {
        method: "POST",
        body: { username, password, deviceId },
        headers,
      });
      expect(response.status).toBe(200);
      const token = (await response.json()).sessionToken;
      const session = sqlite.query("SELECT id FROM sessions WHERE token_hash = ?").get(await sha256(token));
      return { token, id: session.id, response };
    };
    const insertSession = (id, userId, deviceId, { expiresAt, revokedAt = null, createdAt } = {}) => {
      sqlite.query(
        `INSERT INTO sessions (id, user_id, token_hash, device_id, expires_at, revoked_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        `hash-${id}`,
        deviceId,
        expiresAt ?? new Date(Date.now() + DAY_MS).toISOString(),
        revokedAt,
        createdAt ?? "2026-01-01T00:00:00.000Z",
        createdAt ?? "2026-01-01T00:00:00.000Z",
      );
    };
    const session = (id) => sqlite.query("SELECT device_label, revoked_at FROM sessions WHERE id = ?").get(id);
    const listSessions = async (token) => {
      const response = await request("/api/v1/auth/sessions", { token });
      expect(response.status).toBe(200);
      return (await response.json()).sessions;
    };

    return { sqlite, request, login, insertSession, session, listSessions };
  };

  test("lists only the caller's active sessions grouped by device with the current one flagged", async () => {
    const instance = await createInstance();
    const a = await instance.login("owner", "owner-password", DEVICE_A, { "User-Agent": "Desktop A" });
    const b = await instance.login("owner", "owner-password", DEVICE_B, { "User-Agent": "Phone B" });
    const member = await instance.login("writer", "writer-password", DEVICE_C);
    instance.insertSession("sess_a_older", "usr_owner", DEVICE_A);
    instance.insertSession("sess_expired", "usr_owner", "device-expired-000001", {
      expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
    });
    instance.insertSession("sess_revoked", "usr_owner", "device-revoked-000001", {
      revokedAt: "2026-01-02T00:00:00.000Z",
    });

    const fromA = await instance.listSessions(a.token);
    expect(fromA.map((entry) => entry.id).sort()).toEqual([a.id, b.id].sort());
    expect(fromA.find((entry) => entry.id === a.id)).toMatchObject({
      isCurrent: true,
      userAgent: "Desktop A",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(fromA.find((entry) => entry.id === b.id)).toMatchObject({ isCurrent: false, userAgent: "Phone B" });
    expect(JSON.stringify(fromA)).not.toContain("token");

    const fromB = await instance.listSessions(b.token);
    expect(fromB.filter((entry) => entry.isCurrent).map((entry) => entry.id)).toEqual([b.id]);

    const fromMember = await instance.listSessions(member.token);
    expect(fromMember.map((entry) => [entry.id, entry.isCurrent])).toEqual([[member.id, true]]);
  });

  test("records a new login and replaces the previous session on the same device", async () => {
    const instance = await createInstance();
    const first = await instance.login("owner", "owner-password", DEVICE_A);
    const second = await instance.login("owner", "owner-password", DEVICE_A, {
      "CF-Connecting-IP": "203.0.113.7",
      "CF-IPCountry": "PL",
      "User-Agent": "Desktop A",
    });

    expect(instance.session(first.id).revoked_at).not.toBeNull();
    expect((await instance.request("/api/v1/auth/sessions", { token: first.token })).status).toBe(401);

    const row = instance.sqlite.query("SELECT * FROM sessions WHERE id = ?").get(second.id);
    expect(row).toMatchObject({
      user_id: "usr_owner",
      device_id: DEVICE_A,
      user_agent: "Desktop A",
      ip_address: "203.0.113.7",
      ip_hash: await sha256("203.0.113.7"),
      ip_country: "PL",
      revoked_at: null,
    });
    expect(row.token_hash).toBe(await sha256(second.token));
    expect(Date.parse(row.expires_at) - Date.now()).toBeGreaterThan(399 * DAY_MS);
    expect(Date.parse(row.expires_at) - Date.now()).toBeLessThanOrEqual(400 * DAY_MS);

    const cookie = second.response.headers.get("set-cookie");
    expect(cookie).toContain(`edgeever_session=${second.token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${400 * 24 * 60 * 60}`);
    expect(cookie).not.toContain("Secure");

    const sessions = await instance.listSessions(second.token);
    expect(sessions.map((entry) => [entry.id, entry.isCurrent])).toEqual([[second.id, true]]);
  });

  test("keeps the same device across IP changes, continued use, and browser upgrades", async () => {
    const instance = await createInstance();
    const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
    const first = await instance.login("owner", "owner-password", DEVICE_A, {
      "User-Agent": edge,
      "CF-Connecting-IP": "203.0.113.7",
      "CF-IPCountry": "US",
    });

    // Changing networks while authenticated must neither reject the cookie
    // nor insert another session, even when last-seen tracking runs.
    instance.sqlite.query("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", first.id);
    const context = new Hono();
    context.get("/touch", async (c) => c.json(await authenticateSession(c, true)));
    const touched = await context.request("/touch", {
      headers: {
        Cookie: `edgeever_session=${first.token}`,
        "User-Agent": edge,
        "CF-Connecting-IP": "2001:db8::7",
        "CF-IPCountry": "CN",
      },
    }, { storage: createSelfHostedStorageAdapter(instance.sqlite, "/tmp/edgeever-auth-sessions-unused") });
    expect(touched.status).toBe(200);
    expect(await touched.json()).toMatchObject({ sessionId: first.id });
    expect(instance.sqlite.query("SELECT COUNT(*) AS count FROM sessions").get().count).toBe(1);

    for (const userAgent of [edge, edge.replaceAll("140.0.0.0", "141.0.0.0")]) {
      const next = await instance.login("owner", "owner-password", DEVICE_A, {
        "User-Agent": userAgent,
        "CF-Connecting-IP": "2001:db8::7",
        "CF-IPCountry": "CN",
      });
      const sessions = await instance.listSessions(next.token);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ id: next.id, isCurrent: true, ipAddress: "2001:db8::7" });
    }
    expect(instance.session(first.id).revoked_at).not.toBeNull();
  });

  test("lists separate devices when the client device id changes despite identical IP and browser", async () => {
    const instance = await createInstance();
    const headers = { "User-Agent": "Windows Edge", "CF-Connecting-IP": "203.0.113.7" };
    const first = await instance.login("owner", "owner-password", DEVICE_A, headers);
    const second = await instance.login("owner", "owner-password", DEVICE_B, headers);
    expect(await instance.listSessions(second.token)).toHaveLength(2);
    expect(instance.session(first.id).revoked_at).toBeNull();
  });

  test("legacy clients ignore IP changes but split devices when the user-agent changes", async () => {
    const instance = await createInstance();
    const first = await instance.login("owner", "owner-password", undefined, {
      "User-Agent": "Windows Edge/140", "CF-Connecting-IP": "203.0.113.7",
    });
    const moved = await instance.login("owner", "owner-password", undefined, {
      "User-Agent": "Windows Edge/140", "CF-Connecting-IP": "2001:db8::7",
    });
    expect(await instance.listSessions(moved.token)).toHaveLength(1);
    expect(instance.session(first.id).revoked_at).not.toBeNull();

    const upgraded = await instance.login("owner", "owner-password", undefined, {
      "User-Agent": "Windows Edge/141", "CF-Connecting-IP": "2001:db8::7",
    });
    expect(await instance.listSessions(upgraded.token)).toHaveLength(2);
    expect(instance.session(moved.id).revoked_at).toBeNull();
  });

  test("authenticates session endpoints with the session cookie and revokes it on logout", async () => {
    const instance = await createInstance();
    const login = await instance.login("owner", "owner-password", DEVICE_A);

    const listed = await instance.request("/api/v1/auth/sessions", { cookie: login.token });
    expect(listed.status).toBe(200);
    expect((await listed.json()).sessions.map((entry) => entry.isCurrent)).toEqual([true]);

    const logout = await instance.request("/api/v1/auth/logout", { method: "POST", cookie: login.token });
    expect(logout.status).toBe(200);
    expect(instance.session(login.id).revoked_at).not.toBeNull();
    expect((await instance.request("/api/v1/auth/sessions", { cookie: login.token })).status).toBe(401);
  });

  test("renames the caller's own sessions per device and never another user's", async () => {
    const instance = await createInstance();
    const a = await instance.login("owner", "owner-password", DEVICE_A);
    const b = await instance.login("owner", "owner-password", DEVICE_B);
    const member = await instance.login("writer", "writer-password", DEVICE_C);
    instance.insertSession("sess_b_older", "usr_owner", DEVICE_B);
    instance.insertSession("sess_legacy", "usr_owner", null);
    const rename = (sessionId, body, token = a.token) => instance.request(`/api/v1/auth/sessions/${sessionId}`, {
      token,
      method: "PATCH",
      body,
    });

    const renamed = await rename(b.id, { label: "  Work phone  " });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toEqual({ ok: true });
    expect(instance.session(b.id).device_label).toBe("Work phone");
    expect(instance.session("sess_b_older").device_label).toBe("Work phone");
    expect((await instance.listSessions(a.token)).find((entry) => entry.id === b.id).label).toBe("Work phone");
    expect(instance.sqlite.query(
      "SELECT actor_id, entity_id, metadata_json FROM audit_events WHERE action = 'auth.session_label_update'",
    ).get()).toEqual({ actor_id: "usr_owner", entity_id: b.id, metadata_json: JSON.stringify({ label: "Work phone" }) });

    expect((await rename("sess_legacy", { label: "Old laptop" })).status).toBe(200);
    expect(instance.session("sess_legacy").device_label).toBe("Old laptop");
    expect((await rename(a.id, { label: "This desktop" })).status).toBe(200);
    expect(instance.session(a.id).device_label).toBe("This desktop");

    expect((await rename(b.id, { label: "   " })).status).toBe(200);
    expect(instance.session(b.id).device_label).toBeNull();
    expect((await rename("sess_legacy", { label: null })).status).toBe(200);
    expect(instance.session("sess_legacy").device_label).toBeNull();

    for (const body of [{}, { label: "x".repeat(81) }, { label: 7 }]) {
      expect((await rename(b.id, body)).status).toBe(400);
    }

    const foreign = await rename(member.id, { label: "Hijacked" });
    expect(foreign.status).toBe(404);
    expect(instance.session(member.id).device_label).toBeNull();
    expect((await rename(a.id, { label: "Hijacked" }, member.token)).status).toBe(404);
    expect(instance.session(a.id).device_label).toBe("This desktop");
    expect((await rename("sess_missing", { label: "Ghost" })).status).toBe(404);
  });

  test("revokes a single other session or device but not the current device or another user's session", async () => {
    const instance = await createInstance();
    const a = await instance.login("owner", "owner-password", DEVICE_A);
    const b = await instance.login("owner", "owner-password", DEVICE_B);
    const c = await instance.login("owner", "owner-password", DEVICE_C);
    const member = await instance.login("writer", "writer-password", DEVICE_A);
    instance.insertSession("sess_c_older", "usr_owner", DEVICE_C);
    instance.insertSession("sess_a_older", "usr_owner", DEVICE_A);
    const revoke = (sessionId, token = a.token) => instance.request(`/api/v1/auth/sessions/${sessionId}`, {
      token,
      method: "DELETE",
    });

    const foreign = await revoke(member.id);
    expect(foreign.status).toBe(404);
    expect(instance.session(member.id).revoked_at).toBeNull();
    expect((await revoke(a.id, member.token)).status).toBe(404);
    expect(instance.session(a.id).revoked_at).toBeNull();

    const sameDevice = await revoke("sess_a_older");
    expect(sameDevice.status).toBe(400);
    expect(await sameDevice.json()).toMatchObject({ error: { code: "current_session_cannot_be_revoked" } });
    expect(instance.session("sess_a_older").revoked_at).toBeNull();
    expect((await revoke(a.id)).status).toBe(400);

    const single = await revoke(b.id);
    expect(single.status).toBe(200);
    expect(instance.session(b.id).revoked_at).not.toBeNull();
    expect((await instance.request("/api/v1/auth/sessions", { token: b.token })).status).toBe(401);
    expect((await revoke(b.id)).status).toBe(404);

    expect((await revoke(c.id)).status).toBe(200);
    expect(instance.session(c.id).revoked_at).not.toBeNull();
    expect(instance.session("sess_c_older").revoked_at).not.toBeNull();

    expect(instance.session(a.id).revoked_at).toBeNull();
    expect(instance.session(member.id).revoked_at).toBeNull();
    expect((await instance.listSessions(a.token)).map((entry) => [entry.id, entry.isCurrent])).toEqual([[a.id, true]]);
    expect(instance.sqlite.query(
      "SELECT entity_id FROM audit_events WHERE action = 'auth.session_revoke' ORDER BY rowid",
    ).all().map((row) => row.entity_id)).toEqual([b.id, c.id]);
  });

  test("signs out every other session of the caller only", async () => {
    const instance = await createInstance();
    const a = await instance.login("owner", "owner-password", DEVICE_A);
    const b = await instance.login("owner", "owner-password", DEVICE_B);
    const c = await instance.login("owner", "owner-password", DEVICE_C);
    const member = await instance.login("writer", "writer-password", DEVICE_B);
    instance.insertSession("sess_expired", "usr_owner", "device-expired-000001", {
      expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
    });

    const response = await instance.request("/api/v1/auth/sessions", { token: a.token, method: "DELETE" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(instance.session(a.id).revoked_at).toBeNull();
    expect(instance.session(b.id).revoked_at).not.toBeNull();
    expect(instance.session(c.id).revoked_at).not.toBeNull();
    expect(instance.session("sess_expired").revoked_at).toBeNull();
    expect(instance.session(member.id).revoked_at).toBeNull();
    expect((await instance.request("/api/v1/auth/sessions", { token: b.token })).status).toBe(401);
    expect((await instance.listSessions(a.token)).map((entry) => entry.id)).toEqual([a.id]);
    expect((await instance.listSessions(member.token)).map((entry) => entry.id)).toEqual([member.id]);
    expect(instance.sqlite.query(
      "SELECT actor_id, entity_id FROM audit_events WHERE action = 'auth.sessions_revoke_others'",
    ).all()).toEqual([{ actor_id: "usr_owner", entity_id: a.id }]);
  });

  test("refuses session management to API tokens and anonymous callers", async () => {
    const instance = await createInstance();
    const a = await instance.login("owner", "owner-password", DEVICE_A);
    const b = await instance.login("owner", "owner-password", DEVICE_B);

    for (const token of ["agent-token", "unknown-token", undefined]) {
      for (const [path, options] of [
        ["/api/v1/auth/sessions", { method: "GET" }],
        [`/api/v1/auth/sessions/${b.id}`, { method: "PATCH", body: { label: "Agent" } }],
        [`/api/v1/auth/sessions/${b.id}`, { method: "DELETE" }],
        ["/api/v1/auth/sessions", { method: "DELETE" }],
      ]) {
        const response = await instance.request(path, { ...options, token });
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
      }
    }

    expect(instance.session(a.id)).toEqual({ device_label: null, revoked_at: null });
    expect(instance.session(b.id)).toEqual({ device_label: null, revoked_at: null });
  });
});
