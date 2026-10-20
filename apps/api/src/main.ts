import "reflect-metadata";
import { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";
import { domainModules } from "./modules";
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500,
      message = "No se pudo completar la operación. Inténtalo de nuevo.";
    if (error instanceof ZodError) {
      status = 400;
      message = error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join(" · ");
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
    } else if (error.code === "23P01") {
      status = 409;
      message =
        "El horario se solapa con otra cita o tramo. Elige otro intervalo.";
    } else if (error.code === "23505") {
      status = 409;
      message = "Ya existe un registro con esos datos.";
    } else if (error.code === "23503") {
      status = 400;
      message = "Uno de los registros no pertenece al salón o ya no existe.";
    }
    if (status === 500)
      console.error("API error", error.code ?? error.name, error.message);
    res.status(status).json({ statusCode: status, message });
  }
}
@Module({ imports: domainModules })
class AppModule {}
async function main() {
  if (
    !process.env.DATABASE_URL ||
    !process.env.JWT_SECRET ||
    !process.env.AUTH_URL
  )
    throw Error("Faltan DATABASE_URL, JWT_SECRET o AUTH_URL");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.useBodyParser("json", { limit: "7mb" });
  app.use(helmet({ contentSecurityPolicy: false }), cookieParser());
  const allowed = new Set(
    [
      process.env.PUBLIC_URL,
      "http://localhost:4300",
      "http://localhost:4301",
      "http://localhost:4302",
      "http://127.0.0.1:4300",
      "http://127.0.0.1:4301",
      "http://127.0.0.1:4302",
    ].filter(Boolean),
  );
  const buckets = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin,
        site = req.headers["sec-fetch-site"];
      if (
        (origin && !allowed.has(origin)) ||
        (!origin && site === "cross-site")
      )
        return res.status(403).json({ message: "Origen no permitido." });
    }
    const category = req.path.startsWith("/api/auth/")
      ? "auth"
      : req.path.startsWith("/api/public/") && req.method === "POST"
        ? "booking"
        : "general";
    const key =
        (req.ip ?? req.socket.remoteAddress ?? "unknown") + ":" + category,
      now = Date.now();
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    const entry = buckets.get(key);
    const limit = category === "auth" ? 35 : category === "booking" ? 30 : 250;
    const bucket =
      entry && entry.until > now ? entry : { count: 0, until: now + 60000 };
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      res.setHeader("Retry-After", Math.ceil((bucket.until - now) / 1000));
      return res
        .status(429)
        .json({ message: "Demasiadas solicitudes. Espera un minuto." });
    }
    next();
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4310), "0.0.0.0");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
