import "dotenv/config";
import pg from "pg";
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const demo = JSON.parse(readFileSync(".local/demo.json", "utf8"));
mkdirSync(".local/screenshots", { recursive: true });
async function login(page: any) {
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(demo.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(demo.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cada cita, a su tiempo." }),
  ).toBeVisible();
}
async function noOverflow(page: any) {
  expect(
    await page
      .locator(".wordmark")
      .first()
      .evaluate((e: any) => getComputedStyle(e).fontFamily),
  ).toContain("Fraunces");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const wrapped = await page
    .locator("button:visible,.nav-link:visible")
    .evaluateAll((els: any[]) =>
      els
        .filter((e) => e.scrollWidth > e.clientWidth + 2)
        .map((e) => e.textContent),
    );
  expect(wrapped).toEqual([]);
}
test("gestión: agenda, navegación, edición persistente y móvil", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(page);
  await page.screenshot({
    path: ".local/screenshots/agenda-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Servicios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Corte y acabado", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const serviceName = "Servicio QA " + Date.now();
  await page.getByLabel("Nombre", { exact: true }).fill(serviceName);
  await page.getByLabel("Precio", { exact: true }).fill("12.50");
  await page.getByLabel("Categoría del servicio").selectOption("massage");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Cambios guardados");
  await page.reload();
  await page.getByRole("button", { name: "Servicios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: serviceName, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Elena · demo" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Agenda", exact: true })
    .first()
    .click();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({
      path: ".local/screenshots/agenda-" + width + ".png",
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("portal de reservas: servicio, horario, confirmación y cancelación", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/booking/?salon=estudio-demo");
  await expect(
    page.getByRole("heading", { name: "¿Qué te apetece hoy?" }),
  ).toBeVisible();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".local/screenshots/booking-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Corte y acabado/ }).click();
  await expect(page.locator(".reservation-bar")).toHaveCSS("position", "sticky");
  await page.getByRole("button", { name: "Elegir horario" }).click();
  const date = new Date();
  date.setDate(date.getDate() + 3);
  const day = date.toISOString().slice(0, 10);
  await page.getByLabel("Fecha", { exact: true }).fill(day);
  await expect(page.locator(".slot").first()).toBeVisible();
  await page.locator(".slot").first().click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Tu nombre").fill("Cliente QA");
  await page.getByLabel("Teléfono", { exact: true }).fill("600000001");
  await page
    .getByLabel("Correo electrónico · opcional")
    .fill("qa@example.test");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar mi cita" }).click();
  await expect(
    page.getByRole("heading", { name: /Nos vemos pronto/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/confirmation.png",
    fullPage: true,
  });
  const cancel = await page
    .getByRole("link", { name: "Gestionar cancelación" })
    .getAttribute("href");
  await page.goto(cancel!);
  await page.getByRole("button", { name: "Cancelar mi cita" }).click();
  await expect(
    page.getByRole("heading", { name: "Cita cancelada." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("superadministración: plan y acceso protegidos", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByLabel("Correo electrónico").fill(demo.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(demo.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Detrás de cada salón." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Estudio demo · datos de ejemplo" }),
  ).toBeVisible();
  await noOverflow(page);
});

test.afterAll(async () => {
  const db = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "DELETE FROM salon.appointments WHERE tenant_id=$1 AND customer_id IN (SELECT id FROM salon.customers WHERE tenant_id=$1 AND name='Cliente QA' AND email='qa@example.test')",
      [demo.tenant],
    );
    await db.query(
      "DELETE FROM salon.customers WHERE tenant_id=$1 AND name='Cliente QA' AND email='qa@example.test'",
      [demo.tenant],
    );
    await db.query(
      "DELETE FROM salon.services WHERE tenant_id=$1 AND name LIKE 'Servicio QA %'",
      [demo.tenant],
    );
    await db.query("COMMIT");
  } finally {
    await db.end();
  }
});

test("estudio virtual: catálogo, estado sin proveedor y móvil", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Estudio virtual", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preparado para conectar la IA." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generar simulación" }),
  ).toBeDisabled();
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    await page.screenshot({
      path: ".local/screenshots/studio-" + width + ".png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Catálogo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Añadir un trabajo." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ideas que habéis probado." }),
  ).toBeVisible();
});


test("catálogo público: categorías reales, búsqueda y fotografías locales", async ({ page }) => {
  await page.goto("/booking/?salon=estudio-demo");
  await expect(page.getByRole("heading", { name: "¿Por dónde empezamos?" })).toBeVisible();
  await page.getByRole("link", { name: "Encuentra tu momento" }).click();
  await expect(page).toHaveURL(/salon=estudio-demo#catalogo$/);
  await expect(page.locator(".reservation-bar")).toHaveCSS("position", "static");
  const response = await page.request.get("/api/public/salons/estudio-demo");
  expect(response.ok()).toBeTruthy();
  const catalog = await response.json();
  for (const [category, title] of [["hair", "Peluquería"], ["nails", "Manicura"], ["barber", "Barbería"], ["spa", "Spa y facial"], ["massage", "Masajes"]]) {
    await page.getByRole("button", { name: "Explorar " + title, exact: true }).click();
    const services = catalog.services.filter((s: any) => s.category === category);
    await expect(page.locator(".service-card")).toHaveCount(services.length);
    for (const service of services) await expect(page.locator(".service-card h3").filter({ hasText: service.name })).toBeVisible();
  }
  await page.getByRole("button", { name: /^Todos/ }).click();
  await page.getByLabel("Buscar un servicio").fill("MANICURA");
  await expect(page.locator(".service-card")).toHaveCount(1);
  await expect(page.locator(".service-card h3")).toHaveText("Manicura esencial");
  await page.getByLabel("Buscar un servicio").fill("servicio inexistente xyz");
  await expect(page.getByRole("heading", { name: "No encontramos ese servicio." })).toBeVisible();
  await page.getByRole("button", { name: "Ver todos los servicios" }).click();
  await expect(page.locator(".service-card")).toHaveCount(catalog.services.length);
  for (const image of await page.locator(".hero-photo img,.experience img,.service-card img,.visit-section img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(await image.getAttribute("src")).toMatch(/^images\/.*\.webp$/);
  }
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await noOverflow(page);
    await page.screenshot({ path: ".local/screenshots/public-catalog-" + width + ".png", fullPage: true });
  }
});
