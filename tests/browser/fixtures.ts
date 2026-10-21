import {test as base, expect, type Page} from '@playwright/test';
// Optional private preview: browser keeps production HTTPS/cookie semantics,
// while assets and API requests pass through the loopback preview proxy.
export const test = base.extend<{preview: void}>({
 preview: [async ({context},use) => {
  const origin=process.env.TEST_PREVIEW_ORIGIN;
  if(origin){
   const parsed=new URL(origin);
   if(parsed.hostname!=='127.0.0.1' || parsed.protocol!=='http:')throw new Error('Preview must use HTTP loopback');
   await context.route('https://lavia.eav-labs.com/**',async route=>{
    const requested=new URL(route.request().url());
    const response=await route.fetch({url:origin+requested.pathname+requested.search,headers:await route.request().allHeaders(),maxRedirects:0});
    await route.fulfill({response});
   });
  }
  await use();
 },{auto:true}],
});
export {expect};
export async function navigate(page:Page,name:string){
 const toggle=page.getByRole('button',{name:'Abrir navegación',exact:true});
 if(await toggle.isVisible())await toggle.click();
 await page.getByRole('navigation',{name:'Gestión del salón'}).getByRole('button',{name,exact:true}).click();
}
