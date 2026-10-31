import { expect, test, type Page } from "@playwright/test";
import { infographicFallbackMarkdown, serializeInfographicDocument } from "../../packages/shared/src/infographic";
import { markdownToDoc } from "../../packages/shared/src/content";

const syntax = (heading: string) => `infographic list-row-simple-horizontal-arrow\ndata\n  title ${heading}\n  lists\n    - label First\n    - label Second`;
const content = (heading: string) => {
  const document = { schemaVersion: 1 as const, syntax: syntax(heading) };
  return { contentMarkdown: serializeInfographicDocument(document), contentJson: markdownToDoc(infographicFallbackMarkdown(document)) };
};
const openMemo = async (page: Page, id: string, title: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: "全部笔记", exact: true }).click();
  await page.getByPlaceholder("搜索笔记").fill(title);
  await page.locator(`[data-memo-id="${id}"]`).locator("button").first().click();
  await expect(page.locator(".edgeever-infographic-preview svg")).toBeVisible();
};
const createMemo = async (page: Page, title: string) => {
  const { notebooks } = await (await page.request.get("/api/v1/notebooks")).json();
  const response = await page.request.post("/api/v1/memos", { data: { notebookId: notebooks[0].id, title, ...content("Original graphic") } });
  expect(response.status()).toBe(201);
  return (await response.json()).memo;
};
const changeRemote = async (page: Page, id: string, heading: string) => {
  const { editSession } = await (await page.request.post(`/api/v1/memos/${id}/edit-sessions`)).json();
  const response = await page.request.patch(`/api/v1/memos/${id}`, { data: {
    expectedRevision: editSession.baseRevision, expectedContentHash: editSession.baseContentHash,
    editSessionId: editSession.id, ...content(heading),
  } });
  expect(response.ok(), await response.text()).toBe(true);
  const { memo } = await response.json();
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("edgeever:memo-detail-refreshed", { detail })), memo);
  return memo;
};
const removeMemo = async (page: Page, id: string) => {
  await page.request.delete(`/api/v1/memos/${id}`);
  await page.request.delete(`/api/v1/memos/${id}?permanent=1`);
};
const queuedUpdate = (page: Page, id: string) => page.evaluate((memoId) => new Promise<{ status: string; payload: { expectedRevision: number; expectedContentHash: string; title: string } } | undefined>((resolve, reject) => {
  const open = indexedDB.open("edgeever-local");
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const database = open.result;
    const request = database.transaction("syncQueue", "readonly").objectStore("syncQueue").get(`memo.update:${memoId}`);
    request.onerror = () => { database.close(); reject(request.error); };
    request.onsuccess = () => { database.close(); resolve(request.result); };
  };
}), id);

