import type { PoolClient } from "pg";
import { PAGE_DEFAULTS, DEFAULT_SITE_CATEGORIES } from "../../../../../libs/contracts/src/page";
export async function seedPageCategories(db: PoolClient, tenant: string) {
  for (const [i,c] of DEFAULT_SITE_CATEGORIES.entries())
    await db.query("INSERT INTO salon.service_categories(tenant_id,id,name,description,fallback_image,featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", [tenant,c.id,c.name,c.description,c.fallback_image,c.featured,i]);
}
export async function readPage(db: PoolClient, tenant: string, publicView = false) {
  const p = (await db.query("SELECT settings,hero_asset_id,visit_asset_id,revision FROM salon.salon_pages WHERE tenant_id=$1", [tenant])).rows[0];
  const categories = (await db.query(`SELECT id,name,description,fallback_image,featured,photo_asset_id FROM salon.service_categories c WHERE tenant_id=$1 ${publicView ? "AND (featured OR EXISTS(SELECT 1 FROM salon.services s WHERE s.tenant_id=c.tenant_id AND s.category=c.id AND s.active))" : ""} ORDER BY sort_order,id`, [tenant])).rows;
  return { page: { ...PAGE_DEFAULTS, ...p?.settings, hero_asset_id: p?.hero_asset_id ?? null, visit_asset_id: p?.visit_asset_id ?? null }, revision: p?.revision ?? 0, categories };
}
export const assetUsed = `EXISTS(SELECT 1 FROM salon.salon_pages p WHERE p.tenant_id=a.tenant_id AND (p.hero_asset_id=a.id OR p.visit_asset_id=a.id)) OR EXISTS(SELECT 1 FROM salon.service_categories c WHERE c.tenant_id=a.tenant_id AND c.photo_asset_id=a.id) OR EXISTS(SELECT 1 FROM salon.services s WHERE s.tenant_id=a.tenant_id AND s.photo_asset_id=a.id)`;
