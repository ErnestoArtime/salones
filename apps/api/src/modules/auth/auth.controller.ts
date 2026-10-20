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
export class AuthController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
  ) {}
  @Get("health") async health() {
    await this.db.pool.query("SELECT 1");
    return { status: "ok", service: "lavia-api" };
  }
  @Post("auth/login") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = credentials.parse(body);
    const session = await this.auth.call("/token?grant_type=password", data);
    this.auth.cookies(res, session);
    res.setHeader("Cache-Control", "no-store");
    return { user: { id: session.user.id, email: session.user.email } };
  }
  @Post("auth/register") async register(@Body() body: unknown) {
    const data = credentials.parse(body);
    await this.auth.call("/signup", data);
    return {
      message:
        "Revisa tu correo para confirmar la cuenta. Después podrás entrar.",
    };
  }
  @Post("auth/recover") async recover(@Body() body: unknown) {
    const data = z
      .object({ email: z.email().max(254) })
      .strict()
      .parse(body);
    await this.auth.call(
      "/recover?redirect_to=" +
        encodeURIComponent(process.env.PUBLIC_URL ?? ""),
      data,
    );
    return {
      message:
        "Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.",
    };
  }
  @Post("auth/password") async resetPassword(@Body() body: unknown) {
    const data = z
      .object({
        token: z.string().min(50).max(8000),
        password: z.string().min(10).max(128),
      })
      .strict()
      .parse(body);
    await this.auth.call("/user", undefined, data.token);
    await this.auth.call(
      "/user",
      { password: data.password },
      data.token,
      "PUT",
    );
    return { message: "Contraseña actualizada. Ya puedes entrar." };
  }
  @Post("auth/refresh") async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.cookies?.lavia_refresh)
      throw new ForbiddenException("Inicia sesión.");
    const session = await this.auth.call("/token?grant_type=refresh_token", {
      refresh_token: req.cookies.lavia_refresh,
    });
    this.auth.cookies(res, session);
    return { ok: true };
  }
  @Post("auth/logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.lavia_access;
    this.auth.clear(res);
    if (token)
      await this.auth.call("/logout", {}, token).catch(() => undefined);
    return { ok: true };
  }
  @Get("me") async me(@Req() req: Request) {
    return this.auth.user(req);
  }
}
