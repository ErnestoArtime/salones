import { seedPageCategories } from "../pages/pages.data";
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
export class TenantsController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
  ) {}
  @Get("tenants") async tenants(@Req() req: Request) {
    const user = await this.auth.user(req);
    return this.db.tx(
      { user },
      async (db) =>
        (
          await db.query(
            "SELECT t.id,t.name,t.slug,t.plan,t.booking_enabled,t.suspended,m.role FROM salon.tenants t JOIN salon.memberships m ON m.tenant_id=t.id WHERE m.user_id=$1 ORDER BY t.created_at",
            [user.id],
          )
        ).rows,
    );
  }
  @Post("tenants") async onboard(@Req() req: Request, @Body() body: unknown) {
    const user = await this.auth.user(req),
      data = onboarding.parse(body);
    return this.db.tx({ user }, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "onboard:" + user.id,
      ]);
      const count = await db.query(
        "SELECT count(*)::int AS n FROM salon.tenants WHERE created_by=$1",
        [user.id],
      );
      if (count.rows[0].n >= 3)
        throw new BadRequestException(
          "Puedes crear hasta tres salones en prueba. Contacta con soporte para ampliar.",
        );
      const tenant = randomUUID();
      await db.query(
        "INSERT INTO salon.tenants(id,name,slug,created_by) VALUES($1,$2,$3,$4)",
        [tenant, data.name, data.slug, user.id],
      );
      await db.query(
        "INSERT INTO salon.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)",
        [tenant, user.id, "owner"],
      );
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      await db.query(
        "INSERT INTO salon.branches(tenant_id,name,timezone,address) VALUES($1,$2,$3,$4)",
        [tenant, data.branch_name, data.timezone, data.address],
      );
      await seedPageCategories(db, tenant);
      await this.db.audit(db, tenant, user.id, "tenant.created", tenant);
      return { id: tenant };
    });
  }
  @Get("tenants/:tenant/workspace") async workspace(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Query("date") day?: string,
  ) {
    id.parse(tenant);
    const date = z.iso
        .date()
        .parse(day ?? new Date().toISOString().slice(0, 10)),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, [], async (db, role) => {
      const t = (
        await db.query(
          "SELECT id,name,slug,plan,booking_enabled,suspended FROM salon.tenants WHERE id=$1",
          [tenant],
        )
      ).rows[0];
      const branches = (
        await db.query(
          "SELECT id,name,timezone,address FROM salon.branches WHERE tenant_id=$1 ORDER BY name",
          [tenant],
        )
      ).rows;
      const services = (
        await db.query(
          "SELECT * FROM salon.services WHERE tenant_id=$1 ORDER BY name",
          [tenant],
        )
      ).rows;
      const employees = (
        await db.query(
          "SELECT e.*,coalesce((SELECT json_agg(es.service_id) FROM salon.employee_services es WHERE es.employee_id=e.id AND es.tenant_id=e.tenant_id),'[]'::json) AS service_ids FROM salon.employees e WHERE tenant_id=$1 ORDER BY name",
          [tenant],
        )
      ).rows;
      const customers =
        role === "professional"
          ? []
          : (
              await db.query(
                "SELECT id,name,email,phone,notes FROM salon.customers WHERE tenant_id=$1 ORDER BY name LIMIT 2000",
                [tenant],
              )
            ).rows;
      const appointments = (
        await db.query(
          `SELECT a.id,a.branch_id,a.service_id,a.customer_id,a.starts_at,a.ends_at,a.status,a.price_cents,a.currency,a.notes,a.service_name,c.name AS customer_name,e.name AS employee_name,e.id AS employee_id FROM salon.appointments a JOIN salon.customers c ON c.id=a.customer_id AND c.tenant_id=a.tenant_id JOIN salon.employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id JOIN salon.branches b ON b.id=a.branch_id AND b.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND (a.starts_at AT TIME ZONE b.timezone)::date=$2::date AND ($3::boolean=false OR e.user_id=$4) ORDER BY a.starts_at`,
          [tenant, date, role === "professional", user.id],
        )
      ).rows;
      const schedules = (
        await db.query(
          "SELECT id,employee_id,weekday,start_time,end_time FROM salon.schedules WHERE tenant_id=$1 AND ($2::boolean=false OR employee_id IN(SELECT id FROM salon.employees WHERE tenant_id=$1 AND user_id=$3)) ORDER BY weekday,start_time",
          [tenant, role === "professional", user.id],
        )
      ).rows;
      const absences = (
        await db.query(
          "SELECT id,employee_id,starts_at,ends_at,reason FROM salon.absences WHERE tenant_id=$1 AND ends_at>now() AND ($2::boolean=false OR employee_id IN(SELECT id FROM salon.employees WHERE tenant_id=$1 AND user_id=$3)) ORDER BY starts_at",
          [tenant, role === "professional", user.id],
        )
      ).rows;
      return {
        tenant: { ...t, role },
        categories: (await db.query("SELECT id,name,description,fallback_image,featured,photo_asset_id FROM salon.service_categories WHERE tenant_id=$1 ORDER BY sort_order,id", [tenant])).rows,
        branches,
        services,
        employees,
        customers,
        appointments,
        schedules,
        absences,
      };
    });
  }
  @Put("tenants/:tenant/settings") async settings(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const data = z
        .object({
          name: z.string().trim().min(1).max(140),
          booking_enabled: z.boolean(),
        })
        .strict()
        .parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, ["owner"], async (db) => {
      await db.query(
        "UPDATE salon.tenants SET name=$2,booking_enabled=$3 WHERE id=$1",
        [tenant, data.name, data.booking_enabled],
      );
      await this.db.audit(db, tenant, user.id, "tenant.settings", tenant);
      return { ok: true };
    });
  }
  @Post("tenants/:tenant/branches") async branch(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const data = onboarding.omit({ slug: true }).strict().parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, ["owner"], async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "limits:" + tenant,
      ]);
      const { rows } = await db.query(
        "SELECT t.plan,(SELECT count(*)::int FROM salon.branches WHERE tenant_id=t.id) AS total FROM salon.tenants t WHERE id=$1",
        [tenant],
      );
      const max = rows[0].plan === "studio" ? 5 : 1;
      if (rows[0].total >= max)
        throw new ForbiddenException(
          "Tu plan no permite más sedes. Contacta con administración.",
        );
      const branch = (
        await db.query(
          "INSERT INTO salon.branches(tenant_id,name,timezone,address) VALUES($1,$2,$3,$4) RETURNING id",
          [tenant, data.branch_name, data.timezone, data.address],
        )
      ).rows[0];
      await this.db.audit(db, tenant, user.id, "branch.created", branch.id);
      return branch;
    });
  }
}
