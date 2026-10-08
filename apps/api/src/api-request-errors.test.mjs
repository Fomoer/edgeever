import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clampNumber } from "./entity-utils.ts";
import { fetchEdgeEverApp } from "./index.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";

const temporaryDirectories = [];
const databases = [];
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const createEnvironment = async () => {
  const directory = await mkdtemp(`${tmpdir()}/edgeever-request-errors-`);
  temporaryDirectories.push(directory);
  const database = new Database(join(directory, "edgeever.sqlite"), { create: true });
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = new URL("../../../migrations/", import.meta.url);
  for (const name of (await readdir(migrationDirectory)).filter((value) => value.endsWith(".sql")).sort()) {
    database.exec(await readFile(new URL(name, migrationDirectory), "utf8"));
  }
  database.query("INSERT OR IGNORE INTO workspaces (id, name, is_personal) VALUES ('ws_default', 'Personal', 1)").run();
  return {
    storage: createSelfHostedStorageAdapter(database, join(directory, "resources")),
    EDGE_EVER_ALLOW_UNAUTHENTICATED: "true",
    EDGE_EVER_RUNTIME: "self-hosted-bun",
  };
};

const request = (environment, path, init = {}) => fetchEdgeEverApp(
  new Request(`http://edgeever.test${path}`, init),
  environment,
  { waitUntil: () => undefined, passThroughOnException: () => undefined },
);

const jsonPost = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});

describe("API request errors", () => {
  test("reports a malformed JSON body as a client error", async () => {
    const environment = await createEnvironment();
    const response = await request(environment, "/api/v1/notebooks", jsonPost("{\"name\":"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "bad_request", message: "Malformed JSON in request body" },
    });
  });

  test("reports an oversized body as payload too large", async () => {
    const environment = await createEnvironment();
    const oversized = JSON.stringify({ prompt: "x".repeat(450_000) });

    for (const path of ["/api/v1/plugins/ai/generate", "/api/v1/companion/turns"]) {
      const response = await request(environment, path, jsonPost(oversized));
      expect({ path, status: response.status }).toEqual({ path, status: 413 });
      expect(await response.json()).toEqual({
        error: { code: "payload_too_large", message: "The request body is too large." },
      });
    }
  });

  test("accepts a fractional list limit instead of failing in SQL", async () => {
    const environment = await createEnvironment();
    const response = await request(environment, "/api/v1/memos?limit=1.5");

    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).memos)).toBe(true);
  });

  test("clamps limits and offsets to whole numbers", () => {
    expect(clampNumber(1.5, 1, 100)).toBe(1);
    expect(clampNumber(99.9, 1, 100)).toBe(99);
    expect(clampNumber(250, 1, 100)).toBe(100);
    expect(clampNumber(-3, 0, 100)).toBe(0);
    expect(clampNumber(Number.NaN, 1, 100)).toBe(1);
    expect(clampNumber(Number.POSITIVE_INFINITY, 0, 50)).toBe(50);
  });
});
