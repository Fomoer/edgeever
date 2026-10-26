import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { fetchEdgeEverApp } from "../apps/api/src/index.ts";
import { createSelfHostedStorageAdapter } from "../apps/api/src/self-hosted-storage-adapter.ts";
import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

assert.ok(process.argv[2], "Pass the locally built desktop executable as the first argument.");
const directory = await mkdtemp(join(tmpdir(), "edgeever-desktop-appearance-"));
let application;
let server;
let database;
try {
  database = new Database(join(directory, "test-api.sqlite"));
  for (const name of (await readdir("migrations")).filter(name => name.endsWith(".sql")).sort()) {
    database.exec(await readFile(join("migrations", name), "utf8"));
  }
  database.query("INSERT OR IGNORE INTO workspaces(id,name,is_personal) VALUES ('ws_default','Personal',1)").run();
  const environment = {
    storage: createSelfHostedStorageAdapter(database, join(directory, "resources")),
    EDGE_EVER_ALLOW_UNAUTHENTICATED: "true",
    EDGE_EVER_RUNTIME: "self-hosted-bun",
  };
  server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => fetchEdgeEverApp(request, environment, { waitUntil() {}, passThroughOnException() {} }),
  });
  const created = await fetch(`http://127.0.0.1:${server.port}/api/v1/notebooks`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Desktop appearance regression" }),
  });
  assert.equal(created.status, 201);
  const { notebook } = await created.json();
  await writeFile(join(directory, "instance-url"), `http://127.0.0.1:${server.port}`);
  await writeFile(join(directory, "installation-confirmed"), "test");
  application = await electron.launch({
    executablePath: resolve(process.argv[2]),
    args: [`--user-data-dir=${directory}`],
    env: { ...process.env, EDGE_EVER_DISABLE_AUTO_UPDATE: "1" },
    timeout: 30000,
  });
  // Startup can briefly open a renderer-origin migration window before the main window.
  let page;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    page = application.windows().find(window => window.url().startsWith("edgeever-app://app/index.html"));
    if (page) break;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.ok(page, "The packaged main window must open");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.waitForSelector('[data-edgeever-renderer-ready="true"]', { state: "attached" });
  await page.evaluate(() => localStorage.setItem("edgeever.locale.preference", "en-US"));
  await page.reload();
  await expect(page.getByRole("button", { name: "New notebook", exact: true })).toBeVisible({ timeout: 20000 });
  await page.reload();
  const row = page.locator(`[data-notebook-id="${notebook.id}"]`);
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole("button", { name: "Open actions for Desktop appearance regression", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Appearance", exact: true });
  await dialog.getByRole("button", { name: "Icon", exact: true }).click();
  await dialog.getByPlaceholder("Search icons (English or German)").fill("alarm-clock");
  await dialog.getByRole("option", { name: "alarm clock", exact: true }).click();
  // This icon is loaded dynamically through the packaged application's custom scheme.
  await expect(dialog.locator('svg:has(circle[cx="12"][cy="13"][r="8"])').first()).toBeVisible();
  await expect(dialog.locator('[data-notebook-color-picker="Icon color"] button')).toHaveCount(5);
  await dialog.getByLabel("Icon color", { exact: true }).fill("#2563eb");
  await dialog.getByLabel("Text color", { exact: true }).fill("#dc2626");
  await dialog.getByRole("switch", { name: "Bold", exact: true }).check();
  await dialog.getByLabel("Invert", { exact: true }).selectOption("row");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row.locator('svg:has(circle[cx="12"][cy="13"][r="8"])')).toBeVisible();
  await expect(row).toHaveClass(/notebook-inverted-row/);
  await page.reload();
  await expect(row.locator('svg:has(circle[cx="12"][cy="13"][r="8"])')).toBeVisible();
  const stored = await page.evaluate(async id => {
    const { notebooks } = await window.edgeeverDesktop.sidecarRequest("notebook.list");
    return notebooks.find(book => book.id === id);
  }, notebook.id);
  for (const [key, value] of Object.entries({ icon: "alarm-clock", color: "#2563eb", textColor: "#dc2626", isBold: true, iconInverted: false, rowInverted: true })) {
    assert.equal(stored[key], value);
  }
  assert.deepEqual(errors, []);
  console.log("Packaged desktop appearance: dialog, dynamic icon, palette, colors, bold, full-row inversion and reload passed.");
} finally {
  await application?.close();
  server?.stop(true);
  database?.close();
  await rm(directory, { recursive: true, force: true });
}
