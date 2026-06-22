import { test, expect } from "@playwright/test";

test.describe("controller focus navigation smoke", () => {
  test("focusFirst lands on first focusable control", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#btn-a")).toBeFocused();
  });

  test("ArrowDown moves focus through focusable elements", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#btn-b")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#btn-c")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#btn-a")).toBeFocused();
  });

  test("ArrowUp moves focus backward", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-b").focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#btn-a")).toBeFocused();
  });

  test("getFocusableElements returns visible controls only", async ({ page }) => {
    await page.goto("/");
    const count = await page.evaluate(() => {
      const hidden = document.createElement("button");
      hidden.style.display = "none";
      hidden.textContent = "Hidden";
      document.body.appendChild(hidden);
      const api = (window as Window & { __focusTest?: { getFocusableElements: (root: HTMLElement) => unknown[] } })
        .__focusTest;
      return api!.getFocusableElements(document.getElementById("fixture")!).length;
    });
    expect(count).toBe(3);
  });
});
