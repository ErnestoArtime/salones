import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fixture, api } from "./helpers/finance-fixture.mjs";

test("Estudio: alcances y referencias de barba autorizadas, con idempotencia y FK entre salones", async () => {
  if (process.env.REPLICATE_API_TOKEN || process.env.RUNWAYML_API_SECRET)
    throw new Error(
      "Esta prueba requiere el entorno aislado sin claves de IA.",
    );
  const db = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  await db.connect();
  let f;
  try {
    f = await fixture(db);
    const data =
      "data:image/jpeg;base64," +
      fs
        .readFileSync("tests/fixtures/fictitious-portrait.jpg")
        .toString("base64");
    const root = "/tenants/" + f.a.id + "/studio";
    const reference = await api(
      root + "/assets",
      "POST",
      { kind: "reference", data, consent: true },
      f.owner.cookie,
    );
    const portrait = await api(
      root + "/assets",
      "POST",
      { kind: "portrait", data, consent: true },
      f.owner.cookie,
    );
    assert.equal(reference.status, 201);
    assert.equal(portrait.status, 201);
    const styles = {};
    for (const scope of ["hair", "beard", "hair_beard"]) {
      const r = await api(
        root + "/styles",
        "POST",
        {
          name: "Fixture " + scope,
          category: "cut",
          target_scope: scope,
          service_id: f.service,
          reference_asset_id: reference.data.id,
          instructions: "A synthetic reference; do not change identity.",
          published: true,
        },
        f.owner.cookie,
      );
      assert.equal(r.status, 201);
      styles[scope] = r.data.id;
    }
    assert.equal(
      (
        await api(
          root + "/styles/" + styles.hair + "/scope",
          "PUT",
          { target_scope: "hair_beard" },
          f.desk.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          root + "/styles/" + styles.hair + "/scope",
          "PUT",
          { target_scope: "invalid" },
          f.owner.cookie,
        )
      ).status,
      400,
    );
    const otherRoot = "/tenants/" + f.b.id;
    const otherService = await api(
      otherRoot + "/services",
      "POST",
      { name: "Barba otra empresa", duration_minutes: 30, price_cents: 1000 },
      f.other.cookie,
    );
    const otherPhoto = await api(
      otherRoot + "/studio/assets",
      "POST",
      { kind: "reference", data, consent: true },
      f.other.cookie,
    );
    const otherStyle = await api(
      otherRoot + "/studio/styles",
      "POST",
      {
        name: "Barba ajena",
        category: "cut",
        target_scope: "beard",
        service_id: otherService.data.id,
        reference_asset_id: otherPhoto.data.id,
        instructions: "Synthetic beard reference for isolation.",
        published: true,
      },
      f.other.cookie,
    );
    assert.equal(otherStyle.status, 201);
    const cases = [
      { target_scope: "hair", hairstyle_id: styles.hair, expected: 201 },
      { target_scope: "beard", hairstyle_id: styles.beard, expected: 201 },
      {
        target_scope: "hair_beard",
        hairstyle_id: styles.hair,
        beard_hairstyle_id: styles.beard,
        expected: 201,
      },
      {
        target_scope: "hair_beard",
        hairstyle_id: styles.hair_beard,
        expected: 201,
      },
      { target_scope: "hair_beard", hairstyle_id: styles.hair, expected: 400 },
      { target_scope: "hair", hairstyle_id: styles.beard, expected: 400 },
      { target_scope: "beard", hairstyle_id: styles.hair, expected: 400 },
      {
        target_scope: "hair",
        hairstyle_id: styles.hair,
        beard_hairstyle_id: styles.beard,
        expected: 400,
      },
      {
        target_scope: "hair_beard",
        hairstyle_id: styles.hair,
        beard_hairstyle_id: otherStyle.data.id,
        expected: 400,
      },
    ];
    const script = `const {Database}=require('./dist/api/apps/api/src/database.js');const {StudioController}=require('./dist/api/apps/api/src/modules/studio/studio.controller.js');const {randomUUID}=require('node:crypto');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{const p=JSON.parse(input);const db=new Database();const user={id:p.user,email:'fixture@example.test'};const c=new StudioController(db,{user:async()=>user},{},{id:'replicate',enabled:()=>true,model:'test-only'},{});const results=[];try{for(const item of p.cases){const {expected,...fields}=item;const body={...fields,portrait_asset_id:p.portrait,external_consent:true,request_key:randomUUID()};try{const result=await c.create({},p.tenant,body);const saved=await db.tenant(user,p.tenant,[],async q=>(await q.query('SELECT target_scope,beard_hairstyle_id FROM salon.virtual_tryons WHERE id=$1',[result.id])).rows[0]);const retry=await c.create({},p.tenant,body);let changed;try{await c.create({},p.tenant,{...body,target_scope:body.target_scope==='hair'?'beard':'hair'});}catch(e){changed=e.getStatus?.();}results.push({status:201,saved,idempotent:retry.id===result.id,changed});await db.tenant(user,p.tenant,[],q=>q.query('DELETE FROM salon.virtual_tryons WHERE id=$1',[result.id]));}catch(e){results.push({status:e.getStatus?.()??500});}}console.log(JSON.stringify(results));}finally{await db.onModuleDestroy();}});`;
    const run = spawnSync(
      "docker",
      ["compose", "exec", "-T", "api", "node", "-e", script],
      {
        input: JSON.stringify({
          tenant: f.a.id,
          user: f.owner.id,
          portrait: portrait.data.id,
          cases,
        }),
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.equal(run.status, 0, run.stderr);
    const results = JSON.parse(run.stdout.trim());
    cases.forEach((item, i) => {
      assert.equal(results[i].status, item.expected, JSON.stringify(item));
      if (item.expected === 201) {
        assert.equal(results[i].saved.target_scope, item.target_scope);
        assert.equal(
          results[i].saved.beard_hairstyle_id,
          item.beard_hairstyle_id ?? null,
        );
        assert.equal(results[i].idempotent, true);
        assert.equal(results[i].changed, 409);
      }
    });
    const workerScript = `const {Database}=require('./dist/api/apps/api/src/database.js');const {StudioController}=require('./dist/api/apps/api/src/modules/studio/studio.controller.js');const {StudioWorker}=require('./dist/api/apps/api/src/modules/studio/studio.worker.js');const {StudioStorage}=require('./dist/api/apps/api/src/modules/studio/studio.storage.js');const {randomUUID}=require('node:crypto');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{const p=JSON.parse(input);const db=new Database();const user={id:p.user,email:'fixture@example.test'};let observed;const provider={id:'replicate',enabled:()=>true,model:'test-only',render:async(...args)=>{observed={scope:args[6].scope,beard:Buffer.isBuffer(args[6].beardReference),notes:!!args[6].beardInstructions};return args[0];}};try{const c=new StudioController(db,{user:async()=>user},{},provider,{});const job=await c.create({},p.tenant,{hairstyle_id:p.hair,beard_hairstyle_id:p.beard,target_scope:'hair_beard',portrait_asset_id:p.portrait,external_consent:true,request_key:randomUUID()});const tx=db.tx.bind(db);db.tx=(ctx,fn)=>ctx.platform?Promise.resolve([{id:p.tenant,suspended:false}]):tx(ctx,fn);await new StudioWorker(db,provider,new StudioStorage()).tick();const saved=await db.tenant(user,p.tenant,[],async q=>(await q.query('SELECT status FROM salon.virtual_tryons WHERE id=$1',[job.id])).rows[0]);console.log(JSON.stringify({observed,saved}));}finally{await db.onModuleDestroy();}});`;
    const worker = spawnSync(
      "docker",
      ["compose", "exec", "-T", "api", "node", "-e", workerScript],
      {
        input: JSON.stringify({
          tenant: f.a.id,
          user: f.owner.id,
          portrait: portrait.data.id,
          hair: styles.hair,
          beard: styles.beard,
        }),
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.equal(worker.status, 0, worker.stderr);
    assert.deepEqual(JSON.parse(worker.stdout.trim()), {
      observed: { scope: "hair_beard", beard: true, notes: true },
      saved: { status: "succeeded" },
    });
    await assert.rejects(
      db.query(
        "INSERT INTO salon.virtual_tryons(tenant_id,created_by,hairstyle_id,portrait_asset_id,request_key,request_hash,provider,model,external_consent_at,target_scope,beard_hairstyle_id) VALUES($1,$2,$3,$4,$5,'test-only','test-only','test-only',now(),'hair_beard',$6)",
        [
          f.a.id,
          f.owner.id,
          styles.hair,
          portrait.data.id,
          randomUUID(),
          otherStyle.data.id,
        ],
      ),
      (e) => e.code === "23503",
    );
    assert.equal(
      (
        await api(
          root + "/styles/" + styles.hair + "/scope",
          "PUT",
          { target_scope: "hair_beard" },
          f.owner.cookie,
        )
      ).status,
      200,
    );
    const state = (await api(root, "GET", undefined, f.owner.cookie)).data;
    assert.equal(
      state.styles.find((s) => s.id === styles.hair).target_scope,
      "hair_beard",
    );
  } finally {
    if (f) await f.cleanup();
    await db.end();
  }
});
