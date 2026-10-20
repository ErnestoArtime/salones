import { Component, input, output, signal, inject, effect, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api } from "../data-access/src/api";
import { environment } from "../data-access/src/environment";
import { Icon } from "./icon";
import { PAGE_DEFAULTS, type PageSettings, type SiteCategory, type Service } from "../contracts/src/index";
@Component({selector:"lv-page-editor",standalone:true,imports:[FormsModule,Icon],templateUrl:"./page-editor.component.html",styleUrl:"./page-editor.component.css"})
export class PageEditorComponent {
  private api=inject(Api);
  tenantId=input.required<string>();
  role=input.required<string>();
  publicUrl=input.required<string>();
  saved=output<void>();
  busy=signal(false); loading=signal(true); error=signal(""); notice=signal(""); tab=signal("page");
  manage=computed(()=>["owner","manager"].includes(this.role()));
  page:PageSettings={...PAGE_DEFAULTS}; categories:SiteCategory[]=[];
  services:Service[]=[]; publishedCategoryIds:string[]=[]; assets:any[]=[]; revision=0; rights=false; selectedService=""; serviceDraft:any=null;
  textFields = [
    {key:"display_name",label:"Nombre público del salón",max:140,multiline:false},
    {key:"hero_title",label:"Título de portada",max:120,multiline:true},
    {key:"hero_description",label:"Descripción de portada",max:600,multiline:true},
    {key:"hero_caption",label:"Texto sobre la foto de portada",max:140,multiline:false},
    {key:"hero_button",label:"Texto del botón de reserva",max:40,multiline:false},
    {key:"categories_title",label:"Título de categorías",max:100,multiline:false},
    {key:"categories_description",label:"Introducción de categorías",max:200,multiline:true},
    {key:"catalog_title",label:"Título del catálogo",max:100,multiline:false},
    {key:"catalog_description",label:"Introducción del catálogo",max:200,multiline:true},
    {key:"visit_title",label:"Título de tu visita",max:100,multiline:true},
    {key:"visit_description",label:"Texto de tu visita",max:600,multiline:true},
    {key:"footer_text",label:"Texto del pie de página",max:140,multiline:false},
  ] as const;
  constructor(){effect(()=>{this.tenantId();this.page={...PAGE_DEFAULTS};this.categories=[];this.assets=[];this.services=[];this.serviceDraft=null;this.selectedService="";this.revision=0;this.rights=false;this.error.set("");this.notice.set("");void this.load();});}
  async load(){
    const tenant=this.tenantId();this.loading.set(true);
    try{
      if(!this.manage())return;
      const data=await this.api.request("/tenants/"+tenant+"/page");
      if(tenant!==this.tenantId())return;
      this.page=data.page;this.revision=data.revision;this.categories=data.categories;this.publishedCategoryIds=data.categories.map((c:SiteCategory)=>c.id);this.services=data.services;this.assets=data.assets;
    }catch(e){if(tenant===this.tenantId())this.error.set((e as Error).message);}
    finally{if(tenant===this.tenantId())this.loading.set(false);}
  }
  photo(id:string|null){return id ? environment.apiUrl+"/tenants/"+this.tenantId()+"/page/photos/"+id : "";}
  async publish(){
    if(this.busy())return;const tenant=this.tenantId();this.busy.set(true);this.error.set("");this.notice.set("");
    try{
      await this.api.request("/tenants/"+tenant+"/page","PUT",{revision:this.revision,page:this.page,categories:this.categories});
      if(tenant!==this.tenantId())return;
      await this.load();this.notice.set("Página publicada. Ya puedes abrirla para ver los cambios.");this.saved.emit();
    }catch(e){if(tenant===this.tenantId())this.error.set((e as Error).message);}
    finally{this.busy.set(false);}
  }
  addCategory(){if(this.categories.length>=20)return;this.categories.push({id:"cat-"+crypto.randomUUID().slice(0,12),name:"Nueva categoría",description:"",fallback_image:"salon",featured:true,photo_asset_id:null});}
  moveCategory(index:number,delta:number){const dest=index+delta;if(dest<0||dest>=this.categories.length)return;[this.categories[index],this.categories[dest]]=[this.categories[dest],this.categories[index]];}
  removeCategory(index:number){const c=this.categories[index];if(c.id==="other"||this.services.some(s=>s.category===c.id)){this.error.set("Reasigna los servicios de esta categoría antes de eliminarla. La categoría general se conserva como alternativa.");return;}this.categories.splice(index,1);}
  chooseService(){const s=this.services.find(s=>s.id===this.selectedService);this.serviceDraft=s?{...s,description:s.description??"",photo_asset_id:s.photo_asset_id??null}:null;}
  async saveService(){
    if(!this.serviceDraft||this.busy())return;const tenant=this.tenantId(),s=this.serviceDraft;
    if(!this.publishedCategoryIds.includes(s.category)){this.error.set("Publica primero la nueva categoría antes de asignarle servicios.");return;}
    this.busy.set(true);this.error.set("");this.notice.set("");
    try{
      await this.api.request("/tenants/"+tenant+"/services/"+s.id,"PUT",{name:s.name,description:s.description,category:s.category,photo_asset_id:s.photo_asset_id,duration_minutes:s.duration_minutes,buffer_minutes:s.buffer_minutes,price_cents:s.price_cents,currency:s.currency,active:s.active});
      if(tenant!==this.tenantId())return;
      this.services=this.services.map(old=>old.id===s.id?{...s}:old);this.notice.set("Servicio actualizado en la página pública.");this.saved.emit();
      const data=await this.api.request("/tenants/"+tenant+"/page");if(tenant===this.tenantId())this.assets=data.assets;
    }catch(e){if(tenant===this.tenantId())this.error.set((e as Error).message);}
    finally{this.busy.set(false);}
  }
  async upload(event:Event,target:"hero"|"visit"|"category"|"service",index=0){
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
    if(!this.rights){this.error.set("Confirma los derechos de publicación antes de subir fotos.");input.value="";return;}
    if(file.size>5*1024*1024){this.error.set("La imagen supera 5 MB.");input.value="";return;}
    const tenant=this.tenantId(),categoryId=this.categories[index]?.id,service=this.serviceDraft;
    this.busy.set(true);this.error.set("");this.notice.set("");
    try{
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("No se pudo leer la imagen."));reader.readAsDataURL(file);});
      const asset=await this.api.request("/tenants/"+tenant+"/page/photos","POST",{data,rights:true});
      if(tenant!==this.tenantId())return;
      this.assets.unshift({id:asset.id,used:false});
      if(target==="hero")this.page.hero_asset_id=asset.id;
      if(target==="visit")this.page.visit_asset_id=asset.id;
      if(target==="category"){const category=this.categories.find(c=>c.id===categoryId);if(category)category.photo_asset_id=asset.id;}
      if(target==="service"&&this.serviceDraft===service)service.photo_asset_id=asset.id;
      this.notice.set(target==="service"?"Foto subida. Guarda el servicio para publicarla.":"Foto subida. Guarda y publica la página para mostrarla.");
    }catch(e){if(tenant===this.tenantId())this.error.set((e as Error).message);}
    finally{this.busy.set(false);input.value="";}
  }
  async deletePhoto(id:string){
    if(this.busy())return;const tenant=this.tenantId();
    if(this.page.hero_asset_id===id||this.page.visit_asset_id===id||this.categories.some(c=>c.photo_asset_id===id)||this.serviceDraft?.photo_asset_id===id){this.error.set("Retira la foto de la selección y guarda antes de eliminarla.");return;}
    this.busy.set(true);this.error.set("");
    try{await this.api.request("/tenants/"+tenant+"/page/photos/"+id,"DELETE");if(tenant===this.tenantId()){this.assets=this.assets.filter(a=>a.id!==id);this.notice.set("Foto eliminada de la biblioteca activa.");}}
    catch(e){if(tenant===this.tenantId())this.error.set((e as Error).message);}
    finally{this.busy.set(false);}
  }
}
