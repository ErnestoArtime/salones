// Add sample wellness services only to the explicitly identified demo tenant.
import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
const demo = JSON.parse(readFileSync(".local/demo.json", "utf8"));
const db = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtext('lavia:demo-catalog'))");
  const tenant = await db.query("SELECT id FROM salon.tenants WHERE id=$1 AND slug='estudio-demo' AND name='Estudio demo · datos de ejemplo'", [demo.tenant]);
  if (tenant.rowCount !== 1) throw Error("El destino no es el negocio demo esperado");
  for (const [name, category, duration, price] of [
    ["Corte y diseño de barba", "barber", 45, 2800],
    ["Ritual facial", "spa", 60, 4800],
    ["Masaje relajante", "massage", 60, 5500],
  ]) {
    await db.query("INSERT INTO salon.services(tenant_id,name,category,duration_minutes,price_cents) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM salon.services WHERE tenant_id=$1 AND name=$2)", [demo.tenant,name,category,duration,price]);
    await db.query("INSERT INTO salon.employee_services(tenant_id,employee_id,service_id) SELECT s.tenant_id,e.id,s.id FROM salon.services s JOIN salon.employees e ON e.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND s.name=$2 AND e.active ON CONFLICT DO NOTHING", [demo.tenant,name]);
  }
  await db.query("COMMIT");
  console.log("Catálogo demo ampliado; otros negocios intactos.");
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally { await db.end(); }
