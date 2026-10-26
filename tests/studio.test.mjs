import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import pg from "pg";
const base = process.env.TEST_API_URL ?? "http://localhost:8130/api",
  admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
async function api(path, method = "GET", body, cookie = "") {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    data: (res.headers.get("content-type") ?? "").includes("image/")
      ? Buffer.from(await res.arrayBuffer())
      : await res.json(),
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
test("Virtual Studio: fotos privadas, catálogo, cola y cita vinculada", async (t) => {
  await admin.connect();
  let uid, tid, other, cookie;
  const password = randomUUID() + "Aa1!",
    email = "studio-" + randomUUID() + "@example.test";
  try {
    const auth = await fetch(process.env.AUTH_URL + "/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    uid = (await auth.json()).id;
    assert.ok(uid);
    cookie = (await api("/auth/login", "POST", { email, password })).cookie;
    for (const n of [1, 2]) {
      const result = await api(
        "/tenants",
        "POST",
        {
          name: "Studio test " + n,
          slug: "studio-test-" + randomUUID().slice(0, 8),
          branch_name: "Principal",
          timezone: "Europe/Madrid",
          address: "",
        },
        cookie,
      );
      assert.equal(result.status, 201, JSON.stringify(result.data));
      if (n === 1) tid = result.data.id;
      else other = result.data.id;
    }
    const root = "/tenants/" + tid + "/studio";
    const workspace = (
      await api("/tenants/" + tid + "/workspace", "GET", undefined, cookie)
    ).data;
    const service = (
      await api(
        "/tenants/" + tid + "/services",
        "POST",
        { name: "Corte prueba", duration_minutes: 45, price_cents: 2000 },
        cookie,
      )
    ).data.id;
    const employee = (
      await api(
        "/tenants/" + tid + "/employees",
        "POST",
        {
          name: "Profesional prueba",
          branch_id: workspace.branches[0].id,
          service_ids: [service],
        },
        cookie,
      )
    ).data.id;
    await api(
      "/tenants/" + tid + "/schedules",
      "PUT",
      {
        employee_id: employee,
        periods: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          start_time: "09:00",
          end_time: "19:00",
        })),
      },
      cookie,
    );
    const customer = (
      await api(
        "/tenants/" + tid + "/customers",
        "POST",
        { name: "Cliente sintético" },
        cookie,
      )
    ).data.id;
    const bytes = await sharp(randomBytes(512 * 512 * 3), {
      raw: { width: 512, height: 512, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .withMetadata({ exif: { IFD0: { Artist: "PRIVATE TEST METADATA" } } })
      .toBuffer();
    const data = "data:image/jpeg;base64," + bytes.toString("base64");
    let reference, portrait, style, job;
    await t.test("consentimiento y validación real de imágenes", async () => {
      assert.equal(
        (
          await api(
            root + "/assets",
            "POST",
            { kind: "portrait", data, consent: false },
            cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await api(
            root + "/assets",
            "POST",
            {
              kind: "portrait",
              data: "invalid-image-content!!!",
              consent: true,
            },
            cookie,
          )
        ).status,
        400,
      );
      const r = await api(
        root + "/assets",
        "POST",
        { kind: "reference", data, consent: true },
        cookie,
      );
      assert.equal(r.status, 201, JSON.stringify(r.data));
      reference = r.data.id;
      const p = await api(
        root + "/assets",
        "POST",
        { kind: "portrait", data, consent: true },
        cookie,
      );
      assert.equal(p.status, 201, JSON.stringify(p.data));
      portrait = p.data.id;
      const image = await api(
        root + "/assets/" + portrait,
        "GET",
        undefined,
        cookie,
      );
      assert.equal(image.status, 200);
      assert.equal((await sharp(image.data).metadata()).exif, undefined);
    });
    await t.test(
      "fotos inaccesibles sin sesión o desde otro tenant",
      async () => {
        assert.equal((await api(root + "/assets/" + portrait)).status, 401);
        assert.equal(
          (
            await api(
              "/tenants/" + other + "/studio/assets/" + portrait,
              "GET",
              undefined,
              cookie,
            )
          ).status,
          404,
        );
        const s = await api(
          root + "/styles",
          "POST",
          {
            name: "Trabajo sintético de test",
            instructions: "Adaptar únicamente el cabello con capas suaves.",
            category: "cut",
            service_id: service,
            employee_id: employee,
            reference_asset_id: reference,
            published: true,
          },
          cookie,
        );
        assert.equal(s.status, 201, JSON.stringify(s.data));
        style = s.data.id;
        assert.equal(
          (
            await api(
              root + "/assets/" + reference,
              "DELETE",
              undefined,
              cookie,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "sin clave no simula una generación ni consume cuota",
      async () => {
        const current = await api(root, "GET", undefined, cookie);
        if (!current.data.provider_ready) {
          const result = await api(
            root + "/tryons",
            "POST",
            {
              hairstyle_id: style,
              portrait_asset_id: portrait,
              customer_id: customer,
              external_consent: true,
              request_key: randomUUID(),
            },
            cookie,
          );
          assert.equal(result.status, 503);
          assert.equal(
            (await api(root, "GET", undefined, cookie)).data.usage,
            0,
          );
        }
      },
    );
    await t.test('controles de generación y consumo sin revelar credenciales',async()=>{
      assert.equal((await api(root+'/settings','PUT',{enabled:false,monthly_limit:2},cookie)).status,200);
      const paused=(await api(root,'GET',undefined,cookie)).data;assert.equal(paused.generation_enabled,false);assert.equal(paused.limit,2);assert.equal(paused.remaining,2);assert.equal(paused.plan_limit,10);
      assert.equal((await api(root+'/settings','PUT',{enabled:true,monthly_limit:11},cookie)).status,400);
      assert.equal((await api(root+'/settings','PUT',{enabled:true,monthly_limit:2},cookie)).status,200);
    });
    await t.test('límite concurrente y pausa validados con PostgreSQL y proveedor sintético',async()=>{
      const script=`const {Database}=require('./dist/api/apps/api/src/database.js');const {StudioController}=require('./dist/api/apps/api/src/modules/studio/studio.controller.js');const {randomUUID}=require('node:crypto');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{const p=JSON.parse(input);const db=new Database();const controller=new StudioController(db,{user:async()=>({id:p.user,email:'synthetic@example.test'})},{},{enabled:()=>true,model:'test-only'},{});const bodies=Array.from({length:4},()=>({...p.body,request_key:randomUUID()}));try{const results=await Promise.all(bodies.map(body=>controller.create({},p.tenant,body).then(value=>({ok:true,id:value.id})).catch(e=>({ok:false,status:e.getStatus?.()}))));const first=results.findIndex(r=>r.ok);await controller.settings({},p.tenant,{enabled:false,monthly_limit:2});const retry=await controller.create({},p.tenant,bodies[first]);let paused;try{await controller.create({},p.tenant,{...p.body,request_key:randomUUID()});}catch(e){paused=e.getStatus?.();}console.log(JSON.stringify({results,retry:retry.id,first:results[first].id,paused}));}finally{await db.onModuleDestroy();}});`;
      const run=spawnSync('docker',['compose','exec','-T','api','node','-e',script],{input:JSON.stringify({tenant:tid,user:uid,body:{hairstyle_id:style,portrait_asset_id:portrait,external_consent:true}}),encoding:'utf8',timeout:20000});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim());assert.equal(result.results.filter(r=>r.ok).length,2);assert.equal(result.retry,result.first);assert.equal(result.paused,403);
      const ids=result.results.filter(r=>r.ok).map(r=>r.id);await admin.query('DELETE FROM salon.virtual_tryons WHERE tenant_id=$1 AND id=ANY($2::uuid[])',[tid,ids]);
      assert.equal((await api(root+'/settings','PUT',{enabled:true,monthly_limit:2},cookie)).status,200);
    });
    await t.test(
      "worker con proveedor sintético aislado guarda un resultado privado",
      async () => {
        job = randomUUID();
        await admin.query(
          "INSERT INTO salon.virtual_tryons(id,tenant_id,created_by,hairstyle_id,portrait_asset_id,customer_id,request_key,request_hash,provider,model,external_consent_at) VALUES($1,$2,$3,$4,$5,$6,$7,'test-only','test-only','test-only',now())",
          [job, tid, uid, style, portrait, customer, randomUUID()],
        );
        const script = `const {Database}=require('./dist/api/apps/api/src/database.js');const {StudioStorage}=require('./dist/api/apps/api/src/modules/studio/studio.storage.js');const {StudioWorker}=require('./dist/api/apps/api/src/modules/studio/studio.worker.js');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{const tenant=JSON.parse(input).tenant;const db=new Database();const tx=db.tx.bind(db);db.tx=(ctx,fn)=>ctx.platform?Promise.resolve([{id:tenant,suspended:false}]):tx(ctx,fn);const provider={enabled:()=>true,render:async portrait=>portrait};try{await new StudioWorker(db,provider,new StudioStorage()).tick();}finally{await db.onModuleDestroy();}});`;
        await api(root+'/settings','PUT',{enabled:false,monthly_limit:2},cookie);
        const pausedWorker=spawnSync('docker',['compose','exec','-T','api','node','-e',script],{input:JSON.stringify({tenant:tid}),encoding:'utf8',timeout:20000});assert.equal(pausedWorker.status,0,pausedWorker.stderr);
        assert.equal((await admin.query('SELECT status FROM salon.virtual_tryons WHERE id=$1',[job])).rows[0].status,'queued');
        await api(root+'/settings','PUT',{enabled:true,monthly_limit:2},cookie);
        const result = spawnSync(
          "docker",
          ["compose", "exec", "-T", "api", "node", "-e", script],
          {
            input: JSON.stringify({ tenant: tid }),
            encoding: "utf8",
            timeout: 20000,
          },
        );
        assert.equal(result.status, 0, result.stderr);
        const stored = (
          await admin.query(
            "SELECT status,result_asset_id,error FROM salon.virtual_tryons WHERE id=$1",
            [job],
          )
        ).rows[0];
        assert.equal(stored.status, "succeeded", JSON.stringify(stored));
        assert.equal(
          (
            await api(
              root + "/assets/" + stored.result_asset_id,
              "GET",
              undefined,
              cookie,
            )
          ).status,
          200,
        );
      },
    );
    await t.test(
      "simulación vinculada a una reserva sin duplicarla",
      async () => {
        const day = new Date(Date.now() + 4 * 86400000)
          .toISOString()
          .slice(0, 10);
        const q = new URLSearchParams({
          branch_id: workspace.branches[0].id,
          employee_id: employee,
          service_id: service,
          date: day,
        });
        const slots = (
          await api("/tenants/" + tid + "/slots?" + q, "GET", undefined, cookie)
        ).data;
        const body = {
          branch_id: workspace.branches[0].id,
          employee_id: employee,
          service_id: service,
          customer_id: customer,
          starts_at: slots[0],
          request_key: randomUUID(),
        };
        const blocked=await api(root+'/tryons/'+job+'/appointment','POST',body,cookie);assert.equal(blocked.status,400);
        assert.equal((await api(root+'/tryons/'+job+'/assessment','PUT',{assessment:'rejected',notes:'Prueba sintética: revisar el cabello.'},cookie)).status,200);
        assert.equal((await api(root+'/tryons/'+job+'/assessment','PUT',{assessment:'approved',notes:'Validación de flujo con imagen sintética.'},cookie)).status,200);
        const a = await api(
          root + "/tryons/" + job + "/appointment",
          "POST",
          body,
          cookie,
        );
        assert.equal(a.status, 201, JSON.stringify(a.data));
        const again = await api(
          root + "/tryons/" + job + "/appointment",
          "POST",
          body,
          cookie,
        );
        assert.equal(again.data.id, a.data.id);
      },
    );
    await t.test(
      "borrado elimina fotos del almacenamiento activo y conserva consumo",
      async () => {
        const result = (
          await admin.query(
            "SELECT result_asset_id FROM salon.virtual_tryons WHERE id=$1",
            [job],
          )
        ).rows[0].result_asset_id;
        assert.equal(
          (await api(root + "/tryons/" + job, "DELETE", undefined, cookie))
            .status,
          200,
        );
        assert.equal(
          (await api(root + "/assets/" + portrait, "GET", undefined, cookie))
            .status,
          404,
        );
        assert.equal(
          (await api(root + "/assets/" + result, "GET", undefined, cookie))
            .status,
          404,
        );
        const current = await api(root, "GET", undefined, cookie);
        assert.equal(current.data.jobs.length, 0);
        assert.equal(current.data.usage, 1);
      },
    );
  } finally {
    for (const tenant of [tid, other].filter(Boolean)) {
      const assets = (
        await admin.query(
          "SELECT id FROM salon.studio_assets WHERE tenant_id=$1",
          [tenant],
        )
      ).rows;
      await admin.query("DELETE FROM salon.virtual_tryons WHERE tenant_id=$1", [
        tenant,
      ]);
      await admin.query("DELETE FROM salon.hairstyles WHERE tenant_id=$1", [
        tenant,
      ]);
      for (const a of assets)
        await api(
          "/tenants/" + tenant + "/studio/assets/" + a.id,
          "DELETE",
          undefined,
          cookie,
        ).catch(() => {});
      for (const table of [
        "studio_assets",
        "studio_settings",
        "audit_log",
        "appointments",
        "absences",
        "schedules",
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
    if (uid) await admin.query("DELETE FROM auth.users WHERE id=$1", [uid]);
    await admin.end();
  }
});
