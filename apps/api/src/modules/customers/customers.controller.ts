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
export class CustomersController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
  ) {}
  @Post("tenants/:tenant/customers") async createCustomer(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    const data = customerInput.parse(body),
      user = await this.auth.user(req);
    id.parse(tenant);
    return this.db.tenant(user, tenant, DESK, async (db) => {
      const { rows } = await db.query(
        "INSERT INTO salon.customers(tenant_id,name,email,phone,notes) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [tenant, data.name, data.email, data.phone, data.notes],
      );
      await this.db.audit(db, tenant, user.id, "customer.created", rows[0].id);
      return rows[0];
    });
  }
  @Put("tenants/:tenant/customers/:entity") async updateCustomer(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const data = customerInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, DESK, async (db) => {
      const { rowCount } = await db.query(
        "UPDATE salon.customers SET name=$3,email=$4,phone=$5,notes=$6 WHERE tenant_id=$1 AND id=$2",
        [tenant, entity, data.name, data.email, data.phone, data.notes],
      );
      if (!rowCount) throw new NotFoundException();
      await this.db.audit(db, tenant, user.id, "customer.updated", entity);
      return { id: entity };
    });
  }
  @Get("tenants/:tenant/customers/:entity/history") async history(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const user = await this.auth.user(req);
    return this.db.tenant(
      user,
      tenant,
      DESK,
      async (db) =>
        (
          await db.query(
            "SELECT id,service_name,starts_at,status,price_cents,currency FROM salon.appointments WHERE tenant_id=$1 AND customer_id=$2 ORDER BY starts_at DESC LIMIT 100",
            [tenant, entity],
          )
        ).rows,
    );
  }
}
