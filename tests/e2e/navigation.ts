import type { Page } from "@playwright/test";

export async function openAppNavigation(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 0) < 1024;

  if (mobile) {
    const trigger = page.getByRole("button", { name: "Abrir navegación" });
    if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  }

  return page.getByRole("navigation", {
    name: mobile ? "Navegación principal móvil" : "Navegación principal",
    exact: true,
  });
}

export async function logoutFromApp(page: Page) {
  await openAppNavigation(page);
  await page.getByRole("button", { name: "Salir" }).click();
}
