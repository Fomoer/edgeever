import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEdgeEverZip, restoreEdgeEverZip } from "@edgeever/shared/backup-archive";
import { createEdgeEverClient } from "../../../packages/client/src/index.ts";
import { fetchEdgeEverApp } from "./index.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";

const fixtures = [];
const html = "<!doctype html><p>Untrusted attachment</p>";
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
const executionContext = { waitUntil() {}, passThroughOnException() {} };

afterEach(async () => {
  for (const { database, directory, server } of fixtures.splice(0)) {
    server?.stop(true);
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "edgeever-701-test-"));
  const database = new Database(":memory:");
  const cleanup = { database, directory };
  fixtures.push(cleanup);
  database.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../../../migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  database.run("INSERT OR IGNORE INTO workspaces (id, name, is_personal) VALUES ('ws_default', 'Personal', 1)");
  const environment = {
    storage: createSelfHostedStorageAdapter(database, directory),
    EDGE_EVER_ALLOW_UNAUTHENTICATED: "true",
    EDGE_EVER_RUNTIME: "self-hosted-bun",
  };
  const request = (path, init = {}) => fetchEdgeEverApp(new Request(`http://edgeever.test${path}`, init), environment, executionContext);
  const json = async (path, body, method = "POST") => {
    const response = await request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result)}`);
    return result;
  };
  const { notebook } = await json("/api/v1/notebooks", { name: "Security regression" });
  const { memo } = await json("/api/v1/memos", { notebookId: notebook.id, title: "Restore regression", contentMarkdown: "Original note" });
  const metadata = (overrides = {}) => ({
    id: "res_security", memoId: memo.id, originalMemoId: null, kind: "image", mimeType: "image/png",
    filename: "resource.png", byteSize: png.length, sha256: null, width: 1, height: 1,
    createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z",
    archivePath: "resources/resource.png", ...overrides,
  });
  const restore = (resource, bytes = png, type = resource.mimeType ?? "application/octet-stream") => {
    const form = new FormData();
    form.set("metadata", JSON.stringify(resource));
    form.set("file", new File([bytes], resource.filename ?? "resource", { type }));
    return request(`/api/v1/restores/json/resources/${resource.id}`, { method: "PUT", body: form });
  };
  const resourceRow = () => database.query("SELECT * FROM resources WHERE id = 'res_security'").get();
  const serve = () => {
    cleanup.server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => fetchEdgeEverApp(request, environment, executionContext) });
    return cleanup.server.url.origin;
  };
  return { directory, database, environment, request, json, notebook, memo, metadata, restore, resourceRow, serve };
};

describe("restored resource security", () => {
  for (const mimeType of ["text/html", "application/xhtml+xml", "image/unknown", null]) {
    test(`legacy image restore rejects ${mimeType ?? "HTML file MIME fallback"} without replacing existing bytes`, async () => {
      const f = await fixture();
      expect((await f.restore(f.metadata())).status).toBe(200);
      const previous = f.resourceRow();
      const response = await f.restore(f.metadata({ mimeType, filename: "resource.html", byteSize: html.length }), html, "text/html");
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
      expect(f.resourceRow()).toEqual(previous);
      expect(new Uint8Array(await readFile(join(f.directory, previous.object_key)))).toEqual(png);
    });
  }

  for (const mimeType of ["text/html", "application/xhtml+xml"]) {
    test(`resumable image restore rejects ${mimeType} before creating a multipart upload`, async () => {
      const f = await fixture();
      const previousObjects = (await readdir(f.directory, { recursive: true })).sort();
      const response = await f.request("/api/v1/restores/json/resources/res_security/uploads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f.metadata({ mimeType, filename: "resource.html", byteSize: html.length })),
      });
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
      expect(f.database.query("SELECT COUNT(*) AS count FROM resource_uploads").get().count).toBe(0);
      expect(f.resourceRow()).toBeNull();
      expect((await readdir(f.directory, { recursive: true })).sort()).toEqual(previousObjects);
    });
  }

  for (const mode of ["legacy", "resumable"]) {
    for (const mimeType of [null, "", "application/octet-stream"]) {
      test(`${mode} preserves unknown image MIME ${JSON.stringify(mimeType)} as a download`, async () => {
        const f = await fixture();
        const metadata = f.metadata({ mimeType, filename: "unknown.bin" });
        if (mode === "legacy") {
          expect((await f.restore(metadata, png, "application/octet-stream")).status).toBe(200);
        } else {
          const client = createEdgeEverClient({ baseUrl: f.serve() });
          await client.restoreJsonResource(metadata.id, metadata, new Blob([png]));
        }
        expect(f.resourceRow().mime_type).toBe(mimeType ?? "application/octet-stream");
        const response = await f.request("/api/v1/resources/res_security/blob");
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
      });
    }
  }

  for (const mimeType of ["application/pdf", "audio/mpeg", "video/mp4"]) {
    test(`untyped attachments with ${mimeType} object metadata keep their download behavior`, async () => {
      const f = await fixture();
      const token = "s".repeat(43);
      const notebookToken = "n".repeat(43);
      f.database.run("INSERT INTO memo_shares (id, memo_id, workspace_id, token) VALUES ('security_share', ?, 'ws_default', ?)", [f.memo.id, token]);
      f.database.run("INSERT INTO notebook_shares (id, notebook_id, workspace_id, token) VALUES ('security_notebook', ?, 'ws_default', ?)", [f.notebook.id, notebookToken]);
      await f.environment.storage.resources.put("legacy-attachment", Uint8Array.of(65, 66));
      const getObject = f.environment.storage.resources.get.bind(f.environment.storage.resources);
      f.environment.storage.resources.get = async (...args) => {
        const object = await getObject(...args);
        object.writeHttpMetadata = (headers) => headers.set("Content-Type", mimeType);
        return object;
      };
      f.database.run("INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size) VALUES ('res_security', ?, 'legacy-attachment', 'attachment', NULL, 'untitled.bin', 2)", [f.memo.id]);
      for (const path of [
        "/api/v1/resources/res_security/blob",
        `/api/public/shares/${token}/resources/res_security/blob`,
        `/api/public/notebook-shares/${notebookToken}/resources/res_security/blob`,
      ]) {
        const response = await f.request(path);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(mimeType);
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.of(65, 66));
      }
    });
  }

  test("completion rejects an incompatible restore session persisted before the fix, before assembling or overwriting its object", async () => {
    const f = await fixture();
    expect((await f.restore(f.metadata())).status).toBe(200);
    const previous = f.resourceRow();
    const metadata = f.metadata({ kind: "attachment", mimeType: "text/html", filename: "resource.html", byteSize: html.length });
    const { upload } = await f.json("/api/v1/restores/json/resources/res_security/uploads", metadata);
    // This is the exact persisted metadata shape accepted by the old restore path.
    f.database.run("UPDATE resource_uploads SET kind = 'image', restore_metadata_json = ? WHERE id = ?", [JSON.stringify({ ...metadata, kind: "image" }), upload.id]);
    const session = f.database.query("SELECT * FROM resource_uploads WHERE id = ?").get(upload.id);
    const part = await f.request(`/api/v1/resource-uploads/${upload.id}/parts/1`, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(html.length) }, body: html,
    });
    expect(part.status).toBe(200);
    const response = await f.request(`/api/v1/resource-uploads/${upload.id}/complete`, { method: "POST" });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
    expect(f.resourceRow()).toEqual(previous);
    expect(await Bun.file(join(f.directory, session.object_key)).exists()).toBe(false);
    expect(new Uint8Array(await readFile(join(f.directory, previous.object_key)))).toEqual(png);
  });

  for (const mimeType of ["text/html", "application/xhtml+xml", "TEXT/HTML; charset=utf-8", null]) {
    test(`legacy image rows with ${mimeType ?? "HTML object metadata"} download through authenticated and both public routes`, async () => {
      const f = await fixture();
      const token = "s".repeat(43);
      const notebookToken = "n".repeat(43);
      f.database.run("INSERT INTO memo_shares (id, memo_id, workspace_id, token) VALUES ('security_share', ?, 'ws_default', ?)", [f.memo.id, token]);
      f.database.run("INSERT INTO notebook_shares (id, notebook_id, workspace_id, token) VALUES ('security_notebook', ?, 'ws_default', ?)", [f.notebook.id, notebookToken]);
      await f.environment.storage.resources.put("legacy-html", new TextEncoder().encode(html), { httpMetadata: { contentType: "text/html" } });
      // Unlike R2/S3, the filesystem adapter does not persist HTTP metadata.
      const getObject = f.environment.storage.resources.get.bind(f.environment.storage.resources);
      f.environment.storage.resources.get = async (...args) => {
        const object = await getObject(...args);
        object.writeHttpMetadata = (headers) => headers.set("Content-Type", "text/html");
        return object;
      };
      f.database.run("INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size) VALUES ('res_security', ?, 'legacy-html', 'image', ?, 'resource.html', ?)", [f.memo.id, mimeType, html.length]);
      for (const path of [
        "/api/v1/resources/res_security/blob",
        `/api/public/shares/${token}/resources/res_security/blob`,
        `/api/public/notebook-shares/${notebookToken}/resources/res_security/blob`,
      ]) {
        const response = await f.request(path);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
        expect(response.headers.get("Content-Type")).toBe(mimeType === "TEXT/HTML; charset=utf-8" ? "text/html; charset=utf-8" : mimeType ?? "text/html");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await response.text()).toBe(html);
      }
    });
  }

  test("legacy image restores accept image MIME parameters and a valid file MIME fallback without rewriting metadata", async () => {
    const f = await fixture();
    for (const mimeType of ["IMAGE/PNG; charset=binary", null]) {
      const response = await f.restore(f.metadata({ mimeType }), png, "image/png");
      expect(response.status).toBe(200);
      expect(f.resourceRow().mime_type).toBe(mimeType ?? "image/png");
      const blob = await f.request("/api/v1/resources/res_security/blob");
      expect(blob.headers.get("Content-Disposition")).toStartWith("inline;");
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png);
    }
  });

  test("HTML remains a downloadable attachment through legacy and resumable restores", async () => {
    const f = await fixture();
    const metadata = f.metadata({ kind: "attachment", mimeType: "text/html", filename: "resource.html", byteSize: html.length });
    expect((await f.restore(metadata, html)).status).toBe(200);
    const { upload } = await f.json("/api/v1/restores/json/resources/res_security/uploads", metadata);
    expect((await f.request(`/api/v1/resource-uploads/${upload.id}/parts/1`, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(html.length) }, body: html,
    })).status).toBe(200);
    await f.json(`/api/v1/resource-uploads/${upload.id}/complete`, {});
    const blob = await f.request("/api/v1/resources/res_security/blob");
    expect(blob.headers.get("Content-Disposition")).toStartWith("attachment;");
    expect(await blob.text()).toBe(html);
  });

  test("resumable image restores validate MIME without rewriting its parameters", async () => {
    const f = await fixture();
    const { upload } = await f.json("/api/v1/restores/json/resources/res_security/uploads", f.metadata({ mimeType: "IMAGE/PNG; charset=binary" }));
    expect(f.database.query("SELECT mime_type FROM resource_uploads WHERE id = ?").get(upload.id).mime_type).toBe("IMAGE/PNG; charset=binary");
    expect((await f.request(`/api/v1/resource-uploads/${upload.id}/parts/1`, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(png.length) }, body: png,
    })).status).toBe(200);
    await f.json(`/api/v1/resource-uploads/${upload.id}/complete`, {});
    expect(f.resourceRow().mime_type).toBe("IMAGE/PNG; charset=binary");
    expect(new Uint8Array(await readFile(join(f.directory, f.resourceRow().object_key)))).toEqual(png);
  });

  test("SVG encoding parameters and bytes survive both restore paths", async () => {
    const mimeType = "image/svg+xml; charset=utf-16le";
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>旧备份</text></svg>', "utf16le");
    for (const mode of ["legacy", "resumable"]) {
      const f = await fixture();
      const metadata = f.metadata({ mimeType, filename: "encoded.svg", byteSize: bytes.length });
      if (mode === "legacy") expect((await f.restore(metadata, bytes)).status).toBe(200);
      else await createEdgeEverClient({ baseUrl: f.serve() }).restoreJsonResource(metadata.id, metadata, new Blob([bytes]));
      expect(f.resourceRow().mime_type).toBe(mimeType);
      const response = await f.request("/api/v1/resources/res_security/blob");
      expect(response.headers.get("Content-Type")).toBe(mimeType);
      expect(response.headers.get("Content-Disposition")).toStartWith("inline;");
      expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
    }
  });

  for (const mode of ["legacy", "resumable"]) {
    test(`restores a real v2.12.0-exported archive through the patched ${mode} API`, async () => {
      const f = await fixture();
      const fixtureDirectory = new URL("../../../tests/fixtures/restore-resource-security/", import.meta.url);
      const source = JSON.parse(await readFile(new URL("source.json", fixtureDirectory), "utf8"));
      const backup = await parseEdgeEverZip(new Blob([await readFile(new URL("v2.12.0.zip", fixtureDirectory))]));
      expect(backup.manifest.edgeeverVersion).toBe("2.12.0");
      expect(backup.manifest.buildId).toBe(source.commit);
      const client = createEdgeEverClient({ baseUrl: f.serve() });
      await restoreEdgeEverZip(backup, {
        restoreNotebooks: client.restoreJsonNotebooks,
        restoreMemos: client.restoreJsonMemos,
        restorePrompts: client.restoreJsonAiPrompts,
        createResourceRestoreSink: mode === "resumable" ? client.createJsonResourceRestoreSink : async (_id, metadata) => {
          const chunks = [];
          return {
            write: async (chunk) => { chunks.push(chunk); },
            close: async () => {
              const response = await f.restore(metadata, await new Blob(chunks).arrayBuffer());
              expect(response.status).toBe(200);
            },
            abort: async () => {},
          };
        },
      });
      const restoredMemo = await (await f.request("/api/v1/memos/memo_release")).json();
      expect(restoredMemo.memo).toMatchObject(source.memos[0]);
      const notebooks = await (await f.request("/api/v1/notebooks")).json();
      expect(notebooks.notebooks.find((notebook) => notebook.id === "nb_release")).toMatchObject(source.notebooks[0]);
      const revisions = await (await f.request("/api/v1/memos/memo_release/revisions")).json();
      const { contentJson, ...revisionSummary } = source.revisions[0];
      expect(revisions.revisions).toEqual(expect.arrayContaining([expect.objectContaining(revisionSummary)]));
      expect(JSON.parse(f.database.query("SELECT content_json FROM memo_revisions WHERE id = ?").get(revisionSummary.id).content_json)).toEqual(contentJson);
      for (const resource of source.resources) {
        const row = f.database.query("SELECT * FROM resources WHERE id = ?").get(resource.id);
        expect(row).toMatchObject({ memo_id: resource.memoId, kind: resource.kind, mime_type: resource.mimeType ?? "application/octet-stream", filename: resource.filename, byte_size: resource.byteSize, width: resource.width, height: resource.height, created_at: resource.createdAt });
        const response = await f.request(resource.url);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Disposition")).toStartWith(resource.kind === "image" && resource.mimeType ? "inline;" : "attachment;");
        if (resource.mimeType === "image/svg+xml") expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from(Buffer.from(resource.bytesBase64, "base64")));
      }
      expect((await (await f.request(`/api/v1/memos/${f.memo.id}`)).json()).memo.contentMarkdown).toBe("Original note");
    });
  }
});

const ambiguousTypes = [
  ["image", "image/png; charset=utf-8, text/html"],
  ["image", 'image/png; note="quoted, value", text/html'],
  ["image", "image/png,"],
  ["attachment", "audio/mpeg; ignored=x, text/html"],
  ["attachment", "video/mp4; ignored=x, application/xhtml+xml"],
  ["attachment", "application/pdf, text/html"],
  ["attachment", "not-a-mime"],
  ["attachment", 'text/plain; note="line\nbreak"'],
  ["image", 'image/png; note="ok"\r\n; charset=utf-8'],
  ["attachment", 'audio/mpeg; charset=utf-8; charset="line\nbreak"'],
  ["attachment", "\r\n"],
];

const seedSharedResource = async (f, { kind, mimeType, filename = "resource.bin", objectMimeType = "application/octet-stream", body = html }) => {
  const token = "s".repeat(43);
  const notebookToken = "n".repeat(43);
  f.database.run("INSERT INTO memo_shares (id, memo_id, workspace_id, token) VALUES ('security_share', ?, 'ws_default', ?)", [f.memo.id, token]);
  f.database.run("INSERT INTO notebook_shares (id, notebook_id, workspace_id, token) VALUES ('security_notebook', ?, 'ws_default', ?)", [f.notebook.id, notebookToken]);
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  await f.environment.storage.resources.put("header-regression", bytes);
  const getObject = f.environment.storage.resources.get.bind(f.environment.storage.resources);
  f.environment.storage.resources.get = async (...args) => {
    const object = await getObject(...args);
    object.writeHttpMetadata = (headers) => headers.set("Content-Type", objectMimeType);
    return object;
  };
  f.database.run("INSERT INTO resources (id, memo_id, object_key, kind, mime_type, filename, byte_size) VALUES ('res_security', ?, 'header-regression', ?, ?, ?, ?)", [f.memo.id, kind, mimeType, filename, bytes.length]);
  return [
    "/api/v1/resources/res_security/blob",
    `/api/public/shares/${token}/resources/res_security/blob`,
    `/api/public/notebook-shares/${notebookToken}/resources/res_security/blob`,
  ];
};

describe("single-valued resource content types", () => {
  for (const [kind, mimeType] of ambiguousTypes) {
    for (const mode of ["legacy", "resumable"]) {
      test(`${mode} restore rejects the entire ambiguous ${mimeType} declaration`, async () => {
        const f = await fixture();
        const metadata = f.metadata({ kind, mimeType, filename: "resource.bin", byteSize: html.length });
        const previousObjects = (await readdir(f.directory, { recursive: true })).sort();
        const response = mode === "legacy"
          ? await f.restore(metadata, html, "application/octet-stream")
          : await f.request("/api/v1/restores/json/resources/res_security/uploads", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata),
          });
        expect(response.status).toBe(415);
        expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
        expect(f.resourceRow()).toBeNull();
        expect(f.database.query("SELECT COUNT(*) AS count FROM resource_uploads").get().count).toBe(0);
        expect((await readdir(f.directory, { recursive: true })).sort()).toEqual(previousObjects);
      });
    }

    test(`legacy ${kind} resource with ${mimeType} downloads on all blob routes`, async () => {
      const f = await fixture();
      const paths = await seedSharedResource(f, { kind, mimeType });
      for (const path of paths) {
        const response = await f.request(path);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await response.text()).toBe(html);
      }
    });
  }

  for (const [kind, mimeType] of [ambiguousTypes[0], ambiguousTypes[3], ambiguousTypes[ambiguousTypes.length - 2]]) {
    test(`completion revalidates an old ${kind} upload with ambiguous MIME before assembly`, async () => {
      const f = await fixture();
      expect((await f.restore(f.metadata())).status).toBe(200);
      const previous = f.resourceRow();
      const metadata = f.metadata({ kind: "attachment", mimeType: "text/plain", filename: "resource.bin", byteSize: html.length });
      const { upload } = await f.json("/api/v1/restores/json/resources/res_security/uploads", metadata);
      f.database.run("UPDATE resource_uploads SET kind = ?, mime_type = ?, restore_metadata_json = ? WHERE id = ?", [kind, mimeType, JSON.stringify({ ...metadata, kind, mimeType }), upload.id]);
      const session = f.database.query("SELECT object_key FROM resource_uploads WHERE id = ?").get(upload.id);
      expect((await f.request(`/api/v1/resource-uploads/${upload.id}/parts/1`, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(html.length) }, body: html,
      })).status).toBe(200);
      const response = await f.request(`/api/v1/resource-uploads/${upload.id}/complete`, { method: "POST" });
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
      expect(f.resourceRow()).toEqual(previous);
      expect(await Bun.file(join(f.directory, session.object_key)).exists()).toBe(false);
      expect(new Uint8Array(await readFile(join(f.directory, previous.object_key)))).toEqual(png);
    });
  }

  test("ambiguous object MIME and a misleading PDF filename cannot enable inline rendering", async () => {
    for (const metadata of [
      { kind: "image", mimeType: null, objectMimeType: ambiguousTypes[0][1] },
      { kind: "attachment", mimeType: null, objectMimeType: ambiguousTypes[3][1] },
      { kind: "image", mimeType: ambiguousTypes[0][1], filename: "resource.pdf" },
    ]) {
      const f = await fixture();
      for (const path of await seedSharedResource(f, metadata)) {
        const response = await f.request(path);
        expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
        expect(await response.text()).toBe(html);
      }
    }
  });

  test("quoted commas, semicolons, escaped quotes and SVG charset remain one safely serialized type", async () => {
    const mimeType = 'IMAGE/SVG+XML;\tcharset="utf-16le"; note="a,b; text/html; \\"quoted\\""';
    const header = 'image/svg+xml; charset=utf-16le; note="a,b; text/html; \\"quoted\\""';
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>旧备份</text></svg>', "utf16le");
    for (const mode of ["legacy", "resumable"]) {
      const f = await fixture();
      const metadata = f.metadata({ mimeType, filename: "encoded.svg", byteSize: bytes.length });
      if (mode === "legacy") expect((await f.restore(metadata, bytes)).status).toBe(200);
      else await createEdgeEverClient({ baseUrl: f.serve() }).restoreJsonResource(metadata.id, metadata, new Blob([bytes]));
      expect(f.resourceRow().mime_type).toBe(mimeType);
      const response = await f.request("/api/v1/resources/res_security/blob");
      expect(response.headers.get("Content-Type")).toBe(header);
      expect(response.headers.get("Content-Disposition")).toStartWith("inline;");
      expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
    }
  });
});
