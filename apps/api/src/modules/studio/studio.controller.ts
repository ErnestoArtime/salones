import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Res,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { Database } from "../../database";
import { Auth } from "../../auth";
import { Booking } from "../../booking";
import { id, bookingInput } from "../../validation";
import { StudioStorage } from "./studio.storage";
import { StudioProvider } from "./studio.provider";
const styleInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).default(""),
    instructions: z.string().trim().min(10).max(1500),
    category: z.enum(["cut", "color", "finish"]),
    target_scope: z.enum(["hair", "beard", "hair_beard"]).default("hair"),
    employee_id: id.optional(),
    service_id: id,
    reference_asset_id: id,
    published: z.boolean().default(false),
  })
  .strict();
@Controller("api/tenants/:tenant/studio")
export class StudioController {
  constructor(
    private db: Database,
    private auth: Auth,
    private storage: StudioStorage,
    private provider: StudioProvider,
    private booking: Booking,
  ) {}
  @Get() async index(@Req() req: Request, @Param("tenant") tenant: string) {
    id.parse(tenant);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, [], async (db, role) => {
      const manage = ["owner", "manager"].includes(role),
        own = role === "professional";
      const styles = (
        await db.query(
          "SELECT h.*,s.name AS service_name,e.name AS employee_name FROM salon.hairstyles h JOIN salon.services s ON s.id=h.service_id AND s.tenant_id=h.tenant_id LEFT JOIN salon.employees e ON e.id=h.employee_id AND e.tenant_id=h.tenant_id JOIN salon.studio_assets a ON a.id=h.reference_asset_id AND a.tenant_id=h.tenant_id WHERE h.tenant_id=$1 AND a.deleted_at IS NULL AND (h.published OR h.created_by=$2 OR $3) ORDER BY h.created_at DESC",
          [tenant, user.id, manage],
        )
      ).rows;
      const jobs = (
        await db.query(
          "SELECT j.id,j.hairstyle_id,j.target_scope,j.beard_hairstyle_id,j.portrait_asset_id,j.result_asset_id,j.customer_id,j.appointment_id,j.status,j.error,j.assessment,j.assessment_notes,j.assessed_at,j.created_at,j.created_by,h.name,h.service_id,h.employee_id FROM salon.virtual_tryons j JOIN salon.hairstyles h ON h.id=j.hairstyle_id AND h.tenant_id=j.tenant_id JOIN salon.studio_assets a ON a.id=j.portrait_asset_id AND a.tenant_id=j.tenant_id WHERE j.tenant_id=$1 AND j.deleted_at IS NULL AND a.deleted_at IS NULL AND a.expires_at>now() AND ($2::boolean=false OR j.created_by=$3) ORDER BY j.created_at DESC LIMIT 50",
          [tenant, own, user.id],
        )
      ).rows;
      const usage = (
        await db.query(
          "SELECT count(*)::int AS total FROM salon.virtual_tryons WHERE tenant_id=$1 AND created_at>=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
          [tenant],
        )
      ).rows[0].total;
      const plan = (
        await db.query("SELECT plan FROM salon.tenants WHERE id=$1", [tenant])
      ).rows[0].plan;
      const settings = (
        await db.query(
          "SELECT enabled,monthly_limit FROM salon.studio_settings WHERE tenant_id=$1",
          [tenant],
        )
      ).rows[0] ?? { enabled: true, monthly_limit: 100 };
      const planLimit =
        plan === "studio" ? 100 : plan === "essential" ? 50 : 10;
      const consumption = (
        await db.query(
          "SELECT status,count(*)::int AS count FROM salon.virtual_tryons WHERE tenant_id=$1 AND created_at>=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') GROUP BY status",
          [tenant],
        )
      ).rows;
      return {
        styles,
        jobs,
        usage,
        limit: Math.min(settings.monthly_limit, planLimit),
        plan_limit: planLimit,
        generation_enabled: settings.enabled,
        consumption,
        remaining: Math.max(
          0,
          Math.min(settings.monthly_limit, planLimit) - usage,
        ),
        provider_ready: this.provider.enabled(),
        provider: this.provider.name,
        provider_id: this.provider.id,
        model: this.provider.model,
        retention_hours: 72,
      };
    });
  }
  @Put("settings") async settings(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = z
      .object({
        enabled: z.boolean(),
        monthly_limit: z.number().int().min(0).max(100),
      })
      .strict()
      .parse(body);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, ["owner", "manager"], async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "studio-quota:" + tenant,
      ]);
      const plan = (
        await db.query("SELECT plan FROM salon.tenants WHERE id=$1", [tenant])
      ).rows[0].plan;
      const cap = plan === "studio" ? 100 : plan === "essential" ? 50 : 10;
      if (input.monthly_limit > cap)
        throw new BadRequestException(
          "El límite no puede superar la cuota del plan.",
        );
      await db.query(
        "INSERT INTO salon.studio_settings(tenant_id,enabled,monthly_limit,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id) DO UPDATE SET enabled=excluded.enabled,monthly_limit=excluded.monthly_limit,updated_by=excluded.updated_by,updated_at=now()",
        [tenant, input.enabled, input.monthly_limit, user.id],
      );
      await this.db.audit(
        db,
        tenant,
        user.id,
        "studio.settings_updated",
        tenant,
      );
      return { ok: true };
    });
  }
  @Put("tryons/:job/assessment") async assess(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("job") job: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(job);
    const input = z
      .object({
        assessment: z.enum(["approved", "rejected"]),
        notes: z.string().trim().max(500).default(""),
      })
      .strict()
      .parse(body);
    const user = await this.auth.user(req);
    return this.db.tenant(
      user,
      tenant,
      ["owner", "manager", "professional"],
      async (db, role) => {
        const j = (
          await db.query(
            "SELECT * FROM salon.virtual_tryons WHERE tenant_id=$1 AND id=$2 AND status='succeeded' AND deleted_at IS NULL FOR UPDATE",
            [tenant, job],
          )
        ).rows[0];
        if (!j)
          throw new NotFoundException(
            "No existe un resultado disponible para revisar.",
          );
        if (role === "professional" && j.created_by !== user.id)
          throw new ForbiddenException();
        if (input.assessment === "rejected" && !input.notes)
          throw new BadRequestException(
            "Indica qué debe mejorar el resultado.",
          );
        const valid = (
          await db.query(
            "SELECT id FROM salon.studio_assets WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND expires_at>now()",
            [tenant, [j.result_asset_id, j.portrait_asset_id]],
          )
        ).rowCount;
        if (valid !== 2)
          throw new ConflictException("La imagen ya no está disponible.");
        await db.query(
          "UPDATE salon.virtual_tryons SET assessment=$3,assessment_notes=$4,assessed_by=$5,assessed_at=now() WHERE tenant_id=$1 AND id=$2",
          [tenant, job, input.assessment, input.notes, user.id],
        );
        await this.db.audit(
          db,
          tenant,
          user.id,
          "studio.result_" + input.assessment,
          job,
        );
        return { ok: true };
      },
    );
  }
  @Post("assets") async upload(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = z
        .object({
          kind: z.enum(["reference", "portrait"]),
          data: z.string().min(20).max(7000000),
          consent: z.literal(true),
        })
        .strict()
        .parse(body),
      user = await this.auth.user(req);
    const encoded = input.data.replace(
        /^data:image\/(jpeg|png|webp);base64,/,
        "",
      ),
      raw = Buffer.from(encoded, "base64");
    if (!raw.length)
      throw new BadRequestException("La fotografía no es válida.");
    const normalized = await this.storage.normalize(raw),
      asset = randomUUID(),
      key = tenant + "/" + asset + ".jpg";
    return this.db.tenant(user, tenant, [], async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "studio-upload:" + tenant,
      ]);
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM salon.studio_assets WHERE tenant_id=$1 AND deleted_at IS NULL AND created_at>now()-interval '1 day'",
          [tenant],
        )
      ).rows[0].n;
      if (count >= 100)
        throw new ForbiddenException(
          "Se ha alcanzado el límite diario de 100 fotografías del salón.",
        );
      await this.storage.put(key, normalized);
      try {
        await db.query(
          "INSERT INTO salon.studio_assets(id,tenant_id,uploaded_by,kind,storage_key,byte_size,expires_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='portrait' THEN now()+interval '72 hours' ELSE now()+interval '24 hours' END)",
          [asset, tenant, user.id, input.kind, key, normalized.length],
        );
        await this.db.audit(
          db,
          tenant,
          user.id,
          "studio.photo_uploaded",
          asset,
        );
      } catch (e) {
        await this.storage.remove(key).catch(() => {});
        throw e;
      }
      return { id: asset };
    });
  }
  @Delete("assets/:asset") async removeAsset(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("asset") asset: string,
  ) {
    id.parse(tenant);
    id.parse(asset);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, [], async (db, role) => {
      const a = (
        await db.query(
          "SELECT * FROM salon.studio_assets WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",
          [tenant, asset],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (a.uploaded_by !== user.id && !["owner", "manager"].includes(role))
        throw new ForbiddenException();
      const refs = (
        await db.query(
          "SELECT 1 FROM salon.virtual_tryons WHERE tenant_id=$1 AND (portrait_asset_id=$2 OR result_asset_id=$2) AND deleted_at IS NULL UNION ALL SELECT 1 FROM salon.hairstyles WHERE tenant_id=$1 AND reference_asset_id=$2",
          [tenant, asset],
        )
      ).rowCount;
      if (refs)
        throw new ConflictException(
          "La fotografía forma parte de un trabajo o prueba. Bórrala desde su historial.",
        );
      await this.storage.remove(a.storage_key);
      await db.query(
        "UPDATE salon.studio_assets SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenant, asset],
      );
      await this.db.audit(db, tenant, user.id, "studio.photo_deleted", asset);
      return { ok: true };
    });
  }
  @Get("assets/:asset") async image(
    @Req() req: Request,
    @Res() res: Response,
    @Param("tenant") tenant: string,
    @Param("asset") asset: string,
  ) {
    id.parse(tenant);
    id.parse(asset);
    const user = await this.auth.user(req);
    const key = await this.db.tenant(user, tenant, [], async (db, role) => {
      const a = (
        await db.query(
          "SELECT * FROM salon.studio_assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
          [asset, tenant],
        )
      ).rows[0];
      if (!a)
        throw new NotFoundException("La fotografía ha caducado o no existe.");
      if (role === "professional" && a.uploaded_by !== user.id) {
        const allowed =
          a.kind === "reference" &&
          (
            await db.query(
              "SELECT id FROM salon.hairstyles WHERE tenant_id=$1 AND reference_asset_id=$2 AND published",
              [tenant, asset],
            )
          ).rowCount;
        if (!allowed) throw new ForbiddenException();
      }
      return a.storage_key;
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", "inline");
    res.send(await this.storage.get(key));
  }
  @Post("styles") async style(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = styleInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(
      user,
      tenant,
      ["owner", "manager", "professional"],
      async (db, role) => {
        if (role === "professional") {
          if (input.published)
            throw new ForbiddenException(
              "El propietario o gerencia publica los estilos.",
            );
          const own = (
            await db.query(
              "SELECT id FROM salon.employees WHERE tenant_id=$1 AND id=$2 AND user_id=$3",
              [tenant, input.employee_id ?? null, user.id],
            )
          ).rowCount;
          if (!own)
            throw new ForbiddenException("Selecciona tu ficha de profesional.");
        }
        const a = (
          await db.query(
            "SELECT id FROM salon.studio_assets WHERE tenant_id=$1 AND id=$2 AND uploaded_by=$3 AND kind='reference' AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
            [tenant, input.reference_asset_id, user.id],
          )
        ).rows[0];
        if (!a)
          throw new BadRequestException(
            "Sube una fotografía de referencia con permiso para utilizarla.",
          );
        if (input.employee_id) {
          const assigned = (
            await db.query(
              "SELECT 1 FROM salon.employee_services WHERE tenant_id=$1 AND employee_id=$2 AND service_id=$3",
              [tenant, input.employee_id, input.service_id],
            )
          ).rowCount;
          if (!assigned)
            throw new BadRequestException(
              "El profesional no realiza ese servicio.",
            );
        }
        const { rows } = await db.query(
          "INSERT INTO salon.hairstyles(tenant_id,employee_id,service_id,reference_asset_id,name,description,instructions,category,published,created_by,target_scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
          [
            tenant,
            input.employee_id ?? null,
            input.service_id,
            input.reference_asset_id,
            input.name,
            input.description,
            input.instructions,
            input.category,
            input.published,
            user.id,
            input.target_scope,
          ],
        );
        await db.query(
          "UPDATE salon.studio_assets SET expires_at=NULL WHERE tenant_id=$1 AND id=$2",
          [tenant, input.reference_asset_id],
        );
        await this.db.audit(
          db,
          tenant,
          user.id,
          "studio.style_created",
          rows[0].id,
        );
        return rows[0];
      },
    );
  }
  @Put("styles/:style/published") async publish(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("style") style: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(style);
    const input = z.object({ published: z.boolean() }).strict().parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, ["owner", "manager"], async (db) => {
      const { rowCount } = await db.query(
        "UPDATE salon.hairstyles SET published=$3 WHERE id=$1 AND tenant_id=$2",
        [style, tenant, input.published],
      );
      if (!rowCount) throw new NotFoundException();
      await this.db.audit(db, tenant, user.id, "studio.style_published", style);
      return { ok: true };
    });
  }
  @Put("styles/:style/scope") async scope(@Req() req: Request, @Param("tenant") tenant: string, @Param("style") style: string, @Body() body: unknown) {
    id.parse(tenant); id.parse(style);
    const input = z.object({target_scope:z.enum(["hair","beard","hair_beard"])}).strict().parse(body);
    const user = await this.auth.user(req);
    return this.db.tenant(user,tenant,["owner","manager"],async db=>{
      const result=await db.query("UPDATE salon.hairstyles SET target_scope=$3 WHERE tenant_id=$1 AND id=$2",[tenant,style,input.target_scope]);
      if(!result.rowCount)throw new NotFoundException();
      await this.db.audit(db,tenant,user.id,"studio.style_scope_changed",style);
      return {ok:true};
    });
  }
  @Post("tryons") async create(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    const input = z
        .object({
          hairstyle_id: id,
          portrait_asset_id: id,
          customer_id: id.optional(),
          external_consent: z.literal(true),
          external_consent_provider: z.enum(["replicate", "runway"]).optional(),
          target_scope: z.enum(["hair", "beard", "hair_beard"]).optional(),
          beard_hairstyle_id: id.optional(),
          request_key: id,
        })
        .strict()
        .parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(user, tenant, [], async (db, role) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "studio-quota:" + tenant,
      ]);
      const hash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const prior = (
        await db.query(
          "SELECT id,request_hash FROM salon.virtual_tryons WHERE tenant_id=$1 AND request_key=$2",
          [tenant, input.request_key],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== hash)
          throw new ConflictException(
            "Este intento ya se utilizó con otros datos.",
          );
        return { id: prior.id };
      }
      if (!this.provider.enabled())
        throw new ServiceUnavailableException(
          "El proveedor de IA todavía no está configurado. Puedes preparar el catálogo y las fotos.",
        );
      if ((input.external_consent_provider ?? "replicate") !== this.provider.id)
        throw new ConflictException(
          "El proveedor de IA ha cambiado. Actualiza la página y confirma el consentimiento para el proveedor indicado.",
        );
      const settings = (
        await db.query(
          "SELECT enabled,monthly_limit FROM salon.studio_settings WHERE tenant_id=$1",
          [tenant],
        )
      ).rows[0] ?? { enabled: true, monthly_limit: 100 };
      if (!settings.enabled)
        throw new ForbiddenException(
          "Las generaciones están pausadas para este salón.",
        );
      const active = (
        await db.query(
          "SELECT count(*)::int AS count FROM salon.virtual_tryons WHERE tenant_id=$1 AND status IN ('queued','running') AND deleted_at IS NULL",
          [tenant],
        )
      ).rows[0].count;
      if (active >= 2)
        throw new ConflictException(
          "Hay dos simulaciones pendientes. Espera a que terminen.",
        );
      const h = (
        await db.query(
          "SELECT h.id,h.target_scope FROM salon.hairstyles h JOIN salon.studio_assets a ON a.tenant_id=h.tenant_id AND a.id=h.reference_asset_id WHERE h.tenant_id=$1 AND h.id=$2 AND h.published AND a.deleted_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())",
          [tenant, input.hairstyle_id],
        )
      ).rows[0];
      if (!h)
        throw new BadRequestException("Elige un estilo publicado del salón.");
      const scope = input.target_scope ?? "hair";
      if (scope !== "hair_beard" && input.beard_hairstyle_id)
        throw new BadRequestException("La segunda referencia solo se usa al simular cabello y barba juntos.");
      if ((scope === "hair" && h.target_scope === "beard") ||
          (scope === "beard" && h.target_scope === "hair") ||
          (scope === "hair_beard" && h.target_scope === "beard"))
        throw new BadRequestException("La referencia no incluye la zona que quieres cambiar.");
      if (scope === "hair_beard") {
        if (input.beard_hairstyle_id) {
          const beard = (await db.query(
            "SELECT h.id FROM salon.hairstyles h JOIN salon.studio_assets a ON a.tenant_id=h.tenant_id AND a.id=h.reference_asset_id WHERE h.tenant_id=$1 AND h.id=$2 AND h.published AND h.target_scope IN ('beard','hair_beard') AND a.deleted_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())",
            [tenant, input.beard_hairstyle_id],
          )).rows[0];
          if (!beard) throw new BadRequestException("Elige una referencia de barba publicada de este salón.");
        } else if (h.target_scope !== "hair_beard")
          throw new BadRequestException("Selecciona también una referencia de barba o usa una referencia marcada como cabello y barba.");
      }
      const photo = (
        await db.query(
          "SELECT id FROM salon.studio_assets WHERE tenant_id=$1 AND id=$2 AND uploaded_by=$3 AND kind='portrait' AND deleted_at IS NULL AND expires_at>now()",
          [tenant, input.portrait_asset_id, user.id],
        )
      ).rows[0];
      if (!photo)
        throw new BadRequestException(
          "La foto no existe, no te pertenece o ha caducado.",
        );
      const plan = (
          await db.query("SELECT plan FROM salon.tenants WHERE id=$1", [tenant])
        ).rows[0].plan,
        limit = Math.min(
          settings.monthly_limit,
          plan === "studio" ? 100 : plan === "essential" ? 50 : 10,
        );
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM salon.virtual_tryons WHERE tenant_id=$1 AND created_at>=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
          [tenant],
        )
      ).rows[0].n;
      if (count >= limit)
        throw new ForbiddenException(
          "Has alcanzado la cuota de simulaciones de este mes.",
        );
      const { rows } = await db.query(
        "INSERT INTO salon.virtual_tryons(tenant_id,created_by,hairstyle_id,portrait_asset_id,customer_id,request_key,request_hash,provider,model,external_consent_at,target_scope,beard_hairstyle_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11) RETURNING id",
        [
          tenant,
          user.id,
          input.hairstyle_id,
          input.portrait_asset_id,
          input.customer_id ?? null,
          input.request_key,
          hash,
          this.provider.id,
          this.provider.model,
          scope,
          input.beard_hairstyle_id ?? null,
        ],
      );
      await this.db.audit(
        db,
        tenant,
        user.id,
        "studio.tryon_requested",
        rows[0].id,
      );
      return rows[0];
    });
  }
  @Post("tryons/:job/appointment") async book(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("job") job: string,
    @Body() body: unknown,
  ) {
    id.parse(tenant);
    id.parse(job);
    const input = bookingInput.parse(body),
      user = await this.auth.user(req);
    return this.db.tenant(
      user,
      tenant,
      ["owner", "manager", "receptionist"],
      async (db) => {
        const j = (
          await db.query(
            "SELECT j.*,h.service_id FROM salon.virtual_tryons j JOIN salon.hairstyles h ON h.id=j.hairstyle_id AND h.tenant_id=j.tenant_id WHERE j.tenant_id=$1 AND j.id=$2 AND j.status='succeeded' AND j.deleted_at IS NULL FOR UPDATE OF j",
            [tenant, job],
          )
        ).rows[0];
        if (!j)
          throw new BadRequestException("Selecciona una simulación terminada.");
        if (
          input.service_id !== j.service_id ||
          (j.customer_id && j.customer_id !== input.customer_id)
        )
          throw new BadRequestException(
            "La cita debe corresponder al servicio y cliente de la simulación.",
          );
        if (j.appointment_id) return { id: j.appointment_id };
        if (j.assessment !== "approved")
          throw new BadRequestException(
            "Revisa y aprueba el resultado antes de preparar la cita.",
          );
        const result = await this.booking.create(
          db,
          tenant,
          input,
          "internal",
          user.id,
        );
        await db.query(
          "UPDATE salon.virtual_tryons SET appointment_id=$3 WHERE tenant_id=$1 AND id=$2",
          [tenant, job, result.id],
        );
        return result;
      },
    );
  }
  @Delete("tryons/:job") async remove(
    @Req() req: Request,
    @Param("tenant") tenant: string,
    @Param("job") job: string,
  ) {
    id.parse(tenant);
    id.parse(job);
    const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, [], async (db, role) => {
      const j = (
        await db.query(
          "SELECT * FROM salon.virtual_tryons WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",
          [tenant, job],
        )
      ).rows[0];
      if (!j) throw new NotFoundException();
      if (role === "professional" && j.created_by !== user.id)
        throw new ForbiddenException();
      const related = (
        await db.query(
          "SELECT * FROM salon.virtual_tryons WHERE tenant_id=$1 AND portrait_asset_id=$2 FOR UPDATE",
          [tenant, j.portrait_asset_id],
        )
      ).rows;
      if (related.some((r) => r.status === "running"))
        throw new ConflictException(
          "Hay una generación en curso. Espera a que termine para borrar las fotografías.",
        );
      const assets = [
        j.portrait_asset_id,
        ...related.map((r) => r.result_asset_id).filter(Boolean),
      ];
      for (const aid of assets) {
        const a = (
          await db.query(
            "SELECT storage_key FROM salon.studio_assets WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
            [tenant, aid],
          )
        ).rows[0];
        if (a) {
          await this.storage.remove(a.storage_key);
          await db.query(
            "UPDATE salon.studio_assets SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
            [tenant, aid],
          );
        }
      }
      await db.query(
        "UPDATE salon.virtual_tryons SET deleted_at=now(),status=CASE WHEN status='queued' THEN 'failed' ELSE status END WHERE tenant_id=$1 AND portrait_asset_id=$2",
        [tenant, j.portrait_asset_id],
      );
      await this.db.audit(db, tenant, user.id, "studio.photos_deleted", job);
      return { ok: true };
    });
  }
}
