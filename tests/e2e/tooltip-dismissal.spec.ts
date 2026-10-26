import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("edgeever.locale.preference", "en-US"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
});

test("dismisses a tooltip when the pointer moves from its trigger onto the hint", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Collapse notebook pane", exact: true });
  const hint = page.locator("[data-radix-popper-content-wrapper]").filter({
    has: page.getByRole("tooltip", { name: /Collapse notebook pane/ }),
  });
  await trigger.hover();
  await expect(hint).toBeVisible();
  const box = await hint.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 8 });
  await expect(hint).toBeHidden({ timeout: 1500 });
});

test("keeps keyboard hints available and dismisses them on Escape or blur", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Collapse notebook pane", exact: true });
  const hint = page.getByRole("tooltip", { name: /Collapse notebook pane/ });
  await trigger.focus();
  await expect(hint).toBeAttached();
  await expect(trigger).toHaveAttribute("aria-describedby", await hint.getAttribute("id"));
  await page.keyboard.press("Escape");
  await expect(hint).not.toBeAttached();
  await page.keyboard.press("Tab");
  await trigger.focus();
  await expect(hint).toBeAttached();
  await page.keyboard.press("Tab");
  await expect(hint).not.toBeAttached();
});
