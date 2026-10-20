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
export class TeamController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
  ) {}
  @Post("tenants/:tenant/employees") async createEmployee(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    const data = employeeInput.parse(body),
      user = await this.auth.user(req);
    id.parse(tenant);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "limits:" + tenant,
      ]);
      const { rows: limit } = await db.query(
        "SELECT t.plan,(SELECT count(*)::int FROM salon.employees WHERE tenant_id=t.id AND active) AS total FROM salon.tenants t WHERE id=$1",
        [tenant],
      );
      const max =
        limit[0].plan === "studio"
          ? 30
          : limit[0].plan === "essential"
            ? 10
            : 3;
      if (data.active && limit[0].total >= max)
        throw new ForbiddenException(
          "Has alcanzado el límite de profesionales de este plan.",
        );
      const { rows } = await db.query(
        "INSERT INTO salon.employees(tenant_id,branch_id,name,color,active) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [tenant, data.branch_id, data.name, data.color, data.active],
      );
      for (const service of data.service_ids)
        await db.query(
          "INSERT INTO salon.employee_services(tenant_id,employee_id,service_id) VALUES($1,$2,$3)",
          [tenant, rows[0].id, service],
        );
      await this.db.audit(db, tenant, user.id, "employee.created", rows[0].id);
      return rows[0];
    });
  }
  @Put("tenants/:tenant/employees/:entity") async updateEmployee(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const data = employeeInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "limits:" + tenant,
      ]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        entity,
      ]);
      const old = (
        await db.query(
          "SELECT active,branch_id FROM salon.employees WHERE tenant_id=$1 AND id=$2",
          [tenant, entity],
        )
      ).rows[0];
      if (!old) throw new NotFoundException();
      if (data.active && !old.active) {
        const { rows } = await db.query(
          "SELECT t.plan,(SELECT count(*)::int FROM salon.employees WHERE tenant_id=t.id AND active) AS total FROM salon.tenants t WHERE id=$1",
          [tenant],
        );
        const max =
          rows[0].plan === "studio"
            ? 30
            : rows[0].plan === "essential"
              ? 10
              : 3;
        if (rows[0].total >= max)
          throw new ForbiddenException("Has alcanzado el límite del plan.");
      }
      if (old.branch_id !== data.branch_id)
        throw new BadRequestException(
          "Para trasladar un profesional a otra sede, contacta con administración.",
        );
      await db.query(
        "UPDATE salon.employees SET name=$3,color=$4,active=$5 WHERE tenant_id=$1 AND id=$2",
        [tenant, entity, data.name, data.color, data.active],
      );
      await db.query(
        "DELETE FROM salon.employee_services WHERE tenant_id=$1 AND employee_id=$2",
        [tenant, entity],
      );
      for (const service of data.service_ids)
        await db.query(
          "INSERT INTO salon.employee_services(tenant_id,employee_id,service_id) VALUES($1,$2,$3)",
          [tenant, entity, service],
        );
      await this.db.audit(db, tenant, user.id, "employee.updated", entity);
      return { id: entity };
    });
  }
  @Put("tenants/:tenant/schedules") async schedule(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    const data = scheduleInput.parse(body),
      user = await this.auth.user(req);
    id.parse(tenant);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        data.employee_id,
      ]);
      await db.query(
        "DELETE FROM salon.schedules WHERE tenant_id=$1 AND employee_id=$2",
        [tenant, data.employee_id],
      );
      for (const period of data.periods)
        await db.query(
          "INSERT INTO salon.schedules(tenant_id,employee_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)",
          [
            tenant,
            data.employee_id,
            period.weekday,
            period.start_time,
            period.end_time,
          ],
        );
      await this.db.audit(
        db,
        tenant,
        user.id,
        "schedule.updated",
        data.employee_id,
      );
      return { ok: true };
    });
  }
  @Post("tenants/:tenant/absences") async absence(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    const data = absenceInput.parse(body),
      user = await this.auth.user(req);
    id.parse(tenant);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        data.employee_id,
      ]);
      const { rowCount } = await db.query(
        "SELECT 1 FROM salon.appointments WHERE tenant_id=$1 AND employee_id=$2 AND status IN ('confirmed','completed') AND starts_at<$4 AND blocked_until>$3",
        [tenant, data.employee_id, data.starts_at, data.ends_at],
      );
      if (rowCount)
        throw new ConflictException(
          "Hay citas en ese intervalo. Reprográmalas antes de bloquearlo.",
        );
      const { rows } = await db.query(
        "INSERT INTO salon.absences(tenant_id,employee_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [tenant, data.employee_id, data.starts_at, data.ends_at, data.reason],
      );
      await this.db.audit(db, tenant, user.id, "absence.created", rows[0].id);
      return rows[0];
    });
  }
  @Delete("tenants/:tenant/absences/:entity") async removeAbsence(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      const a = (
        await db.query(
          "SELECT employee_id FROM salon.absences WHERE id=$1 AND tenant_id=$2",
          [entity, tenant],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        a.employee_id,
      ]);
      await db.query(
        "DELETE FROM salon.absences WHERE id=$1 AND tenant_id=$2",
        [entity, tenant],
      );
      await this.db.audit(db, tenant, user.id, "absence.removed", entity);
      return { ok: true };
    });
  }
  @Get("tenants/:tenant/members") async members(
    @Req() req: Request,
    @Param("tenant") tenant: string,
  ) {
    id.parse(tenant);
    const user = await this.auth.user(req);
    return this.db.tenant(
      user,
      tenant,
      ["owner"],
      async (db) =>
        (
          await db.query(
            "SELECT m.user_id,m.email,m.role,e.id AS employee_id,e.name AS employee_name FROM salon.memberships m LEFT JOIN salon.employees e ON e.tenant_id=m.tenant_id AND e.user_id=m.user_id WHERE m.tenant_id=$1 ORDER BY m.role,m.email",
            [tenant],
          )
        ).rows,
    );
  }
  @Post("tenants/:tenant/members") async addMember(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const data = z
        .object({
          email: z.email().max(254),
          role: z.enum(["manager", "receptionist", "professional"]),
          employee_id: id.optional(),
        })
        .strict()
        .parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, ["owner"], async (db) => {
      const uid = (
        await db.query("SELECT salon.find_confirmed_user($1) AS id", [
          data.email,
        ])
      ).rows[0].id;
      if (!uid)
        throw new BadRequestException(
          "Esta persona debe registrarse y confirmar su correo antes de recibir acceso.",
        );
      if (uid === user.id)
        throw new BadRequestException("Tu cuenta ya es propietaria del salón.");
      if (data.role === "professional" && !data.employee_id)
        throw new BadRequestException("Vincula la cuenta a un profesional.");
      await db.query(
        "INSERT INTO salon.memberships(tenant_id,user_id,role,email) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role,email=excluded.email",
        [tenant, uid, data.role, data.email],
      );
      await db.query(
        "UPDATE salon.employees SET user_id=NULL WHERE tenant_id=$1 AND user_id=$2",
        [tenant, uid],
      );
      if (data.role === "professional") {
        const { rowCount } = await db.query(
          "UPDATE salon.employees SET user_id=$3 WHERE tenant_id=$1 AND id=$2 AND (user_id IS NULL OR user_id=$3)",
          [tenant, data.employee_id, uid],
        );
        if (!rowCount)
          throw new BadRequestException(
            "Este profesional no existe o ya tiene otra cuenta vinculada.",
          );
      }
      await this.db.audit(db, tenant, user.id, "member.updated", uid);
      return { ok: true };
    });
  }
  @Delete("tenants/:tenant/members/:uid") async removeMember(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("uid") uid: string,
  ) {
    id.parse(tenant);
    id.parse(uid);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, ["owner"], async (db) => {
      if (uid === user.id)
        throw new BadRequestException(
          "No puedes quitar tu acceso de propietario.",
        );
      await db.query(
        "DELETE FROM salon.memberships WHERE tenant_id=$1 AND user_id=$2 AND role<>'owner'",
        [tenant, uid],
      );
      await db.query(
        "UPDATE salon.employees SET user_id=NULL WHERE tenant_id=$1 AND user_id=$2",
        [tenant, uid],
      );
      await this.db.audit(db, tenant, user.id, "member.removed", uid);
      return { ok: true };
    });
  }
}
