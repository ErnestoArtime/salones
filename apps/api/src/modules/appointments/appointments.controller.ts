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
export class AppointmentsController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
    private readonly booking: Booking,
  ) {}
  @Get("tenants/:tenant/slots") async slots(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Query() query: unknown,
  ) {
    id.parse(tenant);
    const q = slotQuery.parse(query),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, DESK, (db) =>
      this.booking.slots(db, tenant, q),
    );
  }
  @Post("tenants/:tenant/appointments") async createAppointment(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = bookingInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, DESK, (db) =>
      this.booking.create(db, tenant, input, "internal", user.id),
    );
  }
  @Put("tenants/:tenant/appointments/:entity/reschedule") async reschedule(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const input = bookingInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, DESK, async (db) => {
      const previous = (
        await db.query(
          "SELECT id,status FROM salon.appointments WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
          [entity, tenant],
        )
      ).rows[0];
      if (!previous) throw new NotFoundException();
      if (previous.status !== "confirmed") {
        const retry = (
          await db.query(
            "SELECT id FROM salon.appointments WHERE tenant_id=$1 AND request_key=$2 AND rescheduled_from=$3",
            [tenant, input.request_key, entity],
          )
        ).rows[0];
        if (retry)
          return this.booking.create(db, tenant, input, "internal", user.id);
        throw new ConflictException(
          "Solo se pueden cambiar citas confirmadas.",
        );
      }
      await db.query(
        "UPDATE salon.appointments SET status='cancelled' WHERE id=$1 AND tenant_id=$2",
        [entity, tenant],
      );
      const result = await this.booking.create(
        db,
        tenant,
        input,
        "internal",
        user.id,
      );
      await db.query(
        "UPDATE salon.appointments SET rescheduled_from=$3 WHERE tenant_id=$1 AND id=$2",
        [tenant, result.id, entity],
      );
      await this.db.audit(
        db,
        tenant,
        user.id,
        "appointment.rescheduled",
        entity,
      );
      return result;
    });
  }
  @Get("tenants/:tenant/agenda") async agenda(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Query("from") from: string,
  ) {
    id.parse(tenant);
    z.iso.date().parse(from);
    const user = await this.auth.user(req);
    return this.db.tenant(
      user,
      tenant,
      [],
      async (db, role) =>
        (
          await db.query(
            `SELECT a.id,a.branch_id,a.service_id,a.customer_id,a.starts_at,a.ends_at,a.status,a.price_cents,a.currency,a.notes,a.service_name,c.name AS customer_name,e.name AS employee_name,e.id AS employee_id,(a.starts_at AT TIME ZONE b.timezone)::date::text AS local_date FROM salon.appointments a JOIN salon.customers c ON c.id=a.customer_id AND c.tenant_id=a.tenant_id JOIN salon.employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id JOIN salon.branches b ON b.id=a.branch_id AND b.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND (a.starts_at AT TIME ZONE b.timezone)::date>=$2::date AND (a.starts_at AT TIME ZONE b.timezone)::date<$2::date+7 AND ($3::boolean=false OR e.user_id=$4) ORDER BY a.starts_at`,
            [tenant, from, role === "professional", user.id],
          )
        ).rows,
    );
  }
  @Put("tenants/:tenant/appointments/:entity/status") async status(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const data = statusInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, [], async (db, role) => {
      const a = (
        await db.query(
          "SELECT a.*,e.user_id FROM salon.appointments a JOIN salon.employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 FOR UPDATE OF a",
          [entity, tenant],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (role === "professional" && a.user_id !== user.id)
        throw new ForbiddenException(
          "Solo puedes gestionar tus propias citas.",
        );
      if (a.status !== data.status && a.status !== "confirmed")
        throw new ConflictException(
          "La cita ya está cerrada. Crea una nueva reserva si es necesario.",
        );
      if (
        data.status === "completed" &&
        new Date(a.starts_at).getTime() > Date.now()
      )
        throw new BadRequestException("La cita todavía no ha comenzado.");
      await db.query(
        "UPDATE salon.appointments SET status=$3 WHERE tenant_id=$1 AND id=$2",
        [tenant, entity, data.status],
      );
      await this.db.audit(
        db,
        tenant,
        user.id,
        "appointment." + data.status,
        entity,
      );
      return { ok: true };
    });
  }
}
