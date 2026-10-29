import { expect, test } from "@playwright/test";

// #709: exercise the real EditorPane drop handler, coordinates, and async upload.
// Synthetic DragEvents cannot verify Finder's native drag transport.
for (const kind of ["image", "attachment"]) {
  test(`drops an uploaded ${kind} at the indicated point and maps it through edits during upload`, async ({ page }) => {
    const title = `Drop position ${kind} ${Date.now()}`;
    const notebooks = await (await page.request.get("/api/v1/notebooks")).json();
    const created = await page.request.post("/api/v1/memos", {
      data: { notebookId: notebooks.notebooks[0].id, title,
        contentMarkdown: "FIRST paragraph\n\nMIDDLE paragraph\n\nLAST paragraph" },
    });
    expect(created.status()).toBe(201);
    const { memo } = await created.json();
    let releaseUpload = () => {};
    const gate = new Promise<void>((resolve) => { releaseUpload = resolve; });
    try {
      await page.route("**/api/v1/memos/*/resources", async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto("/");
      // A prior browser session may have left focus mode on.
      const exitFocus = page.getByRole("button", { name: "退出专注模式", exact: true });
      if (await exitFocus.isVisible()) await exitFocus.click();
      await page.getByRole("button", { name: "全部笔记", exact: true }).click();
      await page.getByPlaceholder("搜索笔记").fill(title);
      await page.locator(`[data-memo-id="${memo.id}"]`).locator("button").first().click();
      const editor = page.locator(".ProseMirror[contenteditable='true']");
      await expect(editor).toContainText("LAST paragraph");
      await editor.click();
      await editor.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
      // A drop must not replace the old selected text.
      if (kind === "attachment") await editor.press("Shift+ArrowRight");
      await expect.poll(() => editor.evaluate(() => {
        const selection = window.getSelection();
        return selection?.anchorNode?.parentElement?.closest("p")?.textContent;
      })).toBe("FIRST paragraph");
      expect(await editor.evaluate(() => window.getSelection()?.toString()))
        .toBe(kind === "attachment" ? "F" : "");

      await editor.evaluate((element, fileKind) => {
        const paragraphs = element.querySelectorAll("p");
        const target = paragraphs[fileKind === "image" ? 2 : 1]!;
        const range = document.createRange();
        const text = target.firstChild!;
        range.setStart(text, text.textContent!.length);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        dataTransfer.items.add(fileKind === "image"
          ? new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "drop.png", { type: "image/png" })
          : new File(["dropped attachment"], "drop.txt", { type: "text/plain" }));
        for (const type of ["dragover", "drop"]) {
          const event = new DragEvent(type, { bubbles: true, cancelable: true,
            clientX: rect.right, clientY: (rect.top + rect.bottom) / 2, dataTransfer });
          target.dispatchEvent(event);
        }
      }, kind);
      const placeholder = editor.locator("[data-placeholder-id]");
      await expect(placeholder).toHaveCount(1);
      const followingParagraph = placeholder.locator("xpath=following::p[1]");
      if (kind === "attachment") await expect(followingParagraph).toContainText("LAST paragraph");

      // Shift the document while the upload is blocked. A saved integer would
      // now insert inside the wrong paragraph; a mapped anchor stays at its end.
      await editor.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
      await page.keyboard.insertText("INSERTED DURING UPLOAD ");
      releaseUpload();
      await expect(placeholder).toHaveCount(0);
      if (kind === "image") {
        const image = editor.locator(".edgeever-image-node");
        await expect(image).toBeVisible();
        await expect.poll(() => editor.evaluate((element) => {
          const imageBlock = Array.from(element.children).find((child) => child.querySelector("img"));
          return imageBlock?.previousElementSibling?.textContent;
        })).toBe("LAST paragraph");
      } else {
        const attachment = editor.locator("a").filter({ hasText: "drop.txt" }).first();
        await expect(attachment).toBeVisible();
        await expect(attachment.locator("xpath=ancestor::p[1]/following-sibling::p[1]"))
          .toHaveText("LAST paragraph");
      }
      await expect(editor).toContainText("INSERTED DURING UPLOAD FIRST paragraph");
      await expect(editor).toContainText("MIDDLE paragraph");
      await expect(editor).toContainText("LAST paragraph");
    } finally {
      releaseUpload();
      await page.request.delete(`/api/v1/memos/${memo.id}`);
      await page.request.delete(`/api/v1/memos/${memo.id}?permanent=1`);
    }
  });
}
