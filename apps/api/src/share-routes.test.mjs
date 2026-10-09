import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { hashPassword } from "./auth-crypto.ts";
import { registerMemoShareRoutes, registerPublicShareRoutes } from "./share-routes.ts";

class SqliteD1PreparedStatement {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SqliteD1PreparedStatement(this.db, this.sql, bindings);
  }

  async all() {
    return { results: this.db.query(this.sql).all(...this.bindings), success: true, meta: {} };
  }

  async first() {
    return this.db.query(this.sql).get(...this.bindings) ?? null;
  }

  async run() {
    this.db.query(this.sql).run(...this.bindings);
    return { success: true, meta: {} };
  }
}

class SqliteD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.db, sql);
  }

  async batch(statements) {
    return this.db.transaction(() => statements.map((statement) =>
      this.db.query(statement.sql).run(...statement.bindings)))();
  }
}

const sourceToken = "s".repeat(43);
const targetToken = "t".repeat(43);

const createDatabaseEnvironment = () => {
  const sqlite = new Database(":memory:");
  for (const migration of globSync("migrations/*.sql").sort()) {
    sqlite.exec(readFileSync(migration, "utf8"));
  }
  sqlite.query("INSERT INTO workspaces (id, name, is_personal) VALUES (?, ?, 1)")
    .run("ws_member", "Member workspace");
  sqlite.query("INSERT INTO notebooks (id, workspace_id, name) VALUES (?, ?, ?)")
    .run("nb_member", "ws_member", "Inbox");

  const contentJson = JSON.stringify({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        { type: "text", text: "Public", marks: [{ type: "link", attrs: { href: "#memo=memo_target" } }] },
        { type: "text", text: "Private", marks: [{ type: "link", attrs: { href: "#memo=memo_private" } }] },
      ],
    }],
  });
  for (const [id, title, content] of [
    ["memo_source", "Source", contentJson],
    ["memo_target", "Target", JSON.stringify({ type: "doc", content: [] })],
    ["memo_private", "Private", JSON.stringify({ type: "doc", content: [] })],
  ]) {
    sqlite.query("INSERT INTO memos (id, workspace_id, notebook_id, title) VALUES (?, ?, ?, ?)")
      .run(id, "ws_member", "nb_member", title);
    sqlite.query("INSERT INTO memo_contents (memo_id, content_json, content_markdown, content_hash) VALUES (?, ?, '', ?)")
      .run(id, content, `${id}-hash`);
  }
  sqlite.query("INSERT INTO memo_shares (id, memo_id, workspace_id, token) VALUES (?, ?, ?, ?)")
    .run("share_source", "memo_source", "ws_member", sourceToken);
  sqlite.query("INSERT INTO memo_shares (id, memo_id, workspace_id, token) VALUES (?, ?, ?, ?)")
    .run("share_target", "memo_target", "ws_member", targetToken);

  return {
    sqlite,
    environment: { storage: { db: new SqliteD1Database(sqlite), resources: {} } },
  };
};

