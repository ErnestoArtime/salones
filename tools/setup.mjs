import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, createHmac } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env ya existe; se conserva.");
  process.exit(0);
}
const secret = randomBytes(48).toString("hex");
const jwt = (role) => {
  const b = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const input =
    b({ alg: "HS256", typ: "JWT" }) +
    "." +
    b({
      role,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400,
    });
  return (
    input + "." + createHmac("sha256", secret).update(input).digest("base64url")
  );
};
const pg = randomBytes(32).toString("hex"),
  app = randomBytes(32).toString("hex");
let env = readFileSync(".env.example", "utf8")
  .replaceAll("POSTGRES_PASSWORD=generated-by-setup", "POSTGRES_PASSWORD=" + pg)
  .replaceAll("APP_DB_PASSWORD=generated-by-setup", "APP_DB_PASSWORD=" + app)
  .replace("JWT_SECRET=generated-by-setup", "JWT_SECRET=" + secret)
  .replace("ANON_KEY=generated-by-setup", "ANON_KEY=" + jwt("anon"))
  .replace(
    "SERVICE_ROLE_KEY=generated-by-setup",
    "SERVICE_ROLE_KEY=" + jwt("service_role"),
  )
  .replace("salon_api:generated-by-setup", "salon_api:" + app)
  .replace("postgres:generated-by-setup", "postgres:" + pg);
writeFileSync(".env", env, { mode: 0o600 });
console.log(".env creado con secretos aleatorios. No lo subas a Git.");
