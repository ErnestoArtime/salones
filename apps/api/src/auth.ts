import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { Request, Response } from "express";
import type { Actor } from "./database";
@Injectable()
export class Auth {
  readonly base = process.env.AUTH_URL ?? "http://127.0.0.1:54321/auth/v1";
  async call(
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
  ): Promise<any> {
    let res: globalThis.Response;
    try {
      res = await fetch(this.base + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new BadRequestException(
        "No se puede conectar con autenticación. Inténtalo de nuevo.",
      );
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new UnauthorizedException(
          "La sesión ha caducado. Vuelve a entrar.",
        );
      throw new BadRequestException(
        path.includes("token")
          ? "No se pudo iniciar sesión. Revisa el correo, la contraseña y la confirmación del correo."
          : "No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.",
      );
    }
    return data;
  }
  async user(req: Request): Promise<Actor> {
    const token = req.cookies?.lavia_access;
    if (!token)
      throw new UnauthorizedException("Inicia sesión para continuar.");
    const user = await this.call("/user", undefined, token);
    if (!user.id || !user.email) throw new UnauthorizedException();
    return { id: user.id, email: user.email };
  }
  cookies(res: Response, data: any) {
    const opts = {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax" as const,
      path: "/api",
    };
    res.cookie("lavia_access", data.access_token, {
      ...opts,
      maxAge: (data.expires_in ?? 3600) * 1000,
    });
    res.cookie("lavia_refresh", data.refresh_token, {
      ...opts,
      maxAge: 30 * 86400 * 1000,
    });
  }
  clear(res: Response) {
    for (const key of ["lavia_access", "lavia_refresh"])
      res.clearCookie(key, {
        path: "/api",
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
      });
  }
  platform(user: Actor) {
    const emails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!emails.includes(user.email.toLowerCase()))
      throw new ForbiddenException(
        "Acceso reservado a la administración de la plataforma.",
      );
  }
}
