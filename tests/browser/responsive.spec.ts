import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {test,expect,navigate} from './fixtures';
const demo=JSON.parse(readFileSync('.local/demo.json','utf8'));
const widths=[320,375,414,768,1440];
async function fit(page:any){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 const bad=await page.locator('.button:visible,.nav-link:visible,.segmented button:visible,.text-button:visible').evaluateAll((els:any[])=>els.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent?.trim()));
 expect(bad).toEqual([]);
 await expect(page.locator('h1:visible')).toHaveCount(1);
}
async function login(page:any){
 await page.goto('/');await page.getByLabel('Correo electrónico').fill(demo.email);await page.getByLabel('Contraseña',{exact:true}).fill(demo.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Agenda',exact:true})).toBeVisible();
}
test('gestión: menú con nombres, encabezados únicos y diálogos en todos los anchos',async({page})=>{
 test.setTimeout(90000);await login(page);
 for(const width of widths){
  await page.setViewportSize({width,height:900});
  for(const section of ['Agenda','Clientes','Servicios','Equipo','Estudio virtual','Página de clientes','Mi salón']){
   await navigate(page,section);await expect(page.getByRole('heading',{name:section,exact:true}).first()).toBeVisible();await fit(page);
   if(width<1024)await expect(page.locator('#salon-navigation')).toBeHidden();
   if(section==='Servicios'){
    await page.getByRole('button',{name:'Nuevo servicio',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Nombre',{exact:true}).fill('Servicio con nombre largo para comprobar la edición en móvil');
    await fit(page);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
   }
  }
 }
 await page.setViewportSize({width:375,height:900});await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('#salon-navigation')).toBeHidden();
 await page.emulateMedia({reducedMotion:'reduce'});await navigate(page,'Agenda');await fit(page);
});
test('reservas: resumen compacto, horarios completos por tramo y texto largo',async({page})=>{
 test.setTimeout(60000);await page.goto('/booking/?salon='+demo.slug);
 for(const width of widths){await page.setViewportSize({width,height:900});await fit(page);}
 await page.getByRole('button',{name:/Elegir Corte y acabado/}).click();await page.getByRole('button',{name:'Elegir horario',exact:true}).click();
 const date=new Date();date.setDate(date.getDate()+3);await page.getByLabel('Fecha',{exact:true}).fill(date.toISOString().slice(0,10));
 await expect(page.locator('.slot').first()).toBeVisible();
 const response=await page.request.get('/api/public/salons/'+demo.slug);const salon=await response.json();
 for(const width of widths){
  await page.setViewportSize({width,height:900});await fit(page);
  const top=await page.getByRole('combobox',{name:'Profesional',exact:true}).evaluate(e=>e.getBoundingClientRect().top);
  expect(top).toBeLessThan(560);
 }
 const employee=await page.getByRole('combobox',{name:'Profesional',exact:true}).inputValue();const day=await page.getByLabel('Fecha',{exact:true}).inputValue();
 const slots=await (await page.request.get('/api/public/salons/'+demo.slug+'/slots?'+new URLSearchParams({employee_id:employee,service_id:salon.services.find((s:any)=>s.name==='Corte y acabado').id,branch_id:salon.branches[0].id,date:day}))).json();
 await expect(page.locator('.slot')).toHaveCount(slots.length);
 expect(await page.locator('.slot-group h3').allTextContents()).toContain('Mañana');
 await page.locator('.slot').first().click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
 for(const width of widths){await page.setViewportSize({width,height:900});await fit(page);}
 await page.route('**/api/public/salons/'+demo.slug,async route=>{const json=structuredClone(salon);json.page={...json.page,hero_title:'Personalización extraordinariamente larga para un salón con identidad propia',hero_button:'Reserva tu próxima experiencia de cuidado en nuestro salón',categories_title:'Experiencias para cada momento de cuidado personal'};json.services[0].name='Tratamiento capilar personalizado con acabado profesional y asesoramiento';await route.fulfill({json});});
 await page.goto('/booking/?salon='+demo.slug);
 for(const width of widths){await page.setViewportSize({width,height:900});await fit(page);}
});
test('administración: plan y acceso etiquetados sin desbordar',async({page})=>{
 await login(page);await page.goto('/admin/');await expect(page.getByRole('heading',{name:'Salones',exact:true})).toBeVisible();
 for(const width of widths){await page.setViewportSize({width,height:900});await fit(page);await expect(page.getByRole('combobox',{name:'Acceso de '+ 'Estudio demo · datos de ejemplo'})).toBeVisible();}
});
