import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

const createMemo = async (page: Page, title: string, contentMarkdown: string) => {
  const notebooks = await (await page.request.get("/api/v1/notebooks")).json() as { notebooks: Array<{ id: string }> };
  const response = await page.request.post("/api/v1/memos", {
    data: { notebookId: notebooks.notebooks[0]!.id, title, contentMarkdown },
  });
  expect(response.status()).toBe(201);
  return (await response.json() as { memo: { id: string } }).memo;
};

const paragraphs = (page: Page) => page.evaluate(() => {
  const editor = (document.querySelector(".ProseMirror") as HTMLElement & {
    editor: { getJSON: () => { content: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> } };
  }).editor;
  return editor.getJSON().content.map((node) => node.type === "blockMath" ? "[blockMath]" : (node.content ?? []).map((child) => child.text ?? `[${child.type}]`).join(""));
});

// Issue #719: the caret was moved back in front of a newly inserted formula.
for (const kind of ["Inline", "Display"] as const) {
  test(`typing right after inserting a ${kind.toLowerCase()} formula continues after it`, async ({ page }) => {
    const title = `Formula caret ${kind} ${Date.now()}`;
    const memo = await createMemo(page, title, "Energy is");
    try {
      await page.goto("/");
      await page.getByRole("button", { name: "All notes", exact: true }).click();
      await page.getByPlaceholder("Search notes").fill(title);
      await page.locator(`[data-memo-id="${memo.id}"]`).locator("button").first().click();
      const editor = page.locator(".ProseMirror[contenteditable='true']");
      await expect(editor).toBeEditable();
      await editor.getByText("Energy is").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" ");

      await page.getByRole("button", { name: "Insert formula" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: kind, exact: true }).click();
      await dialog.getByRole("button", { name: "LaTeX source" }).click();
      await dialog.locator("textarea").fill("E = mc^2");
      await dialog.getByRole("button", { name: "Apply" }).click();
      await expect(dialog).toBeHidden();
      await page.keyboard.type("AFTER");

      await expect.poll(() => paragraphs(page)).toEqual(kind === "Inline"
        ? ["Energy is [inlineMath]AFTER"]
        : ["Energy is ", "[blockMath]", "AFTER"]);

      // Undo removes the formula together with the paragraph added after it.
      // History may group the typing with the insertion, so undo up to twice.
      await page.keyboard.press("ControlOrMeta+z");
      if ((await paragraphs(page)).join("|") !== "Energy is ") await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => paragraphs(page)).toEqual(["Energy is "]);
    } finally {
      await page.request.delete(`/api/v1/memos/${memo.id}`);
      await page.request.delete(`/api/v1/memos/${memo.id}?permanent=1`);
    }
  });
}

const clickFormula = async (page: Page, selector: string) => {
  // A real click on the rendered formula; Playwright's actionability check
  // reports the surrounding paragraph as covering the inline node.
  const box = (await page.locator(`.ProseMirror ${selector}`).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const outline = (page: Page) => page.evaluate(() => {
  const editor = (document.querySelector(".ProseMirror") as HTMLElement & {
    editor: { getJSON: () => { content: Array<{ type: string; attrs?: { latex?: string }; content?: Array<{ type: string; text?: string; attrs?: { latex?: string } }> }> } };
  }).editor;
  return editor.getJSON().content.map((node) => node.type === "blockMath"
    ? `[block:${node.attrs?.latex}]`
    : (node.content ?? []).map((child) => child.text ?? `[inline:${child.attrs?.latex}]`).join(""));
});

for (const [kind, selector, expected] of [
  ["inline", "[data-type='inline-math']", ["A [inline:z^2]Q B", "[block:y]", "C"]],
  ["display", "[data-type='block-math']", ["A [inline:x] B", "[block:z^2]", "Q", "C"]],
] as const) {
  test(`typing right after editing a ${kind} formula continues after it and keeps it`, async ({ page }) => {
    const title = `Formula edit caret ${kind} ${Date.now()}`;
    const memo = await createMemo(page, title, "A $x$ B\n\n$$\ny\n$$\n\nC");
    try {
      await page.goto("/");
      await page.getByRole("button", { name: "All notes", exact: true }).click();
      await page.getByPlaceholder("Search notes").fill(title);
      await page.locator(`[data-memo-id="${memo.id}"]`).locator("button").first().click();
      await expect(page.locator(`.ProseMirror ${selector}`)).toBeVisible();

      await clickFormula(page, selector);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Edit formula" })).toBeVisible();
      await dialog.getByRole("button", { name: "LaTeX source" }).click();
      await dialog.locator("textarea").fill("z^2");
      await dialog.getByRole("button", { name: "Apply" }).click();
      await expect(dialog).toBeHidden();
      await page.keyboard.type("Q");

      await expect.poll(() => outline(page)).toEqual([...expected]);
    } finally {
      await page.request.delete(`/api/v1/memos/${memo.id}`);
      await page.request.delete(`/api/v1/memos/${memo.id}?permanent=1`);
    }
  });
}
