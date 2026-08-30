import { expect, test } from "@playwright/test";

test("redirects anonymous visitors to login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
});
