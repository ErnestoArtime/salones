import "dotenv/config";
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const client = new pg.Client({
  connectionString: process.env.ADMIN_DATABASE_URL,
});
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('lavia:migrations'))");
  await client.query(
    "CREATE TABLE IF NOT EXISTS public.lavia_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())",
  );
  await client.query(
    "REVOKE ALL ON public.lavia_migrations FROM PUBLIC, anon, authenticated",
  );
  for (const file of readdirSync("database/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync("database/migrations/" + file, "utf8"),
      hash = createHash("sha256").update(sql).digest("hex");
    const { rows } = await client.query(
      "SELECT checksum FROM public.lavia_migrations WHERE name=$1",
      [file],
    );
    if (rows.length) {
      if (rows[0].checksum !== hash)
        throw Error("Migración modificada: " + file);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO public.lavia_migrations(name,checksum) VALUES($1,$2)",
        [file, hash],
      );
      await client.query("COMMIT");
      console.log("Aplicada " + file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.end();
}
