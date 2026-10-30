import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import { test, expect, navigate } from "./fixtures";
// @ts-ignore shared isolated data fixture
import { fixture, api } from "../helpers/finance-fixture.mjs";

test("IA: cámara con permisos, foto sin fondo y selección conjunta de cabello y barba", async ({
  page,
}) => {
  test.setTimeout(90000);
  const db = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await db.connect();
  let f: any;
  try {
    f = await fixture(db);
    const root = "/tenants/" + f.a.id + "/studio";
    const bytes = fs.readFileSync("tests/fixtures/fictitious-portrait.jpg");
    const reference = await api(
      root + "/assets",
      "POST",
      {
        kind: "reference",
        data: "data:image/jpeg;base64," + bytes.toString("base64"),
        consent: true,
      },
      f.owner.cookie,
    );
    const styles: any = {};
    for (const scope of ["hair", "beard", "hair_beard"]) {
      const result = await api(
        root + "/styles",
        "POST",
        {
          name: "Referencia " + scope,
          category: "cut",
          target_scope: scope,
          instructions: "A fictitious style reference for a browser test.",
          service_id: f.service,
          reference_asset_id: reference.data.id,
          published: true,
        },
        f.owner.cookie,
      );
      expect(result.status).toBe(201);
      styles[scope] = result.data.id;
    }
    await page.route("**/studio", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({
        response,
        json: { ...data, provider_ready: true },
      });
    });
    let generationBody: any;
    await page.route("**/studio/tryons", async (route) => {
      if (route.request().method() === "POST") {
        generationBody = route.request().postDataJSON();
        await route.fulfill({
          status: 503,
          json: {
            message: "Verificación sin enviar una generación al proveedor.",
          },
        });
      } else await route.continue();
    });
    await page.goto("/");
    await page.getByLabel("Correo electrónico").fill(f.owner.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(f.owner.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();
    await navigate(page, "Estudio virtual");
    const scope = page.getByRole("combobox", {
      name: "¿Qué quieres simular?",
      exact: true,
    });
    await expect(scope).toHaveValue("hair");
    await expect(page.locator(".style-choice")).toHaveCount(2);
    await scope.selectOption("beard");
    await expect(
      page
        .locator(".style-choice")
        .filter({ hasText: "Referencia hair_beard" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".style-choice")
        .filter({ hasText: "Referencia hair" })
        .first(),
    ).toContainText("hair_beard");
    await scope.selectOption("hair_beard");
    await page
      .locator(".style-choice")
      .filter({ has: page.getByText("Referencia hair", { exact: true }) })
      .click();
    await expect(page.locator("#studio-generation-hint")).toContainText(
      "Selecciona también una referencia de barba",
    );
    await page
      .getByRole("combobox", { name: "Referencia para la barba", exact: true })
      .selectOption(styles.beard);
    await page
      .getByLabel(
        "El cliente autoriza capturar y guardar su foto para esta prueba.",
      )
      .check();
    await page
      .getByLabel(/El cliente autoriza enviar su foto preparada/)
      .check();
    // Real video/canvas elements with a simulated device stream, no physical camera.
    await page.evaluate(async (b64) => {
      const image = new Image();
      image.src = "data:image/jpeg;base64," + b64;
      await image.decode();
      const w = window as any;
      w.__allowCamera = false;
      w.__cameraTracks = [];
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          if (!w.__allowCamera)
            throw new DOMException("denied", "NotAllowedError");
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const stream = canvas.captureStream(10);
          requestAnimationFrame(() =>
            canvas.getContext("2d")!.drawImage(image, 0, 0),
          );
          w.__cameraTracks.push(...stream.getTracks());
          return stream;
        },
      });
    }, bytes.toString("base64"));
    await page
      .getByRole("button", { name: "Abrir cámara", exact: true })
      .click();
    await expect(page.locator(".camera-capture [role=alert]")).toContainText(
      "Permite el acceso",
    );
    await page.evaluate(() => {
      (window as any).__allowCamera = true;
    });
    await page
      .getByRole("button", { name: "Reintentar cámara", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Tomar foto", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Tomar foto", exact: true }).click();
    await expect(page.locator(".portrait-preview")).toBeVisible({
      timeout: 25000,
    });
    expect(
      await page.evaluate(() =>
        (window as any).__cameraTracks.every(
          (t: MediaStreamTrack) => t.readyState === "ended",
        ),
      ),
    ).toBeTruthy();
    const corner = await page
      .locator(".portrait-preview")
      .evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return Array.from(ctx.getImageData(2, 2, 1, 1).data);
      });
    expect(corner.slice(0, 3).every((v) => v > 240)).toBeTruthy();
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Generar simulación", exact: true })
      .click();
    await expect.poll(() => generationBody?.target_scope).toBe("hair_beard");
    expect(generationBody.beard_hairstyle_id).toBe(styles.beard);
    // The explicit scope wins even when a reference includes both hair and beard.
    await scope.selectOption("hair");
    await page
      .locator(".style-choice")
      .filter({ hasText: "Referencia hair_beard" })
      .click();
    await expect(scope).toHaveValue("hair");
    await scope.selectOption("hair_beard");
    await page
      .locator(".style-choice")
      .filter({ hasText: "Referencia hair_beard" })
      .click();
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Abrir cámara", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Tomar foto", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Catálogo", exact: true }).click();
    expect(
      await page.evaluate(() =>
        (window as any).__cameraTracks.every(
          (t: MediaStreamTrack) => t.readyState === "ended",
        ),
      ),
    ).toBeTruthy();
    const card = page
      .locator(".style-work")
      .filter({
        has: page.getByRole("heading", {
          name: "Referencia hair",
          exact: true,
        }),
      });
    await card.getByLabel("Aplicar referencia a").selectOption("hair_beard");
    await expect(
      page.getByRole("status").filter({ hasText: "Referencia actualizada" }),
    ).toBeVisible();
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: ".local/screenshots/studio-scopes-" + width + ".png",
        fullPage: true,
      });
    }
    await page.getByRole("button", {name:"Probar estilo",exact:true}).click();
    let uploadsAfterPreparationFailure=0;
    const countUploads=(request:any)=>{if(request.method()==="POST"&&request.url().endsWith("/studio/assets"))uploadsAfterPreparationFailure++;};
    page.on("request",countUploads);
    await page.getByLabel("Subir foto del dispositivo").setInputFiles({name:"invalida.jpg",mimeType:"image/jpeg",buffer:Buffer.from("not-an-image")});
    await expect(page.locator(".studio-editor [role=alert]")).toContainText("no se ha enviado el original");
    expect(uploadsAfterPreparationFailure).toBe(0);
    page.off("request",countUploads);
    const state = await api(root, "GET", undefined, f.owner.cookie);
    expect(state.data.usage).toBe(0);
  } finally {
    if (f) await f.cleanup();
    await db.end();
  }
});
