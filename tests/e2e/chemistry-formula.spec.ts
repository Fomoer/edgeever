import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ locale: "en-US" });
test.setTimeout(90_000);

const createMemo = async (page: Page, title: string, contentMarkdown = "") => {
  const notebooks = await (await page.request.get("/api/v1/notebooks")).json() as { notebooks: Array<{ id: string }> };
  const response = await page.request.post("/api/v1/memos", {
    data: { notebookId: notebooks.notebooks[0]!.id, title, contentMarkdown },
  });
  expect(response.status()).toBe(201);
  return (await response.json() as { memo: { id: string } }).memo;
};

const deleteMemo = async (page: Page, memoId: string) => {
  await page.request.delete(`/api/v1/memos/${memoId}`);
  await page.request.delete(`/api/v1/memos/${memoId}?permanent=1`);
};

const openMemo = async (page: Page, memoId: string, title: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: "All notes", exact: true }).click();
  await page.getByPlaceholder("Search notes").fill(title);
  await page.locator(`[data-memo-id="${memoId}"]`).locator("button").first().click();
  const editor = page.locator(".ProseMirror[contenteditable='true']");
  await expect(editor).toBeEditable();
  return editor;
};

const savedMarkdown = (page: Page, memoId: string) => async () => {
  const body = await (await page.request.get(`/api/v1/memos/${memoId}`)).json() as { memo: { contentMarkdown: string } };
  return body.memo.contentMarkdown;
};

// KaTeX marks commands it cannot render in red, and the math nodes flag parse errors.
const RENDER_ERROR = "[style*='#cc0000'], [mathcolor='#cc0000'], .block-math-error, .inline-math-error";
const BLOCK_MATH = "[data-type='block-math']";

