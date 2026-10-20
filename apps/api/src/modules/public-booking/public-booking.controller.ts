import { readPage } from "../pages/pages.data";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { Database } from "../../database";
import { Auth } from "../../auth";
import { Booking } from "../../booking";
import {
  id,
  credentials,
  onboarding,
  serviceInput,
  employeeInput,
  customerInput,
  scheduleInput,
  absenceInput,
  bookingInput,
  publicBookingInput,
  statusInput,
  slotQuery,
} from "../../validation";
const MANAGE = ["owner", "manager"],
  DESK = ["owner", "manager", "receptionist"];
@Controller("api")
export class PublicBookingController {
  constructor(
    private readonly db: Database,
    private readonly booking: Booking,
  ) {}
  @Get("public/salons/:slug") async catalog(@Param("slug") slug: string) {
    z.string().max(60).parse(slug);
    return this.db.public(slug, async (db, t) => ({
      name: t.name,
      slug: t.slug,
      ...await readPage(db, t.id, true),
      branches: (
        await db.query(
          "SELECT id,name,timezone,address FROM salon.branches WHERE tenant_id=$1 ORDER BY name",
          [t.id],
        )
      ).rows,
      services: (
        await db.query(
          "SELECT id,name,category,description,photo_asset_id,duration_minutes,buffer_minutes,price_cents,currency FROM salon.services WHERE tenant_id=$1 AND active ORDER BY name",
          [t.id],
        )
      ).rows,
      employees: (
        await db.query(
          "SELECT e.id,e.name,e.branch_id,coalesce((SELECT json_agg(es.service_id) FROM salon.employee_services es WHERE es.employee_id=e.id AND es.tenant_id=e.tenant_id),'[]'::json) AS service_ids FROM salon.employees e WHERE tenant_id=$1 AND active ORDER BY name",
          [t.id],
        )
      ).rows,
    }));
  }
  @Get("public/salons/:slug/slots") async publicSlots(
    @Param("slug") slug: string,
    @Query() query: unknown,
  ) {
    const q = slotQuery.parse(query);
    return this.db.public(slug, (db, t) => this.booking.slots(db, t.id, q));
  }
  @Post("public/salons/:slug/appointments") async publicBook(
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    const parsed = publicBookingInput.parse(body);
    const { consent, ...booking } = parsed;
    const input = bookingInput.parse({
      ...booking,
      customer: { ...parsed.customer, notes: "" },
    });
    return this.db.public(slug, (db, t) =>
      this.booking.create(db, t.id, input, "public", null),
    );
  }
  @Post("public/salons/:slug/cancellation") async cancellationInfo(
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    const data = z
      .object({ id, token: z.string().min(40).max(100) })
      .strict()
      .parse(body);
    return this.db.public(
      slug,
      async (db, t) => {
        const rows = (
          await db.query(
            "SELECT b.id,b.name,b.timezone,b.address FROM salon.appointments a JOIN salon.branches b ON b.id=a.branch_id AND b.tenant_id=a.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.cancellation_hash=$3",
            [
              data.id,
              t.id,
              createHash("sha256").update(data.token).digest("hex"),
            ],
          )
        ).rows;
        if (!rows.length)
          throw new NotFoundException("El enlace de cancelación no es válido.");
        return {
          name: t.name,
          slug: t.slug,
          branches: rows,
          services: [],
          employees: [],
        };
      },
      true,
    );
  }
  @Post("public/salons/:slug/cancel") async cancel(
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    const data = z
      .object({ id, token: z.string().min(40).max(100) })
      .strict()
      .parse(body);
    return this.db.public(
      slug,
      async (db, t) => {
        const { rows } = await db.query(
          "SELECT id,status,starts_at FROM salon.appointments WHERE id=$1 AND tenant_id=$2 AND cancellation_hash=$3 FOR UPDATE",
          [
            data.id,
            t.id,
            createHash("sha256").update(data.token).digest("hex"),
          ],
        );
        if (!rows.length)
          throw new NotFoundException("El enlace de cancelación no es válido.");
        if (rows[0].status === "cancelled") return { ok: true };
        if (
          rows[0].status !== "confirmed" ||
          new Date(rows[0].starts_at).getTime() <= Date.now()
        )
          throw new ConflictException(
            "Esta cita ya no se puede cancelar online. Contacta con el salón.",
          );
        await db.query(
          "UPDATE salon.appointments SET status='cancelled' WHERE id=$1 AND tenant_id=$2",
          [data.id, t.id],
        );
        await this.db.audit(db, t.id, null, "appointment.cancelled", data.id);
        return { ok: true };
      },
      true,
    );
  }
}
