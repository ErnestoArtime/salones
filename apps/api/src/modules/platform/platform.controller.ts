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
export class PlatformController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
  ) {}
  @Get("platform/tenants") async platformTenants(@Req() req: Request) {
    const user = await this.auth.user(req);
    this.auth.platform(user);
    return this.db.tx(
      { user, platform: true },
      async (db) =>
        (
          await db.query(
            "SELECT t.id,t.name,t.slug,t.plan,t.suspended,t.created_at,(SELECT count(*)::int FROM salon.memberships m WHERE m.tenant_id=t.id) AS members FROM salon.tenants t ORDER BY t.created_at DESC LIMIT 500",
          )
        ).rows,
    );
  }
  @Put("platform/tenants/:tenant") async platformUpdate(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const data = z
        .object({
          plan: z.enum(["trial", "essential", "studio"]),
          suspended: z.boolean(),
        })
        .strict()
        .parse(body),
      user = await this.auth.user(req);
    this.auth.platform(user);
    return this.db.tx({ user, tenant, platform: true }, async (db) => {
      const { rowCount } = await db.query(
        "UPDATE salon.tenants SET plan=$2,suspended=$3 WHERE id=$1",
        [tenant, data.plan, data.suspended],
      );
      if (!rowCount) throw new NotFoundException();
      await this.db.audit(
        db,
        tenant,
        user.id,
        "platform.tenant_updated",
        tenant,
      );
      return { ok: true };
    });
  }
}
