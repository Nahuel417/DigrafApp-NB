import { expect, test } from "@playwright/test";

test("loads the Digraf technical shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Digraf" })).toBeVisible();
  await expect(page.getByText("Scaffold operativo")).toBeVisible();
});
