import "dotenv/config";
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { DateTime } from "luxon";
const categorySource = new URL("../libs/contracts/src/page.ts", import.meta.url);
const { DEFAULT_SITE_CATEGORIES } = await import(existsSync(categorySource) ? categorySource.href : new URL("../dist/api/libs/contracts/src/page.js", import.meta.url).href);
const file = ".local/demo.json";
if (existsSync(file)) {
  console.log("El acceso demo ya está en " + file + ". No se modifica.");
  process.exit(0);
}
const password = randomBytes(18).toString("base64url") + "Aa1!";
const email = "propietario@lavia.example";
const auth = await fetch(process.env.AUTH_URL + "/admin/users", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + process.env.SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const user = await auth.json();
if (!auth.ok)
  throw Error("No se pudo crear el propietario demo: " + JSON.stringify(user));
const db = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  const tenant = randomUUID(),
    branch = randomUUID();
  await db.query(
    "INSERT INTO salon.tenants(id,name,slug,created_by,plan) VALUES($1,'Estudio demo · datos de ejemplo','estudio-demo',$2,'studio')",
    [tenant, user.id],
  );
  await db.query(
    "INSERT INTO salon.memberships(tenant_id,user_id,role,email) VALUES($1,$2,'owner',$3)",
    [tenant, user.id, email],
  );
  await db.query(
    "INSERT INTO salon.branches(id,tenant_id,name,timezone,address) VALUES($1,$2,'Estudio central','Europe/Madrid','Dirección de ejemplo · Madrid')",
    [branch, tenant],
  );
  for (const [i,c] of DEFAULT_SITE_CATEGORIES.entries()) await db.query("INSERT INTO salon.service_categories(tenant_id,id,name,description,fallback_image,featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)", [tenant,c.id,c.name,c.description,c.fallback_image,c.featured,i]);
  const serviceIds = [];
  for (const [name, duration, price, buffer, category] of [
    ["Corte y acabado", 45, 3200, 0, "hair"],
    ["Color de autor", 90, 7800, 15, "hair"],
    ["Manicura esencial", 45, 2500, 0, "nails"],
    ["Tratamiento capilar", 60, 4500, 0, "hair"],
    ["Diseño de cejas", 30, 1800, 0, "beauty"],
    ["Corte y diseño de barba", 45, 2800, 0, "barber"],
    ["Ritual facial", 60, 4800, 0, "spa"],
    ["Masaje relajante", 60, 5500, 0, "massage"],
  ]) {
    const id = randomUUID();
    serviceIds.push(id);
    await db.query(
      "INSERT INTO salon.services(id,tenant_id,name,duration_minutes,price_cents,buffer_minutes,category) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id, tenant, name, duration, price, buffer, category],
    );
  }
  const employeeIds = [];
  for (const [i, name, color] of [
    [0, "Alba · demo", "plum"],
    [1, "Lucía · demo", "sage"],
    [2, "Carmen · demo", "clay"],
  ]) {
    const employee = randomUUID();
    employeeIds.push(employee);
    await db.query(
      "INSERT INTO salon.employees(id,tenant_id,branch_id,name,color) VALUES($1,$2,$3,$4,$5)",
      [employee, tenant, branch, name, color],
    );
    for (const sid of serviceIds)
      await db.query(
        "INSERT INTO salon.employee_services(tenant_id,employee_id,service_id) VALUES($1,$2,$3)",
        [tenant, employee, sid],
      );
    for (let day = 1; day <= 7; day++)
      await db.query(
        "INSERT INTO salon.schedules(tenant_id,employee_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','20:00')",
        [tenant, employee, day],
      );
  }
  const clients = [];
  for (const name of [
    "Elena · demo",
    "Marina · demo",
    "Sofía · demo",
    "Julia · demo",
    "Ana · demo",
    "Clara · demo",
  ]) {
    const cid = randomUUID();
    clients.push(cid);
    await db.query(
      "INSERT INTO salon.customers(id,tenant_id,name,phone,email) VALUES($1,$2,$3,'600000000','cliente@example.test')",
      [cid, tenant, name],
    );
  }
  const day = DateTime.now().setZone("Europe/Madrid").startOf("day");
  for (const [i, emp, hour, minute] of [
    [0, 0, 9, 0],
    [1, 1, 10, 0],
    [2, 2, 11, 30],
    [3, 0, 13, 0],
    [4, 1, 16, 0],
    [5, 2, 18, 0],
  ]) {
    const start = day.set({ hour, minute }),
      end = start.plus({ minutes: 45 });
    await db.query(
      "INSERT INTO salon.appointments(tenant_id,branch_id,employee_id,customer_id,service_id,starts_at,ends_at,blocked_until,status,service_name,price_cents,currency,source,request_key,request_hash,cancellation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,'Corte y acabado',3200,'EUR','internal',$9,'seed','seed-no-public-token')",
      [
        tenant,
        branch,
        employeeIds[emp],
        clients[i],
        serviceIds[0],
        start.toISO(),
        end.toISO(),
        end.toMillis() < Date.now() ? "completed" : "confirmed",
        randomUUID(),
      ],
    );
  }
  await db.query("COMMIT");
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  writeFileSync(
    file,
    JSON.stringify(
      { email, password, tenant, branch, slug: "estudio-demo" },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  let env = readFileSync(".env", "utf8");
  if (/^PLATFORM_ADMIN_EMAILS=$/m.test(env)) {
    env = env.replace(
      /^PLATFORM_ADMIN_EMAILS=$/m,
      "PLATFORM_ADMIN_EMAILS=" + email,
    );
    writeFileSync(".env", env, { mode: 0o600 });
  }
  console.log(
    "Datos de ejemplo creados. Credenciales privadas en " + file + ".",
  );
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  await db.end();
}
