import { expect, test } from "@playwright/test";

for (const path of ["/catalogs", "/orders/new"]) {
  test(`rechaza ${path} sin sesión`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
  });
}
