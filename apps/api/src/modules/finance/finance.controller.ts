import {
  Controller,
  Get,
  Post,
  Put,
  Req,
  Res,
  Param,
  Query,
  Body,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Database } from "../../database";
import { Auth } from "../../auth";
import { id } from "../../validation";
import {
  commission,
  refundedCommission,
  twoDecimalCurrency,
  csvCell,
  DESK,
  MANAGE,
} from "./finance.logic";
const amount = z.number().int().min(1).max(100000000),
  currency = z.string().regex(/^[A-Z]{3}$/),
  note = z.string().trim().max(500).default("");
const method = z.enum(["cash", "card", "transfer", "other"]);
const scope = z
  .object({ branch_id: id, date: z.iso.date(), currency })
  .strict();
@Controller("api/tenants/:tenant/finance")
export class FinanceController {
  constructor(
    private db: Database,
    private auth: Auth,
  ) {}
  private async lock(db: PoolClient, tenant: string) {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "finance:" + tenant,
    ]);
  }
  private async branch(db: PoolClient, tenant: string, branch: string) {
    const b = (
      await db.query(
        "SELECT id,(now() AT TIME ZONE timezone)::date::text AS today,timezone FROM salon.branches WHERE tenant_id=$1 AND id=$2",
        [tenant, branch],
      )
    ).rows[0];
    if (!b) throw new NotFoundException("No existe esta sede.");
    return b;
  }
  private async day(
    db: PoolClient,
    tenant: string,
    branch: string,
    cur: string,
  ) {
    const b = await this.branch(db, tenant, branch);
    const d = (
      await db.query(
        "SELECT * FROM salon.cash_days WHERE tenant_id=$1 AND branch_id=$2 AND business_date=$3 AND currency=$4",
        [tenant, branch, b.today, cur],
      )
    ).rows[0];
    if (!d || d.status !== "open")
      throw new ConflictException(
        "Abre la caja de hoy para registrar esta operación.",
      );
    return d;
  }
  private async prior(
    db: PoolClient,
    tenant: string,
    key: string,
    hash: string,
  ) {
    const row = (
      await db.query(
        "SELECT * FROM salon.money_entries WHERE tenant_id=$1 AND request_key=$2",
        [tenant, key],
      )
    ).rows[0];
    if (row && row.request_hash !== hash)
      throw new ConflictException(
        "Este intento ya se utilizó con otros datos.",
      );
    return row;
  }
  private async totals(db: PoolClient, tenant: string, day: string) {
    const rows = (
      await db.query(
        `SELECT method,
   coalesce(sum(amount_cents) FILTER(WHERE kind='payment'),0)::bigint AS received_cents,
   coalesce(sum(amount_cents) FILTER(WHERE kind='refund'),0)::bigint AS refunded_cents,
   coalesce(sum(amount_cents) FILTER(WHERE kind='cash_in'),0)::bigint AS cash_in_cents,
   coalesce(sum(amount_cents) FILTER(WHERE kind='cash_out'),0)::bigint AS cash_out_cents,
   coalesce(sum(amount_cents) FILTER(WHERE kind='commission_payout'),0)::bigint AS paid_commissions_cents,
   coalesce(sum(CASE WHEN kind IN ('payment','cash_in') THEN amount_cents ELSE -amount_cents END),0)::bigint AS balance_cents
   FROM salon.money_entries WHERE tenant_id=$1 AND cash_day_id=$2 GROUP BY method ORDER BY method`,
        [tenant, day],
      )
    ).rows;
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          k === "method" ? v : Number(v),
        ]),
      ),
    );
  }
  @Get() async index(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Query() query: unknown,
  ) {
    id.parse(tenant);
    const q = scope.parse(query);
    twoDecimalCurrency(q.currency);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, DESK, async (db, role) => {
      const b = await this.branch(db, tenant, q.branch_id);
      const day =
        (
          await db.query(
            "SELECT *,business_date::text AS business_date FROM salon.cash_days WHERE tenant_id=$1 AND branch_id=$2 AND business_date=$3 AND currency=$4",
            [tenant, q.branch_id, q.date, q.currency],
          )
        ).rows[0] ?? null;
      const entries = day
        ? (
            await db.query(
              `SELECT m.*,CASE WHEN m.kind='payment' THEN m.amount_cents-coalesce((SELECT sum(r.amount_cents) FROM salon.money_entries r WHERE r.tenant_id=m.tenant_id AND r.reverses_entry_id=m.id AND r.kind='refund'),0) ELSE 0 END AS refundable_cents,a.service_name,c.name AS customer_name,e.name AS employee_name FROM salon.money_entries m LEFT JOIN salon.appointments a ON a.tenant_id=m.tenant_id AND a.id=m.appointment_id LEFT JOIN salon.customers c ON c.tenant_id=a.tenant_id AND c.id=a.customer_id LEFT JOIN salon.employees e ON e.tenant_id=m.tenant_id AND e.id=m.employee_id WHERE m.tenant_id=$1 AND m.cash_day_id=$2 ORDER BY m.created_at DESC,m.id LIMIT 200`,
              [tenant, day.id],
            )
          ).rows
        : [];
      const pending = (
        await db.query(
          `SELECT a.id,a.service_name,a.price_cents,a.starts_at,e.name AS employee_name,c.name AS customer_name,
    coalesce(p.paid,0)::int AS paid_cents,(a.price_cents-coalesce(p.paid,0))::int AS due_cents
    FROM salon.appointments a JOIN salon.employees e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id JOIN salon.customers c ON c.tenant_id=a.tenant_id AND c.id=a.customer_id
    LEFT JOIN LATERAL(SELECT sum(CASE WHEN kind='payment' THEN amount_cents ELSE -amount_cents END) AS paid FROM salon.money_entries WHERE tenant_id=a.tenant_id AND appointment_id=a.id AND kind IN ('payment','refund')) p ON true
    WHERE a.tenant_id=$1 AND a.branch_id=$2 AND a.currency=$3 AND a.status='completed' AND coalesce(p.paid,0)<a.price_cents ORDER BY a.starts_at LIMIT 100`,
          [tenant, q.branch_id, q.currency],
        )
      ).rows;
      const rates = MANAGE.includes(role)
        ? (
            await db.query(
              `SELECT e.id,e.name,e.active,coalesce(r.rate_bps,0) AS rate_bps,coalesce(m.earned,0)::bigint AS earned_cents,coalesce(m.paid,0)::bigint AS paid_cents,(coalesce(m.earned,0)-coalesce(m.paid,0))::bigint AS balance_cents FROM salon.employees e LEFT JOIN salon.commission_rates r ON r.tenant_id=e.tenant_id AND r.employee_id=e.id LEFT JOIN LATERAL(SELECT sum(commission_cents) AS earned,sum(amount_cents) FILTER(WHERE kind='commission_payout') AS paid FROM salon.money_entries WHERE tenant_id=e.tenant_id AND employee_id=e.id AND currency=$3) m ON true WHERE e.tenant_id=$1 AND e.branch_id=$2 ORDER BY e.name`,
              [tenant, q.branch_id, q.currency],
            )
          ).rows.map((r) => ({
            ...r,
            earned_cents: Number(r.earned_cents),
            paid_cents: Number(r.paid_cents),
            balance_cents: Number(r.balance_cents),
          }))
        : [];
      const days = (
        await db.query(
          "SELECT id,business_date::text AS business_date,currency,status,expected_cents,counted_cents,difference_cents FROM salon.cash_days WHERE tenant_id=$1 AND branch_id=$2 AND currency=$3 ORDER BY business_date DESC LIMIT 30",
          [tenant, q.branch_id, q.currency],
        )
      ).rows;
      return {
        today: b.today,
        timezone: b.timezone,
        day,
        entries,
        totals: day ? await this.totals(db, tenant, day.id) : [],
        pending,
        rates,
        days,
        entry_limit: 200,
      };
    });
  }
  @Post("open") async open(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = z
      .object({
        branch_id: id,
        currency,
        opening_cents: amount.or(z.literal(0)),
      })
      .strict()
      .parse(body);
    twoDecimalCurrency(input.currency);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, DESK, async (db) => {
      await this.lock(db, tenant);
      const b = await this.branch(db, tenant, input.branch_id);
      const prior = (
        await db.query(
          "SELECT * FROM salon.cash_days WHERE tenant_id=$1 AND branch_id=$2 AND business_date=$3 AND currency=$4",
          [tenant, input.branch_id, b.today, input.currency],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.status === "open" &&
          prior.opening_cents === input.opening_cents
        )
          return prior;
        throw new ConflictException(
          "La caja de hoy ya existe. No se modifica su apertura.",
        );
      }
      const d = (
        await db.query(
          "INSERT INTO salon.cash_days(tenant_id,branch_id,business_date,currency,opening_cents,opened_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            tenant,
            input.branch_id,
            b.today,
            input.currency,
            input.opening_cents,
            user.id,
          ],
        )
      ).rows[0];
      await this.db.audit(db, tenant, user.id, "finance.opened", d.id);
      return d;
    });
  }
  @Post("entries") async record(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = z
      .object({
        branch_id: id,
        currency,
        kind: z.enum([
          "payment",
          "refund",
          "cash_in",
          "cash_out",
          "commission_payout",
        ]),
        amount_cents: amount,
        method,
        appointment_id: id.optional(),
        employee_id: id.optional(),
        reverses_entry_id: id.optional(),
        note,
        request_key: id,
      })
      .strict()
      .parse(body);
    twoDecimalCurrency(input.currency);
    const user = await this.auth.user(req);
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return this.db.tenant(
      user,
      tenant,
      input.kind === "payment" ? DESK : MANAGE,
      async (db) => {
        await this.lock(db, tenant);
        const prior = await this.prior(db, tenant, input.request_key, hash);
        if (prior) return prior;
        const d = await this.day(db, tenant, input.branch_id, input.currency);
        let appointment: string | null = null,
          employee: string | null = null,
          reversal: string | null = null,
          rate = 0,
          earned = 0;
        if (input.kind === "payment") {
          if (
            !input.appointment_id ||
            input.employee_id ||
            input.reverses_entry_id
          )
            throw new BadRequestException(
              "Selecciona la cita que estás cobrando.",
            );
          const a = (
            await db.query(
              "SELECT * FROM salon.appointments WHERE tenant_id=$1 AND id=$2 AND branch_id=$3 AND currency=$4 FOR UPDATE",
              [tenant, input.appointment_id, input.branch_id, input.currency],
            )
          ).rows[0];
          if (!a)
            throw new NotFoundException(
              "No existe esta cita en la sede y moneda elegidas.",
            );
          if (a.status !== "completed")
            throw new ConflictException(
              "Completa la cita antes de registrar el cobro.",
            );
          const paid = Number(
            (
              await db.query(
                "SELECT coalesce(sum(CASE WHEN kind='payment' THEN amount_cents ELSE -amount_cents END),0) AS paid FROM salon.money_entries WHERE tenant_id=$1 AND appointment_id=$2 AND kind IN ('payment','refund')",
                [tenant, a.id],
              )
            ).rows[0].paid,
          );
          if (paid + input.amount_cents > a.price_cents)
            throw new ConflictException(
              "El cobro supera el importe pendiente de la cita.",
            );
          appointment = a.id;
          employee = a.employee_id;
          rate =
            (
              await db.query(
                "SELECT rate_bps FROM salon.commission_rates WHERE tenant_id=$1 AND employee_id=$2",
                [tenant, employee],
              )
            ).rows[0]?.rate_bps ?? 0;
          earned = commission(input.amount_cents, rate);
        } else if (input.kind === "refund") {
          if (
            !input.reverses_entry_id ||
            input.appointment_id ||
            input.employee_id ||
            !input.note
          )
            throw new BadRequestException(
              "Selecciona el cobro original e indica el motivo.",
            );
          const original = (
            await db.query(
              "SELECT m.* FROM salon.money_entries m JOIN salon.cash_days d ON d.id=m.cash_day_id AND d.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.id=$2 AND m.kind='payment' AND d.branch_id=$3 AND m.currency=$4",
              [
                tenant,
                input.reverses_entry_id,
                input.branch_id,
                input.currency,
              ],
            )
          ).rows[0];
          if (!original)
            throw new NotFoundException(
              "No existe este cobro en la sede y moneda elegidas.",
            );
          if (input.method !== original.method)
            throw new BadRequestException(
              "La devolución debe usar el método del cobro original.",
            );
          const refunded = (
            await db.query(
              "SELECT coalesce(sum(amount_cents),0) AS total,coalesce(sum(commission_cents),0) AS commission FROM salon.money_entries WHERE tenant_id=$1 AND reverses_entry_id=$2 AND kind='refund'",
              [tenant, original.id],
            )
          ).rows[0];
          const total = Number(refunded.total) + input.amount_cents;
          if (total > original.amount_cents)
            throw new ConflictException(
              "La devolución supera lo que queda del cobro original.",
            );
          appointment = original.appointment_id;
          employee = original.employee_id;
          reversal = original.id;
          rate = original.commission_rate_bps;
          earned = -(
            refundedCommission(
              original.commission_cents,
              original.amount_cents,
              total,
            ) + Number(refunded.commission)
          );
        } else if (input.kind === "commission_payout") {
          if (
            !input.employee_id ||
            input.appointment_id ||
            input.reverses_entry_id ||
            !input.note
          )
            throw new BadRequestException(
              "Selecciona el profesional e indica la referencia del pago.",
            );
          const e = (
            await db.query(
              "SELECT id FROM salon.employees WHERE tenant_id=$1 AND id=$2 AND branch_id=$3",
              [tenant, input.employee_id, input.branch_id],
            )
          ).rows[0];
          if (!e) throw new NotFoundException();
          employee = e.id;
          const balance = Number(
            (
              await db.query(
                "SELECT coalesce(sum(commission_cents),0)-coalesce(sum(amount_cents) FILTER(WHERE kind='commission_payout'),0) AS balance FROM salon.money_entries WHERE tenant_id=$1 AND employee_id=$2 AND currency=$3",
                [tenant, employee, input.currency],
              )
            ).rows[0].balance,
          );
          if (input.amount_cents > balance)
            throw new ConflictException(
              "El pago supera las comisiones pendientes.",
            );
        } else {
          if (
            input.method !== "cash" ||
            !input.note ||
            input.appointment_id ||
            input.employee_id ||
            input.reverses_entry_id
          )
            throw new BadRequestException(
              "Las entradas y salidas manuales son de efectivo y necesitan un motivo.",
            );
        }
        if (
          input.method === "cash" &&
          ["refund", "cash_out", "commission_payout"].includes(input.kind)
        ) {
          const rows = await this.totals(db, tenant, d.id);
          const cash =
            Number(rows.find((r) => r.method === "cash")?.balance_cents ?? 0) +
            d.opening_cents;
          if (input.amount_cents > cash)
            throw new ConflictException(
              "No hay suficiente efectivo registrado en esta caja.",
            );
        }
        const row = (
          await db.query(
            "INSERT INTO salon.money_entries(tenant_id,cash_day_id,appointment_id,employee_id,reverses_entry_id,kind,method,amount_cents,commission_rate_bps,commission_cents,currency,note,created_by,request_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
            [
              tenant,
              d.id,
              appointment,
              employee,
              reversal,
              input.kind,
              input.method,
              input.amount_cents,
              rate,
              earned,
              input.currency,
              input.note,
              user.id,
              input.request_key,
              hash,
            ],
          )
        ).rows[0];
        await this.db.audit(
          db,
          tenant,
          user.id,
          "finance." + input.kind,
          row.id,
        );
        return row;
      },
    );
  }
  @Post("days/:day/close") async close(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("day") day: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(day);
    const input = z
      .object({ counted_cents: amount.or(z.literal(0)), notes: note })
      .strict()
      .parse(body);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await this.lock(db, tenant);
      const d = (
        await db.query(
          "SELECT * FROM salon.cash_days WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [tenant, day],
        )
      ).rows[0];
      if (!d) throw new NotFoundException();
      if (d.status === "closed") {
        if (d.counted_cents === input.counted_cents && d.notes === input.notes)
          return d;
        throw new ConflictException(
          "La caja ya está cerrada y su recuento no se modifica.",
        );
      }
      const totals = await this.totals(db, tenant, day),
        expected =
          d.opening_cents +
          Number(totals.find((t) => t.method === "cash")?.balance_cents ?? 0);
      if (
        !Number.isSafeInteger(expected) ||
        expected > 2147483647 ||
        expected < 0
      )
        throw new ConflictException(
          "Revisa el saldo de efectivo antes de cerrar.",
        );
      if (input.counted_cents !== expected && !input.notes)
        throw new BadRequestException(
          "Explica la diferencia de efectivo en las notas del cierre.",
        );
      const row = (
        await db.query(
          "UPDATE salon.cash_days SET status='closed',closed_by=$3,closed_at=now(),counted_cents=$4,expected_cents=$5,difference_cents=$4::integer-$5::integer,totals=$6,notes=$7 WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [
            tenant,
            day,
            user.id,
            input.counted_cents,
            expected,
            JSON.stringify(totals),
            input.notes,
          ],
        )
      ).rows[0];
      await this.db.audit(db, tenant, user.id, "finance.closed", day);
      return row;
    });
  }
  @Put("commissions/:employee") async rate(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("employee") employee: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(employee);
    const input = z
      .object({ rate_bps: z.number().int().min(0).max(10000) })
      .strict()
      .parse(body);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await this.lock(db, tenant);
      if (
        !(
          await db.query(
            "SELECT id FROM salon.employees WHERE tenant_id=$1 AND id=$2",
            [tenant, employee],
          )
        ).rowCount
      )
        throw new NotFoundException();
      await db.query(
        "INSERT INTO salon.commission_rates(tenant_id,employee_id,rate_bps,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,employee_id) DO UPDATE SET rate_bps=excluded.rate_bps,updated_at=now(),updated_by=excluded.updated_by",
        [tenant, employee, input.rate_bps, user.id],
      );
      await this.db.audit(
        db,
        tenant,
        user.id,
        "finance.commission_rate",
        employee,
      );
      return { ok: true };
    });
  }
  @Get("export") async export(
    @Req() req: Request,
    @Res() res: Response,
    @Param("tenant") tenant: string,
    @Query() query: unknown,
  ) {
    id.parse(tenant);
    const q = scope.parse(query),
      user = await this.auth.user(req);
    const rows = await this.db.tenant(user, tenant, DESK, async (db) => {
      await this.branch(db, tenant, q.branch_id);
      const rows = (
        await db.query(
          "SELECT m.id,m.created_at,m.kind,m.method,m.amount_cents,m.commission_cents,m.currency,m.note FROM salon.money_entries m JOIN salon.cash_days d ON d.tenant_id=m.tenant_id AND d.id=m.cash_day_id WHERE m.tenant_id=$1 AND d.branch_id=$2 AND d.business_date=$3 AND m.currency=$4 ORDER BY m.created_at,m.id LIMIT 10001",
          [tenant, q.branch_id, q.date, q.currency],
        )
      ).rows;
      if (rows.length > 10000)
        throw new BadRequestException(
          "La exportación supera 10.000 movimientos.",
        );
      return rows;
    });
    const csv = [
      [
        "Id",
        "Fecha UTC",
        "Operación",
        "Método",
        "Importe",
        "Comisión",
        "Moneda",
        "Nota",
      ]
        .map(csvCell)
        .join(";"),
      ...rows.map((r) =>
        [
          r.id,
          new Date(r.created_at).toISOString(),
          r.kind,
          r.method,
          r.amount_cents / 100,
          r.commission_cents / 100,
          r.currency,
          r.note,
        ]
          .map(csvCell)
          .join(";"),
      ),
    ].join("\r\n");
    res
      .type("text/csv; charset=utf-8")
      .setHeader(
        "Content-Disposition",
        'attachment; filename="caja-' + q.date + "-" + q.currency + '.csv"',
      );
    res.send("\uFEFF" + csv);
  }
}
