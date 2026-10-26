import { randomUUID } from "node:crypto";
export const apiBase = process.env.TEST_API_URL ?? "http://127.0.0.1:8130/api";
export async function api(path, method = "GET", body, cookie = "") {
  const response = await fetch(apiBase + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (response.headers.get("content-type") ?? "").includes("json")
    ? await response.json()
    : await response.text();
  return {
    status: response.status,
    data,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
export async function fixture(admin) {
  const users = [],
    tenants = [],
    cookies = new Map();
  async function actor() {
    const email = "finance-qa-" + randomUUID() + "@example.test",
      password = randomUUID() + "Aa1!";
    const response = await fetch(process.env.AUTH_URL + "/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const u = await response.json();
    if (!u.id) throw new Error("Could not prepare test identity");
    users.push(u.id);
    const login = await api("/auth/login", "POST", { email, password });
    if (login.status !== 201) throw new Error("Test login failed");
    return { id: u.id, email, password, cookie: login.cookie };
  }
  async function salon(owner) {
    const r = await api(
      "/tenants",
      "POST",
      {
        name: "Caja temporal QA",
        slug: "finance-" + randomUUID().slice(0, 12),
        branch_name: "Sede QA",
        timezone: "Europe/Madrid",
        address: "Dirección de pruebas",
      },
      owner.cookie,
    );
    if (r.status !== 201) throw new Error("Test tenant failed");
    tenants.push(r.data.id);
    cookies.set(r.data.id, owner.cookie);
    const w = (
      await api(
        "/tenants/" + r.data.id + "/workspace",
        "GET",
        undefined,
        owner.cookie,
      )
    ).data;
    return { id: r.data.id, branch: w.branches[0].id };
  }
  async function cleanup() {
    for (const tenant of tenants) {
      await admin.query("DELETE FROM salon.virtual_tryons WHERE tenant_id=$1", [
        tenant,
      ]);
      await admin.query("DELETE FROM salon.hairstyles WHERE tenant_id=$1", [
        tenant,
      ]);
      const assets = (
        await admin.query(
          "SELECT id FROM salon.studio_assets WHERE tenant_id=$1 AND deleted_at IS NULL",
          [tenant],
        )
      ).rows;
      for (const asset of assets)
        await api(
          "/tenants/" + tenant + "/studio/assets/" + asset.id,
          "DELETE",
          undefined,
          cookies.get(tenant),
        );
      for (const table of [
        "studio_assets",
        "money_entries",
        "commission_rates",
        "cash_days",
        "studio_settings",
        "audit_log",
        "appointments",
        "employee_services",
        "employees",
        "customers",
        "services",
        "service_categories",
        "salon_pages",
        "page_assets",
        "branches",
        "memberships",
      ])
        await admin.query(
          "DELETE FROM salon." + table + " WHERE tenant_id=$1",
          [tenant],
        );
      await admin.query("DELETE FROM salon.tenants WHERE id=$1", [tenant]);
    }
    for (const user of users)
      await admin.query("DELETE FROM auth.users WHERE id=$1", [user]);
  }
  try {
    const owner = await actor(),
      other = await actor(),
      desk = await actor(),
      professional = await actor();
    const a = await salon(owner),
      b = await salon(other);
    await admin.query(
      "INSERT INTO salon.memberships(tenant_id,user_id,role) VALUES($1,$2,'receptionist'),($1,$3,'professional')",
      [a.id, desk.id, professional.id],
    );
    const service = (
      await api(
        "/tenants/" + a.id + "/services",
        "POST",
        { name: "Cuidado QA", duration_minutes: 30, price_cents: 10000 },
        owner.cookie,
      )
    ).data.id;
    const employee = (
      await api(
        "/tenants/" + a.id + "/employees",
        "POST",
        {
          name: "Profesional caja QA",
          branch_id: a.branch,
          service_ids: [service],
        },
        owner.cookie,
      )
    ).data.id;
    const customer = (
      await api(
        "/tenants/" + a.id + "/customers",
        "POST",
        { name: "Cliente caja QA" },
        owner.cookie,
      )
    ).data.id;
    let index = 0;
    async function appointment(price = 10000) {
      index++;
      return (
        await admin.query(
          "INSERT INTO salon.appointments(tenant_id,branch_id,employee_id,customer_id,service_id,starts_at,ends_at,blocked_until,status,service_name,price_cents,currency,source,request_key,request_hash,cancellation_hash) VALUES($1,$2,$3,$4,$5,now()-interval '10 days'+$6*interval '2 hours',now()-interval '10 days'+$6*interval '2 hours'+interval '30 minutes',now()-interval '10 days'+$6*interval '2 hours'+interval '30 minutes','completed','Cuidado QA',$7,'EUR','internal',$8,'finance-qa','finance-qa') RETURNING id",
          [
            a.id,
            a.branch,
            employee,
            customer,
            service,
            index,
            price,
            randomUUID(),
          ],
        )
      ).rows[0].id;
    }
    return {
      owner,
      other,
      desk,
      professional,
      a,
      b,
      employee,
      service,
      customer,
      appointment,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