describe("public memo shares", () => {
  test("returns share tokens only for referenced notes that are also public", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    const app = new Hono();
    registerPublicShareRoutes(app);

    const response = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      share: { memoShareTokens: { memo_target: targetToken }, bodyFont: null },
    });
    sqlite.close();
  });

  test("publishes the author's built-in note font and ignores anything else", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query("INSERT INTO users (id, username, password_hash, note_body_font) VALUES (?, ?, ?, ?)")
      .run("usr_author", "author", "hash", "wenkai");
    sqlite.query("UPDATE memo_shares SET created_by = ? WHERE id = ?")
      .run("usr_author", "share_source");
    const app = new Hono();
    registerPublicShareRoutes(app);

    const published = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);
    expect(published.status).toBe(200);
    expect((await published.json()).share.bodyFont).toBe("wenkai");

    sqlite.query("UPDATE users SET note_body_font = ? WHERE id = ?").run("Comic Sans", "usr_author");
    const ignored = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);
    expect((await ignored.json()).share.bodyFont).toBeNull();
    sqlite.close();
  });

  test("publishes account prose with the public share", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
      .run("usr_author", "author", "hash");
    sqlite.query("UPDATE memo_shares SET created_by = ? WHERE id = ?")
      .run("usr_author", "share_source");
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("auth", { kind: "user", actorType: "user", actorId: "usr_author", username: "author", displayName: null, scopes: [], workspaceId: "ws_member", role: "owner" });
      await next();
    });
    registerMemoShareRoutes(app);
    registerPublicShareRoutes(app);

    const before = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);
    expect((await before.json()).share.prose).toEqual({
      fontSize: 16,
      lineHeight: 1.65,
      palette: "native",
      customCss: "",
      customColors: null,
    });

    const saved = await app.request("/api/v1/me/note-prose", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fontSize: 18,
        lineHeight: 2,
        palette: "clay",
        customCss: "p { color: red; font-size: 40px; line-height: 3; background: url(https://evil.test/a.png); }",
      }),
    }, environment);
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.fontSize).toBe(18);
    expect(body.lineHeight).toBe(2);
    expect(body.palette).toBe("clay");
    expect(body.customCss).toContain("color: red");
    expect(body.customCss).not.toContain("font-size");
    expect(body.customCss).not.toContain("line-height");
    expect(body.customCss).not.toContain("url(");

    const published = await (await app.request(`/api/public/shares/${sourceToken}`, {}, environment)).json();
    expect(published.share.prose).toMatchObject({
      fontSize: 18,
      lineHeight: 2,
      palette: "clay",
    });
    expect(published.share.prose.customCss).not.toContain("font-size");
    sqlite.close();
  });

  test("saves a signed-in user's published note font", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
      .run("usr_author", "author", "hash");
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("auth", { kind: "user", actorType: "user", actorId: "usr_author", username: "author", displayName: null, scopes: [], workspaceId: "ws_member", role: "owner" });
      await next();
    });
    registerMemoShareRoutes(app);

    const response = await app.request("/api/v1/me/note-body-font", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyFont: "source-han-serif" }),
    }, environment);
    expect(response.status).toBe(200);
    expect(sqlite.query("SELECT note_body_font FROM users WHERE id = ?").get("usr_author").note_body_font).toBe("source-han-serif");

    const cleared = await app.request("/api/v1/me/note-body-font", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyFont: null }),
    }, environment);
    expect(cleared.status).toBe(200);
    expect(sqlite.query("SELECT note_body_font FROM users WHERE id = ?").get("usr_author").note_body_font).toBeNull();
    sqlite.close();
  });

  test("serves shared PDF byte ranges with public-share cache controls", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query(
      `INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size)
       VALUES (?, ?, ?, 'attachment', 'application/pdf', '共享报告.pdf', 10)`,
    ).run("res_shared", "memo_source", "shared-key");
    let requestedOptions;
    environment.storage.resources = {
      get: async (_key, options) => {
        requestedOptions = options;
        return {
          body: new Blob([new TextEncoder().encode("2345")]).stream(),
          size: 10,
          range: { offset: 2, length: 4 },
          writeHttpMetadata: () => {},
        };
      },
    };
    const app = new Hono();
    registerPublicShareRoutes(app);

    const response = await app.request(
      `/api/public/shares/${sourceToken}/resources/res_shared/blob`,
      { headers: { Range: "bytes=2-5" } },
      environment,
    );

    expect(requestedOptions).toEqual({ range: { offset: 2, length: 4 } });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(response.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"download.pdf\"; filename*=UTF-8''%E5%85%B1%E4%BA%AB%E6%8A%A5%E5%91%8A.pdf",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("2345");
    sqlite.close();
  });

  test("serves filename-detected shared audio inline", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query(
      `INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size)
       VALUES (?, ?, ?, 'attachment', 'application/octet-stream', 'recording.mp3', 10)`,
    ).run("res_audio", "memo_source", "audio-key");
    environment.storage.resources = {
      get: async () => ({
        body: new Blob([new Uint8Array(10)]).stream(),
        size: 10,
        writeHttpMetadata: () => {},
      }),
    };
    const app = new Hono();
    registerPublicShareRoutes(app);

    const response = await app.request(
      `/api/public/shares/${sourceToken}/resources/res_audio/blob`,
      {},
      environment,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"recording.mp3\"; filename*=UTF-8''recording.mp3",
    );
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    sqlite.close();
  });

  test("serves filename-detected shared video inline", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query(
      `INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size)
       VALUES (?, ?, ?, 'attachment', 'application/octet-stream', 'walkthrough.webm', 10)`,
    ).run("res_video", "memo_source", "video-key");
    environment.storage.resources = {
      get: async () => ({
        body: new Blob([new Uint8Array(10)]).stream(),
        size: 10,
        writeHttpMetadata: () => {},
      }),
    };
    const app = new Hono();
    registerPublicShareRoutes(app);

    const response = await app.request(
      `/api/public/shares/${sourceToken}/resources/res_video/blob`,
      {},
      environment,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/webm");
    expect(response.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"walkthrough.webm\"; filename*=UTF-8''walkthrough.webm",
    );
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    sqlite.close();
  });
});

