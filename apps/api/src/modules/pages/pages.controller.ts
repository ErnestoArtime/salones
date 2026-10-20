import { Controller, Get, Put, Post, Delete, Req, Res, Param, Body, Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Database } from "../../database";
import { Auth } from "../../auth";
import { id } from "../../validation";
import { StudioStorage } from "../studio/studio.storage";
import { readPage, assetUsed } from "./pages.data";
const MANAGE = ["owner", "manager"];
const text = (max: number) => z.string().trim().min(1).max(max);
const pageInput = z.object({
  display_name: z.string().trim().max(140), hero_title: text(120), hero_description: text(600),
  hero_caption: text(140), hero_button: text(40), categories_title: text(100), categories_description: text(200),
  catalog_title: text(100), catalog_description: text(200), visit_title: text(100), visit_description: text(600),
  footer_text: text(140), show_reference_photos: z.boolean(), hero_asset_id: id.nullable(), visit_asset_id: id.nullable(),
}).strict();
const categoryInput = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/), name: text(50), description: z.string().trim().max(160),
  fallback_image: z.enum(["hair","nails","barber","spa","massage","salon"]), featured: z.boolean(), photo_asset_id: id.nullable(),
}).strict();
const saveInput = z.object({
  revision: z.number().int().min(0), page: pageInput,
  categories: z.array(categoryInput).min(1).max(20)
    .refine(c => new Set(c.map(x=>x.id)).size === c.length, "Categorías repetidas")
    .refine(c => new Set(c.map(x=>x.name.toLocaleLowerCase())).size === c.length, "Los nombres de categoría deben ser distintos")
    .refine(c => c.some(x=>x.id === "other"), "Conserva la categoría general para servicios sin clasificar"),
}).strict();
@Injectable()
export class PageStorage extends StudioStorage { protected override bucket = "salon-pages"; }
@Controller("api")
export class PagesController {
  constructor(private db: Database, private auth: Auth, private storage: PageStorage) {}
  @Get("tenants/:tenant/page") async index(@Req() req: Request, @Param("tenant") tenant: string) {
    id.parse(tenant); const user = await this.auth.user(req);
    return this.db.tenant(user, tenant, MANAGE, async db => ({
      ...await readPage(db,tenant),
      services: (await db.query("SELECT * FROM salon.services WHERE tenant_id=$1 ORDER BY name",[tenant])).rows,
      assets: (await db.query(`SELECT a.id,a.byte_size,a.created_at,(${assetUsed}) AS used FROM salon.page_assets a WHERE a.tenant_id=$1 ORDER BY a.created_at DESC`, [tenant])).rows,
    }));
  }
  @Put("tenants/:tenant/page") async save(@Req() req: Request, @Param("tenant") tenant: string, @Body() body: unknown) {
    id.parse(tenant); const user=await this.auth.user(req), input=saveInput.parse(body);
    return this.db.tenant(user,tenant,MANAGE,async db=>{
      await db.query("SELECT id FROM salon.tenants WHERE id=$1 FOR UPDATE",[tenant]);
      const current=(await db.query("SELECT revision FROM salon.salon_pages WHERE tenant_id=$1",[tenant])).rows[0];
      if((current?.revision ?? 0)!==input.revision)throw new ConflictException("La página ha cambiado en otra sesión. Recarga antes de publicar.");
      const assetIds=[input.page.hero_asset_id,input.page.visit_asset_id,...input.categories.map(c=>c.photo_asset_id)].filter((x):x is string=>!!x);
      if(assetIds.length){
        const found=await db.query("SELECT id FROM salon.page_assets WHERE tenant_id=$1 AND id=ANY($2::uuid[]) FOR KEY SHARE",[tenant,assetIds]);
        if(found.rowCount!==new Set(assetIds).size)throw new BadRequestException("Una fotografía no pertenece al salón o ya no existe.");
      }
      const ids=input.categories.map(c=>c.id);
      const used=await db.query("SELECT name FROM salon.services WHERE tenant_id=$1 AND NOT(category=ANY($2::text[])) LIMIT 1",[tenant,ids]);
      if(used.rowCount)throw new ConflictException("Reasigna los servicios de la categoría antes de eliminarla, incluidos los inactivos.");
      for(const [i,c] of input.categories.entries())await db.query("INSERT INTO salon.service_categories(tenant_id,id,name,description,fallback_image,featured,photo_asset_id,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,id) DO UPDATE SET name=$3,description=$4,fallback_image=$5,featured=$6,photo_asset_id=$7,sort_order=$8",[tenant,c.id,c.name,c.description,c.fallback_image,c.featured,c.photo_asset_id,i]);
      await db.query("DELETE FROM salon.service_categories WHERE tenant_id=$1 AND NOT(id=ANY($2::text[]))",[tenant,ids]);
      const { hero_asset_id,visit_asset_id,...settings }=input.page;
      await db.query("INSERT INTO salon.salon_pages(tenant_id,settings,hero_asset_id,visit_asset_id,revision) VALUES($1,$2,$3,$4,1) ON CONFLICT(tenant_id) DO UPDATE SET settings=$2,hero_asset_id=$3,visit_asset_id=$4,revision=salon.salon_pages.revision+1",[tenant,JSON.stringify(settings),hero_asset_id,visit_asset_id]);
      await this.db.audit(db,tenant,user.id,"page.published",tenant);
      return readPage(db,tenant);
    });
  }
  @Post("tenants/:tenant/page/photos") async upload(@Req() req: Request,@Param("tenant") tenant: string,@Body() body: unknown){
    id.parse(tenant); const user=await this.auth.user(req);
    const input=z.object({data:z.string().min(20).max(7000000),rights:z.literal(true)}).strict().parse(body);
    const asset=randomUUID(),key=tenant+"/"+asset+".jpg";
    let stored=false;
    try{return await this.db.tenant(user,tenant,MANAGE,async db=>{
      await db.query("SELECT id FROM salon.tenants WHERE id=$1 FOR UPDATE",[tenant]);
      const usage=(await db.query("SELECT count(*)::int AS count,coalesce(sum(byte_size),0)::bigint AS bytes FROM salon.page_assets WHERE tenant_id=$1",[tenant])).rows[0];
      const normalized=await this.storage.normalize(Buffer.from(input.data.replace(/^data:image\/(jpeg|png|webp);base64,/,""),"base64"));
      if(usage.count>=200 || Number(usage.bytes)+normalized.length>100*1024*1024)throw new BadRequestException("La biblioteca admite 200 fotos y 100 MB. Elimina fotos sin usar para liberar espacio.");
      await this.storage.put(key,normalized); stored=true;
      await db.query("INSERT INTO salon.page_assets(id,tenant_id,storage_key,byte_size,uploaded_by) VALUES($1,$2,$3,$4,$5)",[asset,tenant,key,normalized.length,user.id]);
      await this.db.audit(db,tenant,user.id,"page.photo_uploaded",asset);
      return {id:asset};
    });}catch(e){if(stored)await this.storage.remove(key).catch(()=>{});throw e;}
  }
  @Get("tenants/:tenant/page/photos/:asset") async privatePhoto(@Req() req: Request,@Param("tenant") tenant: string,@Param("asset") asset: string,@Res() res: Response){
    id.parse(tenant);id.parse(asset);const user=await this.auth.user(req);
    const bytes=await this.db.tenant(user,tenant,MANAGE,db=>this.photo(db,tenant,asset));
    res.type("image/jpeg").send(bytes);
  }
  @Get("public/salons/:slug/photos/:asset") async publicPhoto(@Param("slug") slug: string,@Param("asset") asset: string,@Res() res: Response){
    z.string().max(60).parse(slug);id.parse(asset);
    // FORCE RLS additionally limits public reads to assets currently referenced
    // by the page, featured categories or active services of this resolved salon.
    const bytes=await this.db.public(slug,(db,t)=>this.photo(db,t.id,asset));
    res.type("image/jpeg").send(bytes);
  }
  private async photo(db: import("pg").PoolClient,tenant: string,asset: string){
    const row=(await db.query("SELECT storage_key FROM salon.page_assets WHERE tenant_id=$1 AND id=$2",[tenant,asset])).rows[0];
    if(!row)throw new NotFoundException("La fotografía no está publicada o ya no existe.");
    return this.storage.get(row.storage_key);
  }
  @Delete("tenants/:tenant/page/photos/:asset") async remove(@Req() req: Request,@Param("tenant") tenant: string,@Param("asset") asset: string){
    id.parse(tenant);id.parse(asset);const user=await this.auth.user(req);
    return this.db.tenant(user,tenant,MANAGE,async db=>{
      await db.query("SELECT id FROM salon.tenants WHERE id=$1 FOR UPDATE",[tenant]);
      const a=(await db.query(`SELECT a.*,(${assetUsed}) AS used FROM salon.page_assets a WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE`,[tenant,asset])).rows[0];
      if(!a)throw new NotFoundException();
      if(a.used)throw new ConflictException("Retira esta foto de la página, categoría o servicio y guarda antes de eliminarla.");
      await this.storage.remove(a.storage_key);
      await db.query("DELETE FROM salon.page_assets WHERE tenant_id=$1 AND id=$2",[tenant,asset]);
      await this.db.audit(db,tenant,user.id,"page.photo_deleted",asset);
      return {id:asset};
    });
  }
}
