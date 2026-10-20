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
export class CatalogController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
  ) {}
  @Post("tenants/:tenant/services") async createService(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    const data = serviceInput.parse(body),
      user = await this.auth.user(req);
    id.parse(tenant);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await db.query("SELECT id FROM salon.tenants WHERE id=$1 FOR UPDATE", [tenant]);
      const { rows } = await db.query(
        "INSERT INTO salon.services(tenant_id,name,duration_minutes,buffer_minutes,price_cents,currency,active,category,description,photo_asset_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
        [
          tenant,
          data.name,
          data.duration_minutes,
          data.buffer_minutes,
          data.price_cents,
          data.currency,
          data.active,
          data.category ?? "other",
          data.description ?? "",
          data.photo_asset_id ?? null,
        ],
      );
      await this.db.audit(db, tenant, user.id, "service.created", rows[0].id);
      return rows[0];
    });
  }
  @Put("tenants/:tenant/services/:entity") async updateService(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("entity") entity: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(entity);
    const data = serviceInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, MANAGE, async (db) => {
      await db.query("SELECT id FROM salon.tenants WHERE id=$1 FOR UPDATE", [tenant]);
      const { rowCount } = await db.query(
        "UPDATE salon.services SET name=$3,duration_minutes=$4,buffer_minutes=$5,price_cents=$6,currency=$7,active=$8,category=coalesce($9,category),description=coalesce($10,description),photo_asset_id=CASE WHEN $12 THEN $11::uuid ELSE photo_asset_id END WHERE tenant_id=$1 AND id=$2",
        [
          tenant,
          entity,
          data.name,
          data.duration_minutes,
          data.buffer_minutes,
          data.price_cents,
          data.currency,
          data.active,
          data.category,
          data.description,
          data.photo_asset_id ?? null,
          data.photo_asset_id !== undefined,
        ],
      );
      if (!rowCount) throw new NotFoundException();
      await this.db.audit(db, tenant, user.id, "service.updated", entity);
      return { id: entity };
    });
  }
}