const memberAuth = {
  kind: "user",
  actorType: "user",
  actorId: "user_member",
  username: "member",
  displayName: "Member",
  scopes: [],
  workspaceId: "ws_member",
  role: "member",
};

const createShareApp = (environment) => {
  const app = new Hono();
  app.use("/api/v1/*", async (c, next) => {
    c.set("auth", memberAuth);
    await next();
  });
  registerPublicShareRoutes(app);
  registerMemoShareRoutes(app);
  return app;
};

const readCookieValue = (response, name) => {
  const header = response.headers.get("Set-Cookie") ?? "";
  const prefix = `${name}=`;
  const part = header.split(";").find((item) => item.trim().startsWith(prefix));
  return part ? part.trim().slice(prefix.length) : "";
};

describe("memo share management", () => {
  test("lists only live shares from the signed-in workspace without exposing passwords", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query("INSERT INTO workspaces (id, name, is_personal) VALUES (?, ?, 1)").run("ws_other", "Other workspace");
    sqlite.query("INSERT INTO notebooks (id, workspace_id, name) VALUES (?, ?, ?)").run("nb_other", "ws_other", "Private");
    sqlite.query("INSERT INTO memos (id, workspace_id, notebook_id, title) VALUES (?, ?, ?, ?)").run("memo_other", "ws_other", "nb_other", "Other note");
    sqlite.query("INSERT INTO memo_shares (id, memo_id, workspace_id, token) VALUES (?, ?, ?, ?)").run("share_other", "memo_other", "ws_other", "o".repeat(43));
    sqlite.query("UPDATE memo_shares SET password_hash = ? WHERE memo_id = ?").run("private-hash", "memo_source");
    sqlite.query("UPDATE memos SET is_deleted = 1 WHERE id = ?").run("memo_target");

    const response = await createShareApp(environment).request("/api/v1/memo-shares", {}, environment);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.nextOffset).toBeNull();
    expect(body.shares).toEqual([expect.objectContaining({
      memoId: "memo_source",
      memoTitle: "Source",
      notebookId: "nb_member",
      notebookName: "Inbox",
      passwordProtected: true,
    })]);
    expect(JSON.stringify(body)).not.toContain("private-hash");
    expect(JSON.stringify(body)).not.toContain("memo_other");
    sqlite.close();
  });

  test("paginates shares and requires an interactive user session", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    const app = createShareApp(environment);
    const first = await app.request("/api/v1/memo-shares?limit=1", {}, environment);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.shares).toHaveLength(1);
    expect(firstBody.nextOffset).toBe(1);
    const second = await app.request(`/api/v1/memo-shares?limit=1&offset=${firstBody.nextOffset}`, {}, environment);
    const secondBody = await second.json();
    expect(secondBody.shares).toHaveLength(1);
    expect(secondBody.shares[0].memoId).not.toBe(firstBody.shares[0].memoId);
    expect(secondBody.nextOffset).toBeNull();

    const unauthenticated = new Hono();
    registerMemoShareRoutes(unauthenticated);
    const denied = await unauthenticated.request("/api/v1/memo-shares", {}, environment);
    expect(denied.status).toBe(403);
    sqlite.close();
  });
});

