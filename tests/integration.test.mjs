import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DateTime } from "luxon";
const base = process.env.TEST_API_URL ?? "http://127.0.0.1:8130/api";
const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const createdUsers = [],
  tenants = [];
async function request(path, method = "GET", body, cookie = "") {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; "),
  };
}
async function user(label) {
  const email = label + "-" + randomUUID().slice(0, 8) + "@example.test",
    password = randomUUID() + "Aa1!";
  const res = await fetch(process.env.AUTH_URL + "/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  createdUsers.push(data.id);
  const login = await request("/auth/login", "POST", { email, password });
  assert.equal(login.status, 201, JSON.stringify(login.data));
  assert.ok(login.cookie.includes("lavia_access="));
  return { id: data.id, email, password, cookie: login.cookie };
}
async function salon(owner, label) {
  const slug = "test-" + randomUUID().slice(0, 12);
  const result = await request(
    "/tenants",
    "POST",
    {
      name: label,
      slug,
      branch_name: "Principal",
      timezone: "Europe/Madrid",
      address: "Datos de prueba",
    },
    owner.cookie,
  );
  assert.equal(result.status, 201, JSON.stringify(result.data));
  tenants.push(result.data.id);
  const workspace = await request(
    "/tenants/" + result.data.id + "/workspace",
    "GET",
    undefined,
    owner.cookie,
  );
  assert.equal(workspace.status, 200, JSON.stringify(workspace.data));
  return { id: result.data.id, slug, branch: workspace.data.branches[0].id };
}
async function cleanup() {
  for (const tid of tenants) {
    await admin.query("BEGIN");
    try {
      for (const table of [
        "audit_log",
        "appointments",
        "absences",
        "schedules",
        "employee_services",
        "employees",
        "customers",
        "services",
        "service_categories",
        "salon_pages",
        "page_assets",
        "branches",
        "memberships",
      ])
        await admin.query(
          "DELETE FROM salon." + table + " WHERE tenant_id=$1",
          [tid],
        );
      await admin.query("DELETE FROM salon.tenants WHERE id=$1", [tid]);
      await admin.query("COMMIT");
    } catch (e) {
      await admin.query("ROLLBACK");
      throw e;
    }
  }
  for (const uid of createdUsers)
    await admin.query("DELETE FROM auth.users WHERE id=$1", [uid]);
  await Promise.all([admin.end(), runtime.end()]);
}
test("SaaS: aislamiento, roles y reservas transaccionales", async (t) => {
  try {
    const owner = await user("owner"),
      other = await user("other"),
      staff = await user("staff"),
      desk = await user("desk");
    const a = await salon(owner, "Prueba A"),
      b = await salon(other, "Prueba B");
    let service, employee, second;
    await t.test("sesión y aislamiento por tenant", async () => {
      assert.equal((await request("/tenants")).status, 401);
      assert.equal(
        (
          await request(
            "/tenants/" + b.id + "/workspace",
            "GET",
            undefined,
            owner.cookie,
          )
        ).status,
        404,
      );
      const client = await runtime.connect();
      try {
        await client.query("BEGIN");
        assert.equal(
          (await client.query("SELECT * FROM salon.customers")).rowCount,
          0,
        );
        await client.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",
          [owner.id, b.id],
        );
        assert.equal(
          (await client.query("SELECT * FROM salon.branches")).rowCount,
          0,
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
    await t.test("catálogo, equipo, horarios y claves compuestas", async () => {
      const s = await request(
        "/tenants/" + a.id + "/services",
        "POST",
        {
          name: "Corte de prueba",
          category: "hair",
          duration_minutes: 45,
          buffer_minutes: 15,
          price_cents: 3500,
        },
        owner.cookie,
      );
      assert.equal(s.status, 201);
      service = s.data.id;
      const publicCatalog = await request("/public/salons/" + a.slug, "GET");
      assert.equal(publicCatalog.status, 200);
      assert.equal(publicCatalog.data.services.find(x => x.id === service).category, "hair");
      const invalidCategory = await request("/tenants/" + a.id + "/services", "POST", {
        name: "Categoría inválida", category: "inventada", duration_minutes: 30, price_cents: 100,
      }, owner.cookie);
      assert.equal(invalidCategory.status, 400);

      const e = await request(
        "/tenants/" + a.id + "/employees",
        "POST",
        { name: "Profesional A", branch_id: a.branch, service_ids: [service] },
        owner.cookie,
      );
      assert.equal(e.status, 201, JSON.stringify(e.data));
      employee = e.data.id;
      const e2 = await request(
        "/tenants/" + a.id + "/employees",
        "POST",
        { name: "Profesional B", branch_id: a.branch, service_ids: [service] },
        owner.cookie,
      );
      assert.equal(e2.status, 201);
      second = e2.data.id;
      const periods = Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        start_time: "09:00",
        end_time: "19:00",
      }));
      for (const eid of [employee, second])
        assert.equal(
          (
            await request(
              "/tenants/" + a.id + "/schedules",
              "PUT",
              { employee_id: eid, periods },
              owner.cookie,
            )
          ).status,
          200,
        );
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/schedules",
            "PUT",
            {
              employee_id: employee,
              periods: [
                { weekday: 1, start_time: "09:00", end_time: "12:00" },
                { weekday: 1, start_time: "11:00", end_time: "14:00" },
              ],
            },
            owner.cookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/tenants/" + b.id + "/employees",
            "POST",
            {
              name: "Cruce no permitido",
              branch_id: b.branch,
              service_ids: [service],
            },
            other.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/branches",
            "POST",
            {
              name: "Otra",
              branch_name: "Otra",
              timezone: "Europe/Madrid",
              address: "",
            },
            owner.cookie,
          )
        ).status,
        403,
      );
    });
    const date = DateTime.now()
      .setZone("Europe/Madrid")
      .plus({ days: 2 })
      .toISODate();
    const query = new URLSearchParams({
      branch_id: a.branch,
      employee_id: employee,
      service_id: service,
      date,
    });
    let slot;
    await t.test("disponibilidad pública sin datos privados", async () => {
      const catalog = await request("/public/salons/" + a.slug);
      assert.equal(catalog.status, 200);
      assert.equal(catalog.data.customers, undefined);
      assert.equal(catalog.data.employees[0].user_id, undefined);
      const available = await request(
        "/public/salons/" + a.slug + "/slots?" + query,
      );
      assert.equal(available.status, 200);
      assert.ok(available.data.length);
      slot = available.data[0];
    });
    const body = {
      branch_id: a.branch,
      employee_id: employee,
      service_id: service,
      starts_at: slot,
      customer: {
        name: "Cliente de prueba",
        phone: "600000000",
        email: "test@example.test",
      },
      consent: true,
      request_key: randomUUID(),
    };
    let booked;
    await t.test(
      "dos solicitudes simultáneas producen una sola reserva",
      async () => {
        const results = await Promise.all([
          request("/public/salons/" + a.slug + "/appointments", "POST", body),
          request("/public/salons/" + a.slug + "/appointments", "POST", {
            ...body,
            request_key: randomUUID(),
          }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        booked = results.find((r) => r.status === 201).data;
        // Keep the winning payload for idempotency assertions.
        const stored = await admin.query(
          "SELECT request_key FROM salon.appointments WHERE id=$1",
          [booked.id],
        );
        body.request_key = stored.rows[0].request_key;
        const customer = await admin.query(
          "SELECT c.booking_consent_at,c.consent_version FROM salon.customers c JOIN salon.appointments a ON a.customer_id=c.id WHERE a.id=$1",
          [booked.id],
        );
        assert.ok(customer.rows[0].booking_consent_at);
        assert.equal(customer.rows[0].consent_version, "booking-v1");
      },
    );
    await t.test("idempotencia y datos inyectados", async () => {
      const retry = await request(
        "/public/salons/" + a.slug + "/appointments",
        "POST",
        body,
      );
      assert.equal(retry.status, 201);
      assert.equal(retry.data.id, booked.id);
      assert.equal(retry.data.cancellation_token, booked.cancellation_token);
      assert.equal(
        (
          await request("/public/salons/" + a.slug + "/appointments", "POST", {
            ...body,
            customer: { ...body.customer, name: "Otro" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/public/salons/" + a.slug + "/appointments", "POST", {
            ...body,
            customer_id: randomUUID(),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/public/salons/" + a.slug + "/appointments", "POST", {
            ...body,
            notes: "injected",
          })
        ).status,
        400,
      );
    });
    await t.test("los bloqueos respetan las citas y los buffers", async () => {
      const start = DateTime.fromISO(slot).plus({ minutes: 50 }),
        end = start.plus({ minutes: 5 });
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/absences",
            "POST",
            {
              employee_id: employee,
              starts_at: start.toISO(),
              ends_at: end.toISO(),
              reason: "No permitido",
            },
            owner.cookie,
          )
        ).status,
        409,
      );
      const available = await request(
        "/public/salons/" + a.slug + "/slots?" + query,
      );
      assert.ok(
        !available.data.some(
          (s) => Date.parse(s) < Date.parse(slot) + 60 * 60000,
        ),
      );
    });
    await t.test("roles y revocación inmediata", async () => {
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/members",
            "POST",
            { email: staff.email, role: "professional", employee_id: employee },
            owner.cookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/members",
            "POST",
            { email: desk.email, role: "receptionist" },
            owner.cookie,
          )
        ).status,
        201,
      );
      const w = await request(
        "/tenants/" + a.id + "/workspace?date=" + date,
        "GET",
        undefined,
        staff.cookie,
      );
      assert.equal(w.status, 200);
      assert.equal(w.data.customers.length, 0);
      assert.ok(w.data.appointments.every((x) => x.employee_id === employee));
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/services",
            "POST",
            { name: "No", duration_minutes: 30, price_cents: 1 },
            desk.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/platform/tenants", "GET", undefined, owner.cookie))
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/members/" + staff.id,
            "DELETE",
            undefined,
            owner.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/workspace",
            "GET",
            undefined,
            staff.cookie,
          )
        ).status,
        404,
      );
    });
    await t.test(
      "cancelación por token incluso con reservas desactivadas",
      async () => {
        assert.equal(
          (
            await request("/public/salons/" + a.slug + "/cancel", "POST", {
              id: booked.id,
              token: "x".repeat(43),
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "/tenants/" + a.id + "/settings",
              "PUT",
              { name: "Prueba A", booking_enabled: false },
              owner.cookie,
            )
          ).status,
          200,
        );
        assert.equal((await request("/public/salons/" + a.slug)).status, 404);
        const cancel = await request(
          "/public/salons/" + a.slug + "/cancel",
          "POST",
          { id: booked.id, token: booked.cancellation_token },
        );
        assert.equal(cancel.status, 201, JSON.stringify(cancel.data));
        assert.equal(
          (
            await request("/public/salons/" + a.slug + "/cancel", "POST", {
              id: booked.id,
              token: booked.cancellation_token,
            })
          ).status,
          201,
        );
        await request(
          "/tenants/" + a.id + "/settings",
          "PUT",
          { name: "Prueba A", booking_enabled: true },
          owner.cookie,
        );
        assert.ok(
          (
            await request("/public/salons/" + a.slug + "/slots?" + query)
          ).data.includes(slot),
        );
      },
    );
    await t.test(
      "cambiar una cita mantiene integridad e idempotencia",
      async () => {
        const payload = {
          ...body,
          request_key: randomUUID(),
          customer: { ...body.customer, notes: "" },
        };
        delete payload.consent;
        const original = await request(
          "/tenants/" + a.id + "/appointments",
          "POST",
          payload,
          owner.cookie,
        );
        assert.equal(original.status, 201);
        const next = {
          ...payload,
          starts_at: DateTime.fromISO(slot).plus({ hours: 2 }).toUTC().toISO(),
          request_key: randomUUID(),
        };
        const moved = await request(
          "/tenants/" +
            a.id +
            "/appointments/" +
            original.data.id +
            "/reschedule",
          "PUT",
          next,
          owner.cookie,
        );
        assert.equal(moved.status, 200, JSON.stringify(moved.data));
        const retry = await request(
          "/tenants/" +
            a.id +
            "/appointments/" +
            original.data.id +
            "/reschedule",
          "PUT",
          next,
          owner.cookie,
        );
        assert.equal(retry.status, 200);
        assert.equal(retry.data.id, moved.data.id);
        const status = await admin.query(
          "SELECT status FROM salon.appointments WHERE id=$1",
          [original.data.id],
        );
        assert.equal(status.rows[0].status, "cancelled");
      },
    );
    await t.test("límite del plan comprobado en el servidor", async () => {
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/employees",
            "POST",
            { name: "Tercero", branch_id: a.branch, service_ids: [service] },
            owner.cookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/tenants/" + a.id + "/employees",
            "POST",
            { name: "Cuarto", branch_id: a.branch, service_ids: [service] },
            owner.cookie,
          )
        ).status,
        403,
      );
    });
    await t.test("origen de escritura y cierre de sesión", async () => {
      const blocked = await fetch(base + "/tenants/" + a.id + "/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: owner.cookie,
          Origin: "https://untrusted.example",
        },
        body: JSON.stringify({ name: "Ataque", booking_enabled: true }),
      });
      assert.equal(blocked.status, 403);
      assert.equal(
        (await request("/auth/logout", "POST", {}, owner.cookie)).status,
        201,
      );
    });
  } finally {
    await cleanup();
  }
});
