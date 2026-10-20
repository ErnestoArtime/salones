import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { DateTime } from "luxon";
import { createHash, createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { Database } from "./database";
import { bookingInput } from "./validation";
import { z } from "zod";
@Injectable()
export class Booking {
  constructor(private readonly database: Database) {}
  async slots(
    db: PoolClient,
    tenant: string,
    q: {
      service_id: string;
      employee_id: string;
      branch_id: string;
      date: string;
    },
  ) {
    const { rows: services } = await db.query(
      "SELECT * FROM salon.services WHERE id=$1 AND tenant_id=$2 AND active",
      [q.service_id, tenant],
    );
    const { rows: employees } = await db.query(
      "SELECT e.*,b.timezone FROM salon.employees e JOIN salon.branches b ON b.id=e.branch_id AND b.tenant_id=e.tenant_id JOIN salon.employee_services es ON es.employee_id=e.id AND es.tenant_id=e.tenant_id WHERE e.id=$1 AND e.branch_id=$2 AND e.tenant_id=$3 AND es.service_id=$4 AND e.active",
      [q.employee_id, q.branch_id, tenant, q.service_id],
    );
    if (!services.length || !employees.length)
      throw new BadRequestException(
        "El servicio y el profesional no están disponibles en esta sede.",
      );
    const service = services[0],
      zone = employees[0].timezone;
    const day = DateTime.fromISO(q.date, { zone }).startOf("day"),
      now = DateTime.now();
    if (
      !day.isValid ||
      day.toMillis() < now.setZone(zone).startOf("day").toMillis() ||
      day.toMillis() > now.plus({ days: 120 }).toMillis()
    )
      return [];
    const { rows: periods } = await db.query(
      "SELECT start_time,end_time FROM salon.schedules WHERE employee_id=$1 AND tenant_id=$2 AND weekday=$3",
      [q.employee_id, tenant, day.weekday],
    );
    const { rows: busy } = await db.query(
      "SELECT starts_at,blocked_until AS ends_at FROM salon.appointments WHERE employee_id=$1 AND tenant_id=$2 AND status IN ('confirmed','completed') AND starts_at<$4 AND blocked_until>$3 UNION ALL SELECT starts_at,ends_at FROM salon.absences WHERE employee_id=$1 AND tenant_id=$2 AND starts_at<$4 AND ends_at>$3",
      [q.employee_id, tenant, day.toISO(), day.plus({ days: 1 }).toISO()],
    );
    const result: string[] = [];
    for (const p of periods) {
      let start = DateTime.fromISO(q.date + "T" + p.start_time, { zone });
      const end = DateTime.fromISO(q.date + "T" + p.end_time, { zone });
      if (
        start.toFormat("HH:mm:ss") !== p.start_time ||
        end.toFormat("HH:mm:ss") !== p.end_time
      )
        continue;
      for (
        ;
        start.plus({
          minutes: service.duration_minutes + service.buffer_minutes,
        }) <= end;
        start = start.plus({ minutes: 15 })
      ) {
        const finish = start.plus({
          minutes: service.duration_minutes + service.buffer_minutes,
        });
        if (start.toMillis() <= now.toMillis() + 5 * 60000) continue;
        if (
          busy.some(
            (b) =>
              Date.parse(b.starts_at) < finish.toMillis() &&
              Date.parse(b.ends_at) > start.toMillis(),
          )
        )
          continue;
        result.push(start.toUTC().toISO()!);
      }
    }
    return [...new Set(result)].sort();
  }
  async create(
    db: PoolClient,
    tenant: string,
    input: z.infer<typeof bookingInput>,
    source: "internal" | "public",
    actor: string | null,
  ) {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      tenant + ":" + input.request_key,
    ]);
    const hash = createHash("sha256")
      .update(JSON.stringify({ ...input, source }))
      .digest("hex");
    const token = createHmac("sha256", process.env.JWT_SECRET!)
      .update(tenant + ":" + input.request_key)
      .digest("base64url");
    const { rows: existing } = await db.query(
      "SELECT id,starts_at,ends_at,request_hash,status FROM salon.appointments WHERE tenant_id=$1 AND request_key=$2",
      [tenant, input.request_key],
    );
    if (existing.length) {
      if (existing[0].request_hash !== hash)
        throw new ConflictException(
          "Este intento de reserva ya se utilizó con otros datos.",
        );
      return {
        id: existing[0].id,
        starts_at: existing[0].starts_at,
        ends_at: existing[0].ends_at,
        status: existing[0].status,
        cancellation_token: token,
      };
    }
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      input.employee_id,
    ]);
    const { rows: branches } = await db.query(
      "SELECT timezone FROM salon.branches WHERE id=$1 AND tenant_id=$2",
      [input.branch_id, tenant],
    );
    if (!branches.length) throw new NotFoundException("Sede no encontrada.");
    const date = DateTime.fromISO(input.starts_at)
      .setZone(branches[0].timezone)
      .toISODate()!;
    await db.query(
      "SELECT id FROM salon.services WHERE id=$1 AND tenant_id=$2 FOR SHARE",
      [input.service_id, tenant],
    );
    const slots = await this.slots(db, tenant, { ...input, date });
    if (!slots.some((s) => Date.parse(s) === Date.parse(input.starts_at)))
      throw new ConflictException(
        "Este horario ya no está disponible. Elige otro.",
      );
    const { rows: services } = await db.query(
      "SELECT * FROM salon.services WHERE id=$1 AND tenant_id=$2",
      [input.service_id, tenant],
    );
    const service = services[0];
    let customerId = input.customer_id;
    if (customerId) {
      const { rowCount } = await db.query(
        "SELECT id FROM salon.customers WHERE id=$1 AND tenant_id=$2",
        [customerId, tenant],
      );
      if (!rowCount) throw new NotFoundException("Cliente no encontrado.");
    } else if (input.customer) {
      const c = input.customer;
      const { rows } = await db.query(
        "INSERT INTO salon.customers(tenant_id,name,email,phone,notes) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [tenant, c.name, c.email, c.phone, source === "public" ? "" : c.notes],
      );
      customerId = rows[0].id;
      if (source === "public")
        await db.query(
          "UPDATE salon.customers SET booking_consent_at=now(),consent_version='booking-v1' WHERE tenant_id=$1 AND id=$2",
          [tenant, customerId],
        );
    } else
      throw new BadRequestException(
        "Selecciona un cliente o introduce sus datos.",
      );
    const start = DateTime.fromISO(input.starts_at),
      end = start.plus({ minutes: service.duration_minutes }),
      blocked = end.plus({ minutes: service.buffer_minutes });
    const { rows } = await db.query(
      `INSERT INTO salon.appointments(tenant_id,branch_id,employee_id,customer_id,service_id,starts_at,ends_at,blocked_until,service_name,price_cents,currency,notes,source,request_key,request_hash,cancellation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id,starts_at,ends_at,status`,
      [
        tenant,
        input.branch_id,
        input.employee_id,
        customerId,
        input.service_id,
        start.toISO(),
        end.toISO(),
        blocked.toISO(),
        service.name,
        service.price_cents,
        service.currency,
        input.notes,
        source,
        input.request_key,
        hash,
        createHash("sha256").update(token).digest("hex"),
      ],
    );
    await this.database.audit(
      db,
      tenant,
      actor,
      "appointment.created",
      rows[0].id,
    );
    return { ...rows[0], cancellation_token: token };
  }
}
