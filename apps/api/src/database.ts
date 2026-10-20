import {
  Injectable,
  OnModuleDestroy,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Pool, PoolClient } from "pg";
export interface Actor {
  id: string;
  email: string;
}
export interface Context {
  user?: Actor;
  tenant?: string;
  slug?: string;
  platform?: boolean;
  cancellation?: boolean;
  studioWorker?: boolean;
}
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  async onModuleDestroy() {
    await this.pool.end();
  }
  async tx<T>(ctx: Context, fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true),set_config('app.slug',$3,true),set_config('app.public',$4,true),set_config('app.platform_admin',$5,true)`,
        [
          ctx.user?.id ?? "",
          ctx.tenant ?? "",
          ctx.slug ?? "",
          ctx.slug ? "true" : "false",
          ctx.platform ? "true" : "false",
        ],
      );
      await db.query("SELECT set_config('app.cancellation',$1,true)", [
        ctx.cancellation ? "true" : "false",
      ]);
      await db.query("SELECT set_config('app.studio_worker',$1,true)", [
        ctx.studioWorker ? "true" : "false",
      ]);
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async tenant<T>(
    user: Actor,
    id: string,
    roles: string[],
    fn: (db: PoolClient, role: string) => Promise<T>,
  ): Promise<T> {
    return this.tx({ user, tenant: id }, async (db) => {
      const { rows } = await db.query(
        "SELECT m.role,t.suspended FROM salon.memberships m JOIN salon.tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2",
        [id, user.id],
      );
      if (!rows.length)
        throw new NotFoundException("No tienes acceso a este salón.");
      if (rows[0].suspended)
        throw new ForbiddenException(
          "El acceso a este salón está suspendido. Contacta con soporte.",
        );
      if (roles.length && !roles.includes(rows[0].role))
        throw new ForbiddenException("Tu rol no permite esta operación.");
      return fn(db, rows[0].role);
    });
  }
  async public<T>(
    slug: string,
    fn: (db: PoolClient, tenant: any) => Promise<T>,
    cancellation = false,
  ): Promise<T> {
    return this.tx({ slug, cancellation }, async (db) => {
      const { rows } = await db.query(
        "SELECT id,name,slug FROM salon.tenants WHERE slug=$1 AND ((booking_enabled AND NOT suspended) OR $2::boolean)",
        [slug, cancellation],
      );
      if (!rows.length)
        throw new NotFoundException("Este salón no acepta reservas online.");
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [
        rows[0].id,
      ]);
      return fn(db, rows[0]);
    });
  }
  async audit(
    db: PoolClient,
    tenant: string,
    actor: string | null,
    action: string,
    id: string,
  ) {
    await db.query(
      "INSERT INTO salon.audit_log(tenant_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)",
      [tenant, actor, action, id],
    );
  }
}
