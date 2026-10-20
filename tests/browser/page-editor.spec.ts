import "dotenv/config";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
test.use({ actionTimeout: 10000 });
const demo=JSON.parse(readFileSync(".local/demo.json","utf8"));
test("personalizar salón: subir fotos, publicar textos/categorías y editar servicio",async({page,context})=>{
 test.setTimeout(90000);
 const admin=new pg.Client({connectionString:process.env.ADMIN_DATABASE_URL});await admin.connect();
 let tenant="";
 try{
  await page.goto("/");await page.getByLabel("Correo electrónico").fill(demo.email);await page.getByLabel("Contraseña",{exact:true}).fill(demo.password);await page.getByRole("button",{name:"Entrar",exact:true}).click();await expect(page.getByRole("heading",{name:"Cada cita, a su tiempo."})).toBeVisible();
  const slug="editor-qa-"+randomUUID().slice(0,10);
  const created=await page.request.post("/api/tenants",{data:{name:"Salón temporal QA",slug,branch_name:"Sede QA",timezone:"Europe/Madrid",address:"Dirección QA"}});expect(created.ok()).toBeTruthy();tenant=(await created.json()).id;
  const serviceResponse=await page.request.post("/api/tenants/"+tenant+"/services",{data:{name:"Cuidado QA",category:"hair",duration_minutes:30,price_cents:2200}});expect(serviceResponse.ok()).toBeTruthy();const service=(await serviceResponse.json()).id;
  await page.reload();await page.locator(".topbar select").selectOption(tenant);
  await page.getByRole("button",{name:"Página de clientes",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Tu salón, a tu manera."})).toBeVisible();
  await page.getByLabel("Nombre público del salón").fill("Estudio QA personalizado");
  await page.getByLabel("Título de portada",{exact:true}).fill("Tu ritual QA");
  await page.getByLabel("Usar fotos de referencia").uncheck();
  await page.getByLabel("Confirmo que puedo publicar estas fotos").check();
  const fixture=await sharp({create:{width:600,height:800,channels:3,background:{r:138,g:112,b:101}}}).png().toBuffer();
  await page.getByLabel("Subir foto de portada",{exact:true}).setInputFiles({name:"portada-qa.png",mimeType:"image/png",buffer:fixture});
  await expect(page.getByRole("status")).toContainText("Foto subida");
  await page.getByRole("button",{name:"Categorías",exact:true}).click();
  await page.getByRole("button",{name:"Añadir categoría"}).click();
  const category=page.locator(".category-editor").last();
  await category.getByLabel("Nombre de categoría",{exact:true}).fill("Rituales QA");
  await category.getByLabel("Descripción de categoría",{exact:true}).fill("Nuestros cuidados de prueba");
  await category.getByRole("button",{name:"Subir categoría Rituales QA",exact:true}).click();
  await page.getByRole("button",{name:"Guardar y publicar",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Página publicada");
  const state=await (await page.request.get("/api/tenants/"+tenant+"/page")).json();
  const categoryId=state.categories.find((c:any)=>c.name==="Rituales QA").id;
  const publicPage=await context.newPage();await publicPage.goto("/booking/?salon="+slug);
  await expect(publicPage.getByRole("heading",{name:"Tu ritual QA",exact:true})).toBeVisible();
  await expect(publicPage.getByText("Estudio QA personalizado",{exact:true})).toBeVisible();
  await expect(publicPage.getByRole("heading",{name:"Rituales QA",exact:true})).toBeVisible();
  await expect.poll(()=>publicPage.locator(".hero-photo img").evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  expect(await publicPage.locator(".hero-photo img").getAttribute("src")).toContain("/api/public/salons/"+slug+"/photos/");
  await expect(publicPage.locator('img[src^="images/"]')).toHaveCount(0);
  await page.getByRole("button",{name:"Fotos de servicios",exact:true}).click();
  await page.getByLabel("Servicio para personalizar").selectOption(service);
  await page.getByLabel("Descripción pública del servicio",{exact:true}).fill("Un cuidado creado por tu salón.");
  await page.getByRole("combobox",{name:"Categoría del servicio",exact:true}).selectOption(categoryId);
  await page.getByLabel("Subir foto del servicio",{exact:true}).setInputFiles({name:"servicio-qa.png",mimeType:"image/png",buffer:fixture});
  await expect(page.getByRole("status")).toContainText("Foto subida");
  await page.getByRole("button",{name:"Guardar servicio",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Servicio actualizado");
  await publicPage.reload();await expect(publicPage.getByText("Un cuidado creado por tu salón.",{exact:true})).toBeVisible();
  await publicPage.getByRole("button",{name:"Explorar Rituales QA",exact:true}).click();
  await expect(publicPage.locator(".service-card")).toHaveCount(1);
  expect(await publicPage.locator(".service-card img").getAttribute("src")).toContain("/api/public/salons/"+slug+"/photos/");
  // Plain text is rendered literally; salon copy cannot inject markup.
  await page.getByRole("button",{name:"Portada y textos",exact:true}).click();
  await page.getByLabel("Título de portada",{exact:true}).fill("Cuidado <b>propio</b>");
  await page.getByRole("button",{name:"Guardar y publicar",exact:true}).click();await expect(page.getByRole("status")).toContainText("Página publicada");
  await publicPage.reload();await expect(publicPage.locator("#hero-title")).toHaveText("Cuidado <b>propio</b>");await expect(publicPage.locator("#hero-title b")).toHaveCount(0);
  for(const width of [320,375,414,768]){
   await page.setViewportSize({width,height:900});
   for(const tab of ["Portada y textos","Categorías","Fotos de servicios","Biblioteca"]){
    await page.getByRole("button",{name:tab,exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   }
   await publicPage.setViewportSize({width,height:900});expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
  await page.setViewportSize({width:1440,height:1000});await page.getByRole("button",{name:"Portada y textos",exact:true}).click();await page.screenshot({path:".local/screenshots/page-editor-desktop.png",fullPage:true});
  await page.setViewportSize({width:375,height:900});await page.screenshot({path:".local/screenshots/page-editor-mobile.png",fullPage:true});
  await publicPage.close();
 }finally{
  if(tenant){
   const keys=(await admin.query("SELECT storage_key FROM salon.page_assets WHERE tenant_id=$1",[tenant])).rows.map(r=>r.storage_key);
   if(keys.length)execFileSync("docker",["compose","exec","-T","api","node","-e",`fetch(process.env.STORAGE_URL+'/object/salon-pages',{method:'DELETE',headers:{Authorization:'Bearer '+process.env.SERVICE_ROLE_KEY,apikey:process.env.SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefixes:${JSON.stringify(keys)}})}).then(r=>{if(!r.ok)process.exit(1)})`],{stdio:"pipe"});
   await admin.query("BEGIN");try{for(const table of ["audit_log","services","service_categories","salon_pages","page_assets","branches","memberships"])await admin.query("DELETE FROM salon."+table+" WHERE tenant_id=$1",[tenant]);await admin.query("DELETE FROM salon.tenants WHERE id=$1",[tenant]);await admin.query("COMMIT");}catch(e){await admin.query("ROLLBACK");throw e;}
  }
  await admin.end();
 }
});
