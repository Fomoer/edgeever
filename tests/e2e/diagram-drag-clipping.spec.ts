import { expect, test } from "@playwright/test";
import { createDefaultDiagramDocument, serializeDiagramDocument } from "../../packages/shared/src/diagram";

const cases = (["flowchart", "mind-map", "architecture"] as const).flatMap((kind) =>
  [50, 100].flatMap((zoom) => (["left", "up"] as const).map((direction) => ({ kind, zoom, direction }))),
);

for (const { kind, zoom, direction } of cases) {
  test(`${kind} ${zoom}% ${direction} stays visible while dragging past the paper origin (#700)`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    const document = createDefaultDiagramDocument(kind);
    // A small diagram exposes the internal paper boundary inside the viewport.
    const node = document.nodes.find((item) => item.shape !== "boundary" && !item.parentId)!;
    document.nodes = [node];
    document.edges = [];
    const title = `Diagram drag #700 ${kind} ${Date.now()}`;
    const { notebooks } = await (await page.request.get("/api/v1/notebooks")).json() as {
      notebooks: Array<{ id: string }>;
    };
    const response = await page.request.post("/api/v1/memos", {
      data: { notebookId: notebooks[0]?.id, title, contentMarkdown: serializeDiagramDocument(document) },
    });
    expect(response.status()).toBe(201);
    const { memo } = await response.json() as { memo: { id: string } };

    try {
      await page.goto("/");
      await page.getByRole("button", { name: "全部笔记", exact: true }).click();
      await page.getByPlaceholder("搜索笔记").fill(title);
      await page.locator(`[data-memo-id="${memo.id}"]`).locator("button").first().click();
      const renderedNode = page.locator(`.x6-node[data-cell-id="${node.id}"]`);
      await expect(renderedNode).toBeVisible();
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
      await page.clock.runFor(500);

      const zoomInput = page.getByRole("textbox", { name: "缩放百分比" });
      await zoomInput.fill(String(zoom));
      await zoomInput.press("Enter");
      await page.clock.runFor(500);
      const paper = await page.locator(".edgeever-diagram-canvas").boundingBox();
      const viewport = await page.locator(".edgeever-diagram-scroller").boundingBox();
      const start = await renderedNode.boundingBox();
      expect(paper).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(start).not.toBeNull();
      const from = { x: start!.x + start!.width / 2, y: start!.y + start!.height / 2 };
      const to = direction === "left"
        ? { x: viewport!.x + start!.width / 2 + 24, y: from.y }
        : { x: from.x, y: viewport!.y + start!.height / 2 + 24 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      let draggedCenter = from;
      try {
        await page.mouse.move(to.x, to.y);
        // Render the moved node, but do not fire Scroller's 200ms debounce.
        // Checking only after mouseup would miss the disappearing-node bug.
        await page.clock.runFor(32);
        const actual = await renderedNode.boundingBox();
        expect(actual).not.toBeNull();
        const center = { x: actual!.x + actual!.width / 2, y: actual!.y + actual!.height / 2 };
        draggedCenter = center;
        expect(direction === "left" ? center.x < paper!.x : center.y < paper!.y).toBe(true);
        expect(await page.evaluate(({ x, y }) =>
          globalThis.document.elementFromPoint(x, y)?.closest(".x6-node")?.getAttribute("data-cell-id"),
        center)).toBe(node.id);
      } finally {
        await page.mouse.up();
      }
      await page.clock.runFor(500);
      const settled = await renderedNode.boundingBox();
      expect(Math.abs(settled!.x + settled!.width / 2 - draggedCenter.x)).toBeLessThan(1);
      expect(Math.abs(settled!.y + settled!.height / 2 - draggedCenter.y)).toBeLessThan(1);
    } finally {
      await page.request.delete(`/api/v1/memos/${memo.id}`);
      await page.request.delete(`/api/v1/memos/${memo.id}?permanent=1`);
    }
  });
}