// A real click on the rendered formula, as a user makes it. Playwright's own
// actionability check reports the surrounding paragraph as covering the inline node.
const clickFormula = async (page: Page, formula: Locator) => {
  const box = (await formula.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

test("inserts chemistry examples inline and as a display formula, then reopens them for editing", async ({ page }) => {
  const title = `Chemistry formula ${Date.now()}`;
  const memo = await createMemo(page, title, "Water is\n\nReaction below");
  try {
    const editor = await openMemo(page, memo.id, title);
    await editor.getByText("Water is").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" ");

    // Inline: a single example from the chemistry mode.
    await page.getByRole("button", { name: "Insert formula" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Chemistry" }).click();
    await expect(dialog.getByRole("button", { name: "Chemistry" })).toHaveAttribute("aria-pressed", "true");
    // Chemistry has no visual editor toggle; the LaTeX source is the input.
    await expect(dialog.getByRole("button", { name: "Visual editor" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "LaTeX source" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Formula", exact: true }).click();
    await expect(dialog.locator("textarea")).toHaveValue("\\ce{H2O}");
    await expect(dialog.locator(".katex")).toBeVisible();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();
    await expect(editor.locator(".katex").first()).toBeVisible();

    // Display: start from an example and add the gas arrow by hand.
    // An automated click right after the dialog closes can lose to ProseMirror
    // restoring its selection on focus (see #719), so the caret is placed twice.
    await editor.getByText("Reaction below").click();
    await editor.getByText("Reaction below").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Insert formula" }).click();
    await expect(dialog.getByRole("heading", { name: "Insert formula" })).toBeVisible();
    await dialog.getByRole("button", { name: "Chemistry" }).click();
    await dialog.getByRole("button", { name: "Display" }).click();
    await dialog.getByRole("button", { name: "Conditions on the arrow" }).click();
    await expect(dialog.locator("textarea")).toHaveValue("\\ce{CaCO3 ->[\\Delta] CaO + CO2}");
    await dialog.locator("textarea").press("End");
    await dialog.locator("textarea").press("ArrowLeft");
    await dialog.locator("textarea").pressSequentially(" ^");
    await expect(dialog.locator("textarea")).toHaveValue("\\ce{CaCO3 ->[\\Delta] CaO + CO2 ^}");
    await expect(dialog.locator(".katex-display")).toBeVisible();
    await expect(dialog.locator(RENDER_ERROR)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();
    await expect(editor.locator(BLOCK_MATH)).toHaveCount(1);
    await expect(editor.locator(BLOCK_MATH).locator(".katex")).toBeVisible();
    await expect(editor.locator(RENDER_ERROR)).toHaveCount(0);

    await expect.poll(savedMarkdown(page, memo.id), { timeout: 20_000 }).toContain("$\\ce{H2O}$");
    await expect.poll(savedMarkdown(page, memo.id), { timeout: 20_000 }).toContain("\\ce{CaCO3 ->[\\Delta] CaO + CO2 ^}");

    // Editing an existing chemistry formula opens the chemistry mode with its source.
    await clickFormula(page, editor.locator(BLOCK_MATH));
    await expect(dialog.getByRole("heading", { name: "Edit formula" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Chemistry" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator("textarea")).toHaveValue("\\ce{CaCO3 ->[\\Delta] CaO + CO2 ^}");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await deleteMemo(page, memo.id);
  }
});

test("renders stored chemistry in the editor and on the public share page", async ({ page }) => {
  const title = `Chemistry share ${Date.now()}`;
  const memo = await createMemo(page, title, [
    "Ions $\\ce{SO4^2-}$ and $\\ce{Na+(aq)}$, isotope $\\ce{^{14}_{6}C}$, hydrate $\\ce{CuSO4*5H2O}$, energy $\\pu{-286 kJ/mol}$.",
    "",
    "$$",
    "\\ce{N2 + 3H2 <=> 2NH3}",
    "$$",
    "",
    "Math still works: $E = mc^2$.",
  ].join("\n"));
  try {
    const editor = await openMemo(page, memo.id, title);
    await expect(editor.locator(".katex")).toHaveCount(7);
    await expect(editor.locator(BLOCK_MATH)).toHaveCount(1);
    await expect(editor.locator(RENDER_ERROR)).toHaveCount(0);

    // An ordinary math formula still opens in the math mode.
    const dialog = page.getByRole("dialog");
    await clickFormula(page, editor.locator("[data-type='inline-math']").last());
    await expect(dialog.getByRole("button", { name: "Math" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // A stored chemistry formula opens in the chemistry mode, without the visual editor.
    await clickFormula(page, editor.locator("[data-type='inline-math']").first());
    await expect(dialog.getByRole("button", { name: "Chemistry" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator("textarea")).toHaveValue("\\ce{SO4^2-}");
    await expect(dialog.locator("math-field")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    const share = (await (await page.request.post(`/api/v1/memos/${memo.id}/share`, { data: {} })).json()).share as { token: string };
    await page.goto(`/share/${share.token}`);
    const article = page.locator("article").last();
    await expect(article.locator(".katex")).toHaveCount(7);
    await expect(article.locator(BLOCK_MATH)).toHaveCount(1);
    await expect(article.locator(RENDER_ERROR)).toHaveCount(0);
  } finally {
    await deleteMemo(page, memo.id);
  }
});

test("examples keep their command inside a different command and unwrap inside the same one", async ({ page }) => {
  const title = `Chemistry nesting ${Date.now()}`;
  const memo = await createMemo(page, title, "Energy");
  try {
    const editor = await openMemo(page, memo.id, title);
    await editor.getByText("Energy").click();
    await page.keyboard.press("End");
    await page.getByRole("button", { name: "Insert formula" }).click();
    const dialog = page.getByRole("dialog");
    const source = dialog.locator("textarea");
    await dialog.getByRole("button", { name: "Chemistry" }).click();

    // Review case: an ion inside \pu stays a \ce command instead of "Double superscript".
    await source.fill("\\pu{5 }");
    await source.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(6, 6));
    await dialog.getByRole("button", { name: "Ion", exact: true }).click();
    await expect(source).toHaveValue("\\pu{5 \\ce{SO4^2-}}");
    await expect(dialog.locator(".katex")).toBeVisible();
    await expect(dialog.locator(RENDER_ERROR)).toHaveCount(0);

    // Units inside a reaction keep \pu; a formula inside the same \ce is unwrapped.
    await source.fill("\\ce{A -> }");
    await source.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(9, 9));
    await dialog.getByRole("button", { name: "Units", exact: true }).click();
    await expect(source).toHaveValue("\\ce{A -> \\pu{123 kJ/mol}}");
    // The dialog moves the caret after the inserted example on the next frame.
    await expect.poll(() => source.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(24);
    await source.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(5, 5));
    await dialog.getByRole("button", { name: "Formula", exact: true }).click();
    await expect(source).toHaveValue("\\ce{A H2O -> \\pu{123 kJ/mol}}");
    await expect(dialog.locator(RENDER_ERROR)).toHaveCount(0);

    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();
    await expect(editor.locator("[data-type='inline-math']")).toHaveCount(1);
    await expect(editor.locator(RENDER_ERROR)).toHaveCount(0);
    await expect.poll(savedMarkdown(page, memo.id), { timeout: 20_000 }).toContain("$\\ce{A H2O -> \\pu{123 kJ/mol}}$");
  } finally {
    await deleteMemo(page, memo.id);
  }
});
