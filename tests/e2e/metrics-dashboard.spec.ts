import { expect, test } from "@playwright/test";

test("redirects unauthenticated visits to metrics to login", async ({ page }) => {
  await page.goto("/metrics");

  await expect(page).toHaveURL(/\/login$/);
});
