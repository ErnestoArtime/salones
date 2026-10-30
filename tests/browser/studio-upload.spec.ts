import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import { test, expect, navigate } from "./fixtures";
// @ts-ignore shared fixture creates and removes only its own temporary salons
import { fixture, api } from "../helpers/finance-fixture.mjs";

test("IA: conserva el archivo al fallar, permite reintentar y acepta subidas de más de 15 segundos", async ({
  page,
}) => {
  test.setTimeout(90000);
  const admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await admin.connect();
  let f: any;
  let generationRequests = 0;
  try {
    f = await fixture(admin);
    const root = "/tenants/" + f.a.id + "/studio";
    const bytes = fs.readFileSync("tests/fixtures/fictitious-portrait.jpg");
    const reference = await api(
      root + "/assets",
      "POST",
      {
        kind: "reference",
        consent: true,
        data: "data:image/jpeg;base64," + bytes.toString("base64"),
      },
      f.owner.cookie,
    );
    expect(reference.status).toBe(201);
    const style = await api(
      root + "/styles",
      "POST",
      {
        name: "Estilo de prueba de subida",
        description: "Referencia sintética para comprobar la subida.",
        instructions: "Preserve the client identity and change only the hair.",
        category: "cut",
        service_id: f.service,
        reference_asset_id: reference.data.id,
        published: true,
      },
      f.owner.cookie,
    );
    expect(style.status).toBe(201);
    // Only simulate readiness in the browser. Never send a generation request.
    await page.route("**/studio", async (route) => {
      const response = await route.fetch();
      const state = await response.json();
      await route.fulfill({
        response,
        json: { ...state, provider_ready: true },
      });
    });
    await page.route("**/studio/tryons", async (route) => {
      if (route.request().method() === "POST") {
        generationRequests++;
        await route.abort();
      } else await route.continue();
    });
    let uploads = 0;
    await page.route("**/studio/assets", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      uploads++;
      if (uploads === 1 || uploads === 3) {
        await route.fulfill({
          status: 503,
          json: { message: "Subida interrumpida para esta comprobación." },
        });
        return;
      }
      if (uploads === 2)
        await new Promise((resolve) => setTimeout(resolve, 17000));
      const response = await route.fetch();
      await route.fulfill({ response });
    });
    await page.goto("/");
    await page.getByLabel("Correo electrónico").fill(f.owner.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(f.owner.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();
    await navigate(page, "Estudio virtual");
    await expect(page.locator("#studio-generation-hint")).toContainText(
      "Selecciona un estilo",
    );
    await page
      .locator(".style-choice")
      .filter({ hasText: "Estilo de prueba de subida" })
      .click();
    await expect(page.locator("#studio-generation-hint")).toContainText(
      "Sube la foto",
    );
    await page
      .getByLabel(
        "El cliente autoriza capturar y guardar su foto para esta prueba.",
      )
      .check();
    await page.getByLabel(/El cliente autoriza enviar su foto/).check();
    const input = page.getByLabel("Subir foto del dispositivo");
    const filename = "retratro-de-prueba-para-estudio-virtual.jpg";
    await input.setInputFiles({
      name: filename,
      mimeType: "image/jpeg",
      buffer: bytes,
    });
    await expect(page.locator(".studio-editor [role=alert]")).toContainText(
      "No se pudo subir la fotografía",
    );
    expect(
      await input.evaluate((el: HTMLInputElement) => el.files?.[0]?.name),
    ).toBe(filename);
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar subida", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Subiendo foto…", exact: true }),
    ).toBeDisabled();
    await expect(page.locator(".portrait-preview")).toBeVisible({
      timeout: 25000,
    });
    await page
      .locator(".portrait-preview")
      .evaluate((img: HTMLImageElement) => img.decode());
    const firstPortrait = await page
      .locator(".portrait-preview")
      .getAttribute("src");
    expect(
      await input.evaluate((el: HTMLInputElement) => el.files?.[0]?.name),
    ).toBe(filename);
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeEnabled();
    // A failed replacement must not silently generate with the previous photo.
    await input.setInputFiles({
      name: "otra-foto.jpg",
      mimeType: "image/jpeg",
      buffer: bytes,
    });
    await expect(page.locator(".studio-editor [role=alert]")).toBeVisible();
    await expect(page.locator(".portrait-preview")).toHaveAttribute(
      "src",
      firstPortrait!,
    );
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar subida", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".portrait-preview")).not.toHaveAttribute(
      "src",
      firstPortrait!,
    );
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.locator(".portrait-preview").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/screenshots/studio-upload-" + width + ".jpg",
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Retirar fotografía", exact: true })
      .click();
    await expect(page.locator(".portrait-preview")).toHaveCount(0);
    expect(
      await input.evaluate((el: HTMLInputElement) => el.files?.length),
    ).toBe(0);
    expect(generationRequests).toBe(0);
  } finally {
    if (f) await f.cleanup();
    await admin.end();
  }
});
