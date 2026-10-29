import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("deleting the last gallery image removes its node view and Markdown (#707)", async ({ page }) => {
  const fixturePath = fileURLToPath(new URL("./fixtures/image-gallery-deletion.html", import.meta.url));
  await page.goto(`/@fs${fixturePath}`);
  const images = page.getByRole("button", { name: "Delete image", exact: true });
  const gallery = page.locator("[data-edgeever-image-gallery]");
  await expect(images).toHaveCount(2);
  await images.first().click();
  await expect(images).toHaveCount(1);
  // Separate deliberate deletion actions into individual history events.
  await page.waitForTimeout(550);
  await images.click();
  await expect(gallery).toHaveCount(0);
  await expect(page.locator("#markdown")).toHaveText("");
  await expect(page.locator("#document")).toHaveText('{"type":"doc","content":[{"type":"paragraph"}]}');
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(images).toHaveCount(1);
  await expect(gallery).toHaveAttribute("data-image-gallery-layout", "2");
  await expect(page.locator("#markdown")).toContainText("![](/two.jpg)");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(gallery).toHaveCount(0);
  await expect(page.locator("#markdown")).toHaveText("");
  await page.locator(".tiptap").fill("still editable");
  await expect(page.locator("#markdown")).toHaveText("still editable");
});
