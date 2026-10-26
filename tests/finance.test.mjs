import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DateTime } from "luxon";
import { api, fixture } from "./helpers/finance-fixture.mjs";
const admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  }),
  runtime = new pg.Client({ connectionString: process.env.DATABASE_URL });
test("Caja: aislamiento, cobros, devoluciones, comisiones y cierres", async (t) => {
  await admin.connect();
  await runtime.connect();
  let f;
  try {
    f = await fixture(admin);
    const root = "/tenants/" + f.a.id + "/finance";
    const today = DateTime.now().setZone("Europe/Madrid").toISODate(),
      query =
        "?" +
        new URLSearchParams({
          branch_id: f.a.branch,
          currency: "EUR",
          date: today,
        });
    const call = (path = "", method = "GET", body, cookie = f.owner.cookie) =>
      api(root + path, method, body, cookie);
    const make = (kind, amount_cents, extra = {}) => ({
      branch_id: f.a.branch,
      currency: "EUR",
      kind,
      amount_cents,
      method: "cash",
      request_key: randomUUID(),
      ...extra,
    });
    let day, appointment, cash, card, second;
    await t.test(
      "roles, sede, moneda y aislamiento en PostgreSQL",
      async () => {
        assert.equal((await call(query, "GET", undefined, "")).status, 401);
        assert.equal(
          (await call(query, "GET", undefined, f.other.cookie)).status,
          404,
        );
        assert.equal(
          (await call(query, "GET", undefined, f.professional.cookie)).status,
          403,
        );
        assert.equal(
          (await call(query, "GET", undefined, f.desk.cookie)).status,
          200,
        );
        assert.equal(
          (
            await call(
              "?" +
                new URLSearchParams({
                  branch_id: f.b.branch,
                  currency: "EUR",
                  date: today,
                }),
            )
          ).status,
          404,
        );
        await runtime.query("BEGIN");
        assert.equal(
          (await runtime.query("SELECT * FROM salon.money_entries")).rowCount,
          0,
        );
        await runtime.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",
          [f.owner.id, f.b.id],
        );
        assert.equal(
          (await runtime.query("SELECT * FROM salon.cash_days")).rowCount,
          0,
        );
        await runtime.query("ROLLBACK");
      },
    );
    await t.test("apertura única y porcentaje por profesional", async () => {
      const body = {
        branch_id: f.a.branch,
        currency: "EUR",
        opening_cents: 10000,
      };
      const r = await call("/open", "POST", body);
      assert.equal(r.status, 201, JSON.stringify(r.data));
      day = r.data.id;
      assert.equal((await call("/open", "POST", body)).data.id, day);
      assert.equal(
        (await call("/open", "POST", { ...body, opening_cents: 10 })).status,
        409,
      );
      assert.equal(
        (
          await call(
            "/commissions/" + f.employee,
            "PUT",
            { rate_bps: 3000 },
            f.desk.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await call("/commissions/" + f.employee, "PUT", { rate_bps: 3000 }))
          .status,
        200,
      );
      appointment = await f.appointment();
    });
    await t.test(
      "cobros concurrentes e idempotencia sin superar el saldo",
      async () => {
        const body1 = make("payment", 6000, { appointment_id: appointment }),
          body2 = make("payment", 6000, { appointment_id: appointment });
        const results = await Promise.all([
          call("/entries", "POST", body1, f.desk.cookie),
          call("/entries", "POST", body2, f.desk.cookie),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const i = results.findIndex((r) => r.status === 201);
        cash = results[i].data;
        const body = i ? body2 : body1;
        assert.equal(cash.commission_cents, 1800);
        assert.equal((await call("/entries", "POST", body)).data.id, cash.id);
        assert.equal(
          (await call("/entries", "POST", { ...body, amount_cents: 5000 }))
            .status,
          409,
        );
        card = (
          await call(
            "/entries",
            "POST",
            make("payment", 4000, {
              appointment_id: appointment,
              method: "card",
            }),
          )
        ).data;
        assert.equal(card.commission_cents, 1200);
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("payment", 1, { appointment_id: appointment }),
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "los porcentajes nuevos no reescriben comisiones históricas",
      async () => {
        assert.equal(
          (await call("/commissions/" + f.employee, "PUT", { rate_bps: 5000 }))
            .status,
          200,
        );
        second = await f.appointment(5000);
        const r = await call(
          "/entries",
          "POST",
          make("payment", 5000, { appointment_id: second, method: "transfer" }),
        );
        assert.equal(r.status, 201);
        assert.equal(r.data.commission_cents, 2500);
        const refunded = await call(
          "/entries",
          "POST",
          make("refund", 2000, {
            reverses_entry_id: cash.id,
            note: "Devolución parcial QA",
          }),
        );
        assert.equal(refunded.status, 201, JSON.stringify(refunded.data));
        assert.equal(refunded.data.commission_cents, -600);
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("refund", 4001, {
                reverses_entry_id: cash.id,
                note: "Exceso QA",
              }),
            )
          ).status,
          409,
        );
        const rest = await call(
          "/entries",
          "POST",
          make("refund", 4000, {
            reverses_entry_id: cash.id,
            note: "Resto QA",
          }),
        );
        assert.equal(rest.data.commission_cents, -1200);
      },
    );
    await t.test("redondeo acumulado de devoluciones al céntimo", async () => {
      await call("/commissions/" + f.employee, "PUT", { rate_bps: 3333 });
      const a = await f.appointment(3);
      const paid = await call(
        "/entries",
        "POST",
        make("payment", 3, { appointment_id: a, method: "card" }),
      );
      assert.equal(paid.data.commission_cents, 1);
      let total = 0;
      for (let i = 0; i < 3; i++) {
        const r = await call(
          "/entries",
          "POST",
          make("refund", 1, {
            reverses_entry_id: paid.data.id,
            method: "card",
            note: "Redondeo QA",
          }),
        );
        assert.equal(r.status, 201);
        total += r.data.commission_cents;
      }
      assert.equal(total, -1);
    });
    await t.test(
      "entradas, salidas, pagos de comisión y exportación segura",
      async () => {
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("cash_in", 500, { note: "=SUM(1+1)" }),
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("cash_out", 200, { note: "Material QA" }),
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("cash_out", 999999, { note: "Exceso QA" }),
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("commission_payout", 3701, {
                employee_id: f.employee,
                method: "transfer",
                note: "Exceso",
              }),
            )
          ).status,
          409,
        );
        const paid = make("commission_payout", 1000, {
          employee_id: f.employee,
          method: "transfer",
          note: "Pago QA",
        });
        assert.equal((await call("/entries", "POST", paid)).status, 201);
        await call("/entries", "POST", paid);
        const state = (await call(query)).data;
        assert.equal(state.rates[0].earned_cents, 3700);
        assert.equal(state.rates[0].paid_cents, 1000);
        assert.equal(state.rates[0].balance_cents, 2700);
        const csv = await call("/export" + query);
        assert.equal(csv.status, 200);
        assert.ok(csv.data.includes("'=SUM(1+1)"));
        await assert.rejects(
          runtime.query("DELETE FROM salon.money_entries"),
          (e) => e.code === "42501",
        );
      },
    );
    await t.test(
      "cierre persistente con diferencia justificada y bloqueo de movimientos",
      async () => {
        assert.equal(
          (
            await call("/days/" + day + "/close", "POST", {
              counted_cents: 10301,
              notes: "",
            })
          ).status,
          400,
        );
        const input = { counted_cents: 10301, notes: "Descuadre QA" };
        const r = await call("/days/" + day + "/close", "POST", input);
        assert.equal(r.status, 201, JSON.stringify(r.data));
        assert.equal(r.data.expected_cents, 10300);
        assert.equal(r.data.difference_cents, 1);
        assert.equal(
          (await call("/days/" + day + "/close", "POST", input)).data.id,
          day,
        );
        assert.equal(
          (
            await call("/days/" + day + "/close", "POST", {
              counted_cents: 10300,
              notes: "",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("cash_in", 100, { note: "Caja cerrada" }),
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await call("/open", "POST", {
              branch_id: f.a.branch,
              currency: "USD",
              opening_cents: 0,
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await call(
              "/entries",
              "POST",
              make("payment", 1, {
                currency: "USD",
                appointment_id: appointment,
              }),
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "devolución posterior conserva el cierre original",
      async () => {
        await admin.query(
          "UPDATE salon.cash_days SET business_date=business_date-1 WHERE id=$1",
          [day],
        );
        await call("/open", "POST", {
          branch_id: f.a.branch,
          currency: "EUR",
          opening_cents: 0,
        });
        const r = await call(
          "/entries",
          "POST",
          make("refund", 1000, {
            reverses_entry_id: card.id,
            method: "card",
            note: "Devolución otro día",
          }),
        );
        assert.equal(r.status, 201, JSON.stringify(r.data));
        assert.equal(r.data.commission_cents, -300);
        const original = (
          await admin.query(
            "SELECT expected_cents,difference_cents FROM salon.cash_days WHERE id=$1",
            [day],
          )
        ).rows[0];
        assert.equal(original.expected_cents, 10300);
        assert.equal(original.difference_cents, 1);
      },
    );
  } finally {
    if (f) await f.cleanup();
    await admin.end();
    await runtime.end();
  }
});
