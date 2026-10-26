import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Database } from "../../database";
import { StudioProvider } from "./studio.provider";
import { StudioStorage } from "./studio.storage";
@Injectable()
export class StudioWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stop = new AbortController();
  constructor(
    private db: Database,
    private provider: StudioProvider,
    private storage: StudioStorage,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 10000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    this.stop.abort();
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const tenants = await this.db.tx(
        { platform: true },
        async (db) =>
          (await db.query("SELECT id,suspended FROM salon.tenants")).rows,
      );
      for (const tenant of tenants) {
        const ctx = { tenant: tenant.id, studioWorker: true };
        // A crashed/timed-out dispatch is never automatically sent again: that could double-charge.
        await this.db.tx(ctx, (db) =>
          db.query(
            "UPDATE salon.virtual_tryons SET status='failed',error='La tarea se interrumpió. Comprueba el consumo del proveedor antes de repetirla.',finished_at=now() WHERE tenant_id=$1 AND status='running' AND started_at<now()-interval '6 minutes'",
            [tenant.id],
          ),
        );
        const expired = await this.db.tx(
          ctx,
          async (db) =>
            (
              await db.query(
                "SELECT id,storage_key FROM salon.studio_assets WHERE tenant_id=$1 AND deleted_at IS NULL AND expires_at<now() LIMIT 25",
                [tenant.id],
              )
            ).rows,
        );
        for (const asset of expired) {
          await this.storage.remove(asset.storage_key);
          await this.db.tx(ctx, (db) =>
            db.query(
              "UPDATE salon.studio_assets SET deleted_at=now() WHERE id=$1 AND tenant_id=$2",
              [asset.id, tenant.id],
            ),
          );
        }
        await this.db.tx(ctx, (db) =>
          db.query(
            "UPDATE salon.virtual_tryons j SET status='failed',error='La fotografía de entrada ya no está disponible. Prepara una nueva prueba.',finished_at=now() WHERE tenant_id=$1 AND status='queued' AND (NOT EXISTS(SELECT 1 FROM salon.studio_assets a WHERE a.tenant_id=j.tenant_id AND a.id=j.portrait_asset_id AND a.deleted_at IS NULL AND a.expires_at>now()) OR NOT EXISTS(SELECT 1 FROM salon.hairstyles h JOIN salon.studio_assets r ON r.tenant_id=h.tenant_id AND r.id=h.reference_asset_id WHERE h.tenant_id=j.tenant_id AND h.id=j.hairstyle_id AND r.deleted_at IS NULL))",
            [tenant.id],
          ),
        );
        const setting = await this.db.tx(
          ctx,
          async (db) =>
            (
              await db.query(
                "SELECT enabled FROM salon.studio_settings WHERE tenant_id=$1",
                [tenant.id],
              )
            ).rows[0],
        );
        if (setting?.enabled === false) continue;
        if (
          !this.provider.enabled() ||
          tenant.suspended ||
          this.stop.signal.aborted
        )
          continue;
        const job = await this.db.tx(ctx, async (db) => {
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["studio-quota:" + tenant.id],
          );
          const row = (
            await db.query(
              "SELECT j.*,h.instructions,h.reference_asset_id,p.storage_key AS portrait_key,r.storage_key AS reference_key FROM salon.virtual_tryons j JOIN salon.hairstyles h ON h.id=j.hairstyle_id AND h.tenant_id=j.tenant_id JOIN salon.studio_assets p ON p.id=j.portrait_asset_id AND p.tenant_id=j.tenant_id JOIN salon.studio_assets r ON r.id=h.reference_asset_id AND r.tenant_id=h.tenant_id WHERE j.tenant_id=$1 AND j.status='queued' AND coalesce((SELECT enabled FROM salon.studio_settings WHERE tenant_id=$1),true) AND j.deleted_at IS NULL AND p.deleted_at IS NULL AND r.deleted_at IS NULL AND p.expires_at>now() ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1",
              [tenant.id],
            )
          ).rows[0];
          if (row)
            await db.query(
              "UPDATE salon.virtual_tryons SET status='running',started_at=now() WHERE id=$1 AND tenant_id=$2",
              [row.id, tenant.id],
            );
          return row;
        });
        if (job) {
          try {
            const [portrait, reference] = await Promise.all([
              this.storage.get(job.portrait_key),
              this.storage.get(job.reference_key),
            ]);
            const rendered = await this.provider.render(
              portrait,
              reference,
              job.instructions,
              AbortSignal.any([this.stop.signal, AbortSignal.timeout(240000)]),
              job.model,
            );
            const bytes = await this.storage.normalize(rendered),
              assetId = randomUUID(),
              key = tenant.id + "/" + assetId + ".jpg";
            await this.storage.put(key, bytes);
            try {
              await this.db.tx(ctx, async (db) => {
                await db.query(
                  "INSERT INTO salon.studio_assets(id,tenant_id,uploaded_by,kind,storage_key,byte_size,expires_at) VALUES($1,$2,$3,'result',$4,$5,now()+interval '72 hours')",
                  [assetId, tenant.id, job.created_by, key, bytes.length],
                );
                const saved = await db.query(
                  "UPDATE salon.virtual_tryons SET status='succeeded',result_asset_id=$3,finished_at=now() WHERE id=$1 AND tenant_id=$2 AND status='running'",
                  [job.id, tenant.id, assetId],
                );
                if (saved.rowCount !== 1)
                  throw new Error("The job no longer accepts a result");
              });
            } catch (e) {
              await this.storage.remove(key).catch(() => {});
              throw e;
            }
          } catch {
            await this.db.tx(ctx, (db) =>
              db.query(
                "UPDATE salon.virtual_tryons SET status='failed',error='No se obtuvo una simulación. Puede haber consumo en el proveedor; revísalo antes de repetir.',finished_at=now() WHERE id=$1 AND tenant_id=$2",
                [job.id, tenant.id],
              ),
            );
          }
        }
      }
    } catch (e) {
      console.error("Virtual Studio worker:", (e as Error).name);
    } finally {
      this.busy = false;
    }
  }
}