test("infographic keeps newer title, tags and inline text when an older save is acknowledged", async ({ page }) => {
  const marker = `infographic-ack-${Date.now()}`;
  const memo = await createMemo(page, marker);
  let release!: () => void;
  let stored!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const firstStored = new Promise<void>((resolve) => { stored = resolve; });
  let updates = 0;
  await page.route(`**/api/v1/memos/${memo.id}`, async (route) => {
    if (route.request().method() !== "PATCH" || ++updates !== 1) return route.continue();
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    stored();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await openMemo(page, memo.id, marker);
    const title = page.getByRole("textbox", { name: "信息图", exact: true });
    const preview = page.locator(".edgeever-infographic-preview");
    await title.fill(`${marker}-first`);
    await expect.poll(async () => (await queuedUpdate(page, memo.id))?.payload.title).toBe(`${marker}-first`);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("edgeever:sync-queue-changed")));
    await firstStored;
    await page.clock.install();
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1_000));
    await title.fill(`${marker}-newer`);
    await page.getByRole("button", { name: "选择笔记标签", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill(marker);
    await dialog.locator('button[type="submit"]').click();
    await page.keyboard.press("Escape");
    await preview.locator('[data-element-type="title"]').dblclick();
    const inline = preview.locator('[contenteditable="true"]');
    await inline.fill("New inline draft");
    const originalSvg = await preview.locator("svg").elementHandle();
    const completed = page.evaluate(() => new Promise<void>((resolve) => window.addEventListener("edgeever:sync-completed", () => resolve(), { once: true })));
    release();
    await completed;
    await expect(title).toHaveValue(`${marker}-newer`);
    await expect(inline).toHaveText("New inline draft");
    await expect(inline).toBeFocused();
    expect(await originalSvg!.evaluate((svg) => svg.isConnected)).toBe(true);
    await expect(page.getByText("未保存", { exact: true }).last()).toBeVisible();
    await title.click();
    const nextSaved = page.waitForResponse((response) => response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/v1/memos/${memo.id}`
      && response.request().postDataJSON()?.contentMarkdown?.includes("New inline draft"));
    await page.clock.runFor(1_600);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("edgeever:sync-queue-changed")));
    const response = await nextSaved;
    expect(response.ok(), await response.text()).toBe(true);
    const { memo: saved } = await (await page.request.get(`/api/v1/memos/${memo.id}`)).json();
    expect(saved.title).toBe(`${marker}-newer`);
    expect(saved.tags).toContain(marker);
    expect(saved.contentMarkdown).toContain("New inline draft");
    await page.clock.resume();
    await openMemo(page, memo.id, `${marker}-newer`);
    await expect(preview).toContainText("New inline draft");
    await expect(title).toHaveValue(`${marker}-newer`);
  } finally {
    release();
    await page.unroute(`**/api/v1/memos/${memo.id}`);
    await removeMemo(page, memo.id);
  }
});

test("infographic applies idle remote changes but retains a draft's original conflict base", async ({ page }) => {
  const marker = `infographic-remote-${Date.now()}`;
  const memo = await createMemo(page, marker);
  try {
    await openMemo(page, memo.id, marker);
    const preview = page.locator(".edgeever-infographic-preview");
    await changeRemote(page, memo.id, "Remote while idle");
    await expect(preview).toContainText("Remote while idle");
    await page.clock.install();
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1_000));
    const title = page.getByRole("textbox", { name: "信息图", exact: true });
    await title.fill(`${marker}-canceled`);
    await changeRemote(page, memo.id, "Remote after undo");
    await page.clock.runFor(50);
    await expect(preview).toContainText("Remote while idle");
    await title.fill(marker);
    await page.clock.runFor(350);
    await expect(preview).toContainText("Remote after undo");
    // Even unchanged active inline text must not be destroyed by a refresh.
    await preview.locator('[data-element-type="title"]').dblclick();
    await changeRemote(page, memo.id, "Remote after blur");
    await page.clock.runFor(50);
    await expect(preview.locator('[contenteditable="true"]')).toBeFocused();
    await expect(preview).toContainText("Remote after undo");
    await title.click();
    await page.clock.runFor(350);
    await expect.poll(async () => {
      await page.clock.runFor(100);
      return preview.textContent();
    }).toContain("Remote after blur");
    await title.fill(`${marker}-draft`);
    const incoming = await changeRemote(page, memo.id, "Remote during draft");
    await page.clock.runFor(50);
    await expect(preview).toContainText("Remote after blur");
    await page.clock.runFor(1_300);
    await expect.poll(async () => (await queuedUpdate(page, memo.id))?.payload.title).toBe(`${marker}-draft`);
    const queued = (await queuedUpdate(page, memo.id))!;
    expect(queued.payload.expectedRevision).toBe(incoming.revision - 1);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("edgeever:sync-queue-changed")));
    await expect.poll(async () => (await queuedUpdate(page, memo.id))?.status).toBe("conflict");
    // A newer remote base must never authorize uploading the older graphic.
    const { memo: stored } = await (await page.request.get(`/api/v1/memos/${memo.id}`)).json();
    expect(stored.contentMarkdown).toBe(incoming.contentMarkdown);
    await expect(page.getByRole("textbox", { name: "信息图", exact: true })).toHaveValue(`${marker}-draft`);
  } finally { await removeMemo(page, memo.id); }
});

test("infographic does not roll back an already queued successor when the older receipt reaches the editor", async ({ page }) => {
  const marker = `infographic-queued-${Date.now()}`;
  const memo = await createMemo(page, marker);
  let release!: () => void;
  let stored!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const firstStored = new Promise<void>((resolve) => { stored = resolve; });
  let updates = 0;
  let receipt: unknown;
  await page.route(`**/api/v1/memos/${memo.id}`, async (route) => {
    if (route.request().method() !== "PATCH" || ++updates !== 1) return route.continue();
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    receipt = (await response.json()).memo;
    stored();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await openMemo(page, memo.id, marker);
    const title = page.getByRole("textbox", { name: "信息图", exact: true });
    await title.fill(`${marker}-first`);
    await expect.poll(async () => (await queuedUpdate(page, memo.id))?.payload.title).toBe(`${marker}-first`);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("edgeever:sync-queue-changed")));
    await firstStored;
    await page.clock.install();
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1_000));
    await title.fill(`${marker}-second`);
    await page.clock.runFor(1_300);
    await expect.poll(async () => (await queuedUpdate(page, memo.id))?.payload.title).toBe(`${marker}-second`);
    // Replay the real first receipt through the same two editor notifications.
    // The successor is locally saved (clean), but has not reached the server.
    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent("edgeever:memo-sync-acknowledged", { detail }));
      window.dispatchEvent(new CustomEvent("edgeever:memo-detail-refreshed", { detail }));
    }, receipt);
    await page.clock.runFor(50);
    await expect(title).toHaveValue(`${marker}-second`);
    const nextSaved = page.waitForResponse((response) => response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/v1/memos/${memo.id}` && response.request().postDataJSON()?.title === `${marker}-second`);
    const completed = page.evaluate(() => new Promise<void>((resolve) => window.addEventListener("edgeever:sync-completed", () => resolve(), { once: true })));
    release();
    await completed;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("edgeever:sync-queue-changed")));
    expect((await nextSaved).ok()).toBe(true);
    await page.clock.resume();
    await openMemo(page, memo.id, `${marker}-second`);
    await expect(title).toHaveValue(`${marker}-second`);
  } finally {
    release();
    await page.unroute(`**/api/v1/memos/${memo.id}`);
    await removeMemo(page, memo.id);
  }
});