describe("password-protected memo shares", () => {
  test("keeps existing shares public until a password is enabled", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    const app = createShareApp(environment);

    const publicResponse = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.json()).toMatchObject({ share: { title: "Source" } });

    const enabled = await app.request(`/api/v1/memos/memo_source/share`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordProtected: true }),
    }, environment);
    expect(enabled.status).toBe(200);
    const enabledBody = await enabled.json();
    expect(enabledBody.share.passwordProtected).toBe(true);
    expect(enabledBody.share.password).toHaveLength(8);
    expect(enabledBody.share).not.toHaveProperty("passwordHash");

    const locked = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);
    expect(locked.status).toBe(403);
    expect(await locked.json()).toEqual({
      error: { code: "share_password_required", message: "Password required to view this shared note" },
    });
    sqlite.close();
  });

  test("unlocks with the generated password and then serves the note and attachments", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    const password = "testPass";
    sqlite.query("UPDATE memo_shares SET password_hash = ? WHERE token = ?")
      .run(await hashPassword(password), sourceToken);
    sqlite.query(
      `INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size)
       VALUES (?, ?, ?, 'attachment', 'application/pdf', 'shared.pdf', 10)`,
    ).run("res_locked", "memo_source", "locked-key");
    environment.storage.resources = {
      get: async () => ({
        body: new Blob([new Uint8Array(10)]).stream(),
        size: 10,
        writeHttpMetadata: () => {},
      }),
    };
    const app = createShareApp(environment);

    const deniedResource = await app.request(
      `/api/public/shares/${sourceToken}/resources/res_locked/blob`,
      {},
      environment,
    );
    expect(deniedResource.status).toBe(403);

    const wrong = await app.request(`/api/public/shares/${sourceToken}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    }, environment);
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).error.code).toBe("share_password_invalid");

    const unlocked = await app.request(`/api/public/shares/${sourceToken}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }, environment);
    expect(unlocked.status).toBe(200);
    const cookie = readCookieValue(unlocked, "ee_share");
    expect(cookie).toBeTruthy();

    const headers = { Cookie: `ee_share=${cookie}` };
    const share = await app.request(`/api/public/shares/${sourceToken}`, { headers }, environment);
    expect(share.status).toBe(200);
    expect(await share.json()).toMatchObject({ share: { title: "Source" } });

    const resource = await app.request(
      `/api/public/shares/${sourceToken}/resources/res_locked/blob`,
      { headers },
      environment,
    );
    expect(resource.status).toBe(200);
    sqlite.close();
  });

  test("clearing the password makes the existing link public again", async () => {
    const { sqlite, environment } = createDatabaseEnvironment();
    sqlite.query("UPDATE memo_shares SET password_hash = ? WHERE token = ?")
      .run(await hashPassword("secretPwd"), sourceToken);
    const app = createShareApp(environment);

    const cleared = await app.request(`/api/v1/memos/memo_source/share`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordProtected: false }),
    }, environment);
    expect(cleared.status).toBe(200);
    const clearedBody = await cleared.json();
    expect(clearedBody.share).toMatchObject({ passwordProtected: false });
    expect(clearedBody.share.password).toBeUndefined();

    const publicResponse = await app.request(`/api/public/shares/${sourceToken}`, {}, environment);
    expect(publicResponse.status).toBe(200);
    sqlite.close();
  });
});
