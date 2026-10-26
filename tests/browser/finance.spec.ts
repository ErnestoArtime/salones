import "dotenv/config";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { test, expect, navigate } from "./fixtures";
// @ts-ignore shared integration fixture (creates and removes its own test salons)
import { fixture, api } from "../helpers/finance-fixture.mjs";
test("caja: cobro, devolución, comisión, cierre y adaptación móvil", async ({
  page,
}) => {
  test.setTimeout(90000);
  const admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await admin.connect();
  let f: any;
  try {
    f = await fixture(admin);
    await f.appointment(10000);
    await page.goto("/");
    await page.getByLabel("Correo electrónico").fill(f.owner.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(f.owner.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();
    await navigate(page, "Caja");
    await expect(
      page.getByRole("heading", { name: "Abrir caja", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Comisiones", exact: true }).click();
    await page.getByLabel("Porcentaje de Profesional caja QA").fill("30");
    await page
      .getByRole("button", { name: "Guardar porcentaje", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Porcentaje actualizado",
    );
    await page
      .getByRole("button", { name: "Movimientos", exact: true })
      .click();
    await page.getByLabel("Efectivo inicial", { exact: true }).fill("50");
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Caja abierta");
    await page
      .getByRole("combobox", { name: "Cita completada", exact: true })
      .selectOption({ index: 1 });
    await page
      .getByRole("button", { name: "Registrar movimiento", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Movimiento registrado",
    );
    await expect(page.locator(".finance-summary")).toContainText("100,00");
    await page.getByRole("button", { name: "Devolver", exact: true }).click();
    await page.getByLabel("Importe", { exact: true }).fill("20");
    await page
      .getByLabel("Motivo o referencia", { exact: true })
      .fill("Devolución de prueba");
    await page
      .getByRole("button", { name: "Registrar movimiento", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Movimiento registrado",
    );
    await page.getByRole("button", { name: "Comisiones", exact: true }).click();
    await expect(page.locator(".finance-commission")).toContainText("24,00");
    await page
      .getByRole("button", { name: "Registrar pago", exact: true })
      .click();
    await page
      .getByLabel("Motivo o referencia", { exact: true })
      .fill("Comisión de prueba");
    await page
      .getByRole("button", { name: "Registrar movimiento", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Movimiento registrado",
    );
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const tab of ["Movimientos", "Comisiones", "Cierres"]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBeTruthy();
        const overflow = await page
          .locator(
            ".button:visible,.text-button:visible,.segmented button:visible",
          )
          .evaluateAll((es) =>
            es
              .filter((e) => e.scrollWidth > e.clientWidth + 2)
              .map((e) => e.textContent),
          );
        expect(overflow).toEqual([]);
      }
      await page
        .getByRole("button", { name: "Movimientos", exact: true })
        .click();
      await page.screenshot({
        path: ".local/screenshots/finance-" + width + ".png",
        fullPage: true,
      });
    }
    await page.getByLabel("Efectivo contado", { exact: true }).fill("130");
    await page
      .getByRole("button", { name: "Cerrar caja", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Caja cerrada");
    await expect(
      page.getByRole("heading", { name: "Recuento guardado", exact: true }),
    ).toBeVisible();
    await page.reload();
    await navigate(page, "Caja");
    await expect(
      page.getByRole("heading", { name: "Recuento guardado", exact: true }),
    ).toBeVisible();
  } finally {
    if (f) await f.cleanup();
    await admin.end();
  }
});
test("IA: controles del salón y estado de proveedor coherentes", async ({
  page,
}) => {
  const admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await admin.connect();
  let f: any;
  try {
    f = await fixture(admin);
    await page.goto("/");
    await page.getByLabel("Correo electrónico").fill(f.owner.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(f.owner.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();
    await navigate(page, "Estudio virtual");
    await page.getByText("Consumo y controles de IA", { exact: true }).click();
    await page
      .getByLabel("Permitir nuevas generaciones", { exact: true })
      .uncheck();
    await page
      .getByLabel("Límite mensual de solicitudes", { exact: true })
      .fill("3");
    await page
      .getByRole("button", { name: "Guardar controles", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Controles de generación" }),
    ).toBeVisible();
    await expect(
      page.getByText("La generación está pausada por la gerencia del salón.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generar simulación", exact: true }),
    ).toBeDisabled();
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
    const state = await api(
      "/tenants/" + f.a.id + "/studio",
      "GET",
      undefined,
      f.owner.cookie,
    );
    expect(state.data.limit).toBe(3);
    expect(state.data.generation_enabled).toBe(false);
    expect(JSON.stringify(state.data)).not.toContain("REPLICATE_API_TOKEN");
  } finally {
    if (f) await f.cleanup();
    await admin.end();
  }
});

test("IA: comparador y revisión de un resultado sintético antes de preparar cita", async ({
  page,
}) => {
  test.setTimeout(60000);
  const admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await admin.connect();
  let f: any;
  try {
    f = await fixture(admin);
    const root = "/tenants/" + f.a.id + "/studio";
    const bytes = await sharp({
      create: { width: 300, height: 400, channels: 3, background: "#9f8a78" },
    })
      .png()
      .toBuffer();
    const data = "data:image/png;base64," + bytes.toString("base64");
    const reference = (
      await api(
        root + "/assets",
        "POST",
        { kind: "reference", data, consent: true },
        f.owner.cookie,
      )
    ).data.id;
    const portrait = (
      await api(
        root + "/assets",
        "POST",
        { kind: "portrait", data, consent: true },
        f.owner.cookie,
      )
    ).data.id;
    const styleResponse = await api(
      root + "/styles",
      "POST",
      {
        name: "Resultado sintético QA",
        instructions:
          "Referencia sintética para verificar el recorrido, sin personas reales.",
        category: "cut",
        service_id: f.service,
        employee_id: f.employee,
        reference_asset_id: reference,
        published: true,
      },
      f.owner.cookie,
    );
    expect(styleResponse.status).toBe(201);
    const style = styleResponse.data.id;
    const source = (
      await admin.query(
        "SELECT storage_key,byte_size FROM salon.studio_assets WHERE id=$1",
        [portrait],
      )
    ).rows[0];
    const result = randomUUID(),
      key = f.a.id + "/" + result + ".jpg";
    const script =
      "const {StudioStorage}=require('./dist/api/apps/api/src/modules/studio/studio.storage.js');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{const p=JSON.parse(input);const storage=new StudioStorage();await storage.put(p.key,await storage.get(p.source));});";
    execFileSync(
      "docker",
      ["compose", "exec", "-T", "api", "node", "-e", script],
      {
        input: JSON.stringify({ key, source: source.storage_key }),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    await admin.query(
      "INSERT INTO salon.studio_assets(id,tenant_id,uploaded_by,kind,storage_key,byte_size,expires_at) VALUES($1,$2,$3,'result',$4,$5,now()+interval '72 hours')",
      [result, f.a.id, f.owner.id, key, source.byte_size],
    );
    await admin.query(
      "INSERT INTO salon.virtual_tryons(tenant_id,created_by,hairstyle_id,portrait_asset_id,result_asset_id,customer_id,request_key,request_hash,provider,model,external_consent_at,status,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic-browser-qa','test-only','test-only',now(),'succeeded',now())",
      [f.a.id, f.owner.id, style, portrait, result, f.customer, randomUUID()],
    );
    await page.goto("/");
    await page.getByLabel("Correo electrónico").fill(f.owner.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(f.owner.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();
    await navigate(page, "Estudio virtual");
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page.getByRole("button", { name: "Ver prueba", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Preparar cita", exact: true }),
    ).toHaveCount(0);
    for (const img of await page.locator(".before-after img").all())
      await expect
        .poll(() =>
          img.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
    const slider = page.getByRole("slider", {
      name: "Comparar antes y después",
    });
    await slider.focus();
    await slider.press("ArrowRight");
    await expect(slider).toHaveValue("51");
    await page
      .getByLabel("Notas de revisión", { exact: true })
      .fill("Resultado sintético: necesita revisión.");
    await page
      .getByRole("button", { name: "Marcar para mejorar", exact: true })
      .click();
    await expect(page.locator(".studio-assessment")).toContainText(
      "Necesita mejorar",
    );
    await page
      .getByRole("button", { name: "Aprobar resultado", exact: true })
      .click();
    await expect(page.locator(".studio-assessment")).toContainText("Aprobado");
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
    await page.screenshot({
      path: ".local/screenshots/studio-reviewed-result.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Preparar cita", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  } finally {
    if (f) await f.cleanup();
    await admin.end();
  }
});