test("infographic keeps title input and focus across temporary id remapping", async ({ page }) => {
  let release!: () => void;
  let created!: (id: string) => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const createdId = new Promise<string>((resolve) => { created = resolve; });
  let id: string | undefined;
  await page.route("**/api/v1/memos", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    created((await response.json()).memo.id);
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "选择笔记类型", exact: true }).click();
    await page.getByRole("menuitem", { name: "信息图", exact: true }).click();
    id = await createdId;
    await page.clock.install();
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1_000));
    const title = page.getByRole("textbox", { name: "信息图", exact: true });
    const marker = `infographic-remap-${Date.now()}`;
    await title.fill(marker);
    const originalInput = await title.elementHandle();
    const mapped = page.evaluate(() => new Promise<void>((resolve) => window.addEventListener("edgeever:memo-id-remapped", () => resolve(), { once: true })));
    release();
    await mapped;
    await expect(page.locator(`[data-memo-id="${id}"]`)).toBeVisible();
    await expect(title).toHaveValue(marker);
    await expect(title).toBeFocused();
    expect(await originalInput!.evaluate((input) => input.isConnected)).toBe(true);
    const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/v1/memos/${id}`);
    await page.clock.runFor(1_300);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("edgeever:sync-queue-changed")));
    expect((await saved).ok()).toBe(true);
    await page.clock.resume();
    await page.reload();
    await page.getByRole("button", { name: "全部笔记", exact: true }).click();
    await page.getByPlaceholder("搜索笔记").fill(marker);
    await page.locator(`[data-memo-id="${id}"]`).locator("button").first().click();
    await expect(title).toHaveValue(marker);
  } finally {
    release();
    await page.unroute("**/api/v1/memos");
    if (id) await removeMemo(page, id);
  }
});
