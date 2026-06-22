import { test, expect } from "@playwright/test";

test.describe("tauri invoke smoke", () => {
  test("library list and install queue with mocked invoke", async ({ page }) => {
    await page.goto("/smoke.html");
    await expect(page.getByTestId("mod-count")).toHaveText("2 mods installed");
    await expect(page.getByText("Test Mod Alpha")).toBeVisible();
    await page.getByRole("button", { name: "Install test mod" }).click();
    await expect(page.getByTestId("install-status")).toHaveText("Install queued");
  });
});
