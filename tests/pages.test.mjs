import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
const base=process.env.TEST_API_URL??"http://127.0.0.1:8130/api";
const admin=new pg.Client({connectionString:process.env.ADMIN_DATABASE_URL});
const runtime=new pg.Client({connectionString:process.env.DATABASE_URL});
const users=[],tenants=[];
async function call(path,method="GET",body,cookie=""){
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const type=r.headers.get("content-type")??"";
 return {status:r.status,data:type.includes("json")?await r.json():Buffer.from(await r.arrayBuffer()),cookie:r.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ")};
}
async function actor(){
 const email="page-"+randomUUID()+"@example.test",password=randomUUID()+"Aa1!";
 const r=await fetch(process.env.AUTH_URL+"/admin/users",{method:"POST",headers:{Authorization:"Bearer "+process.env.SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password,email_confirm:true})});
 const u=await r.json();assert.equal(r.status,200);users.push(u.id);
 const login=await call("/auth/login","POST",{email,password});assert.equal(login.status,201);
 return {id:u.id,cookie:login.cookie};
}
async function salon(owner){
 const slug="pages-"+randomUUID().slice(0,12);
 const r=await call("/tenants","POST",{name:"Salón de pruebas",slug,branch_name:"Sede QA",timezone:"Europe/Madrid",address:"Dirección QA"},owner.cookie);assert.equal(r.status,201,JSON.stringify(r.data));
 tenants.push(r.data.id);return {id:r.data.id,slug};
}
test("Página de clientes: publicación, biblioteca y aislamiento",async t=>{
 await admin.connect();await runtime.connect();
 let owner,other,staff,a,b,photo,foreign,state,service;
 try{
  owner=await actor();other=await actor();staff=await actor();a=await salon(owner);b=await salon(other);
  await admin.query("INSERT INTO salon.memberships(tenant_id,user_id,role) VALUES($1,$2,'receptionist')",[a.id,staff.id]);
  const path="/tenants/"+a.id+"/page",pub="/public/salons/"+a.slug;
  const png=await sharp({create:{width:200,height:120,channels:3,background:{r:80,g:100,b:120}}}).png().toBuffer();
  const upload={data:"data:image/png;base64,"+png.toString("base64"),rights:true};
  await t.test("roles y categorías nuevas por salón",async()=>{
   assert.equal((await call(path)).status,401);
   assert.equal((await call(path,"GET",undefined,other.cookie)).status,404);
   assert.equal((await call(path,"GET",undefined,staff.cookie)).status,403);
   state=(await call(path,"GET",undefined,owner.cookie)).data;
   assert.equal(state.categories.length,7);assert.equal(state.revision,0);
   const r=await call("/tenants/"+a.id+"/services","POST",{name:"Servicio de prueba",category:"hair",duration_minutes:30,price_cents:2000},owner.cookie);
   assert.equal(r.status,201);service=r.data.id;
  });
  await t.test("solo fotos válidas con derechos y biblioteca privada antes de publicar",async()=>{
   assert.equal((await call(path+"/photos","POST",{...upload,rights:false},owner.cookie)).status,400);
   assert.equal((await call(path+"/photos","POST",{data:"<svg>contenido inválido</svg>",rights:true},owner.cookie)).status,400);
   assert.equal((await call(path+"/photos","POST",upload,staff.cookie)).status,403);
   const r=await call(path+"/photos","POST",upload,owner.cookie);assert.equal(r.status,201);photo=r.data.id;
   assert.equal((await call(pub+"/photos/"+photo)).status,404);
   const privateImage=await call(path+"/photos/"+photo,"GET",undefined,owner.cookie);assert.equal(privateImage.status,200);
   assert.equal((await sharp(privateImage.data).metadata()).format,"jpeg");
   assert.equal((await call(path+"/photos/"+photo,"GET",undefined,other.cookie)).status,404);
   assert.equal((await runtime.query("SELECT * FROM salon.page_assets")).rowCount,0);
   foreign=(await call("/tenants/"+b.id+"/page/photos","POST",upload,other.cookie)).data.id;
  });
  await t.test("publicación atómica de textos, fotos y categorías personalizadas",async()=>{
   state.page.hero_title="Tu cuidado de prueba";state.page.hero_asset_id=photo;state.page.visit_asset_id=photo;state.page.show_reference_photos=false;
   state.categories[0].name="Cabello artesanal";
   state.categories.unshift({id:"rituales",name:"Rituales QA",description:"Cuidado propio",fallback_image:"spa",featured:true,photo_asset_id:photo});
   const r=await call(path,"PUT",{page:state.page,categories:state.categories,revision:state.revision},owner.cookie);assert.equal(r.status,200,JSON.stringify(r.data));state=r.data;
   const publicPage=await call(pub);assert.equal(publicPage.data.page.hero_title,"Tu cuidado de prueba");assert.equal(publicPage.data.categories[0].name,"Rituales QA");
   assert.equal((await call(pub+"/photos/"+photo)).status,200);
   assert.equal((await call("/public/salons/"+b.slug+"/photos/"+photo)).status,404);
   assert.equal((await call(path+"/photos/"+photo,"DELETE",undefined,owner.cookie)).status,409);
  });
  await t.test("rechazo de referencias cruzadas y conflictos de edición",async()=>{
   assert.equal((await call(path,"PUT",{page:{...state.page,hero_asset_id:foreign},categories:state.categories,revision:state.revision},owner.cookie)).status,400);
   assert.equal((await call(path,"PUT",{page:state.page,categories:state.categories,revision:0},owner.cookie)).status,409);
   assert.equal((await call(path,"PUT",{page:state.page,categories:state.categories.filter(c=>c.id!=="hair"),revision:state.revision},owner.cookie)).status,409);
   assert.equal((await call(path,"PUT",{page:state.page,categories:state.categories,revision:state.revision},staff.cookie)).status,403);
  });
  await t.test("foto y descripción de servicio; edición antigua conserva su categoría",async()=>{
   const data={name:"Servicio de prueba",category:"rituales",description:"Un ritual a tu medida",photo_asset_id:photo,duration_minutes:30,price_cents:2000};
   assert.equal((await call("/tenants/"+a.id+"/services/"+service,"PUT",{...data,photo_asset_id:foreign},owner.cookie)).status,400);
   assert.equal((await call("/tenants/"+a.id+"/services/"+service,"PUT",data,owner.cookie)).status,200);
   const {category,photo_asset_id,description,...legacy}=data;
   assert.equal((await call("/tenants/"+a.id+"/services/"+service,"PUT",legacy,owner.cookie)).status,200);
   const published=(await call(pub)).data.services.find(s=>s.id===service);
   assert.equal(published.category,"rituales");assert.equal(published.description,data.description);assert.equal(published.photo_asset_id,photo);
   assert.equal((await call("/tenants/"+b.id+"/services","POST",data,other.cookie)).status,400);
  });
  await t.test("retirada revoca acceso público y permite borrar; no toca otros salones",async()=>{
   assert.equal((await call("/tenants/"+a.id+"/services/"+service,"PUT",{name:"Servicio de prueba",category:"other",description:"",photo_asset_id:null,duration_minutes:30,price_cents:2000},owner.cookie)).status,200);
   state.page.hero_asset_id=null;state.page.visit_asset_id=null;state.categories=state.categories.filter(c=>c.id!=="rituales");
   const r=await call(path,"PUT",{page:state.page,categories:state.categories,revision:state.revision},owner.cookie);assert.equal(r.status,200);
   assert.equal((await call(pub+"/photos/"+photo)).status,404);
   assert.equal((await call(path+"/photos/"+photo,"GET",undefined,owner.cookie)).status,200);
   assert.equal((await call(path+"/photos/"+photo,"DELETE",undefined,owner.cookie)).status,200);
   assert.equal((await call(path+"/photos/"+photo,"GET",undefined,owner.cookie)).status,404);
   assert.equal((await call("/tenants/"+b.id+"/page/photos/"+foreign,"GET",undefined,other.cookie)).status,200);
  });
 }finally{
  for(const tenant of tenants){
   const keys=(await admin.query("SELECT storage_key FROM salon.page_assets WHERE tenant_id=$1",[tenant])).rows.map(r=>r.storage_key);
   if(keys.length)execFileSync("docker",["compose","exec","-T","api","node","-e",`fetch(process.env.STORAGE_URL+'/object/salon-pages',{method:'DELETE',headers:{Authorization:'Bearer '+process.env.SERVICE_ROLE_KEY,apikey:process.env.SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefixes:${JSON.stringify(keys)}})}).then(r=>{if(!r.ok)process.exit(1)})`],{stdio:"pipe"});
   await admin.query("BEGIN");
   try{for(const table of ["audit_log","services","service_categories","salon_pages","page_assets","branches","memberships"])await admin.query("DELETE FROM salon."+table+" WHERE tenant_id=$1",[tenant]);await admin.query("DELETE FROM salon.tenants WHERE id=$1",[tenant]);await admin.query("COMMIT");}catch(e){await admin.query("ROLLBACK");throw e;}
  }
  for(const user of users)await admin.query("DELETE FROM auth.users WHERE id=$1",[user]);
  await admin.end();await runtime.end();
 }
});
