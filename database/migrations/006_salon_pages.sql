CREATE TABLE salon.page_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES salon.tenants(id),
 storage_key text NOT NULL UNIQUE,byte_size integer NOT NULL CHECK(byte_size>0),
 uploaded_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE salon.salon_pages (
 tenant_id uuid PRIMARY KEY REFERENCES salon.tenants(id),settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 hero_asset_id uuid,visit_asset_id uuid,revision integer NOT NULL DEFAULT 1,
 CHECK(jsonb_typeof(settings)='object'),
 FOREIGN KEY(tenant_id,hero_asset_id) REFERENCES salon.page_assets(tenant_id,id),
 FOREIGN KEY(tenant_id,visit_asset_id) REFERENCES salon.page_assets(tenant_id,id)
);
CREATE TABLE salon.service_categories (
 tenant_id uuid NOT NULL REFERENCES salon.tenants(id),id text NOT NULL CHECK(id ~ '^[a-z][a-z0-9-]{0,59}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 50),description text NOT NULL DEFAULT '',
 fallback_image text NOT NULL DEFAULT 'salon' CHECK(fallback_image IN ('hair','nails','barber','spa','massage','salon')),
 featured boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0,photo_asset_id uuid,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,photo_asset_id) REFERENCES salon.page_assets(tenant_id,id)
);
INSERT INTO salon.service_categories(tenant_id,id,name,description,fallback_image,featured,sort_order)
SELECT t.id,c.id,c.name,c.description,c.image,c.featured,c.position FROM salon.tenants t
CROSS JOIN (VALUES
 ('hair','Peluquería','Cortes, color y cuidado capilar','hair',true,0),
 ('nails','Manicura','Manos, pies y pequeños detalles','nails',true,1),
 ('barber','Barbería','Corte, barba y afeitado','barber',true,2),
 ('spa','Spa y facial','Una pausa para tu piel','spa',true,3),
 ('massage','Masajes','Baja el ritmo, suelta la tensión','massage',true,4),
 ('beauty','Cejas y belleza','El cuidado de los pequeños detalles','spa',false,5),
 ('other','Otros cuidados','Más momentos para ti','salon',false,6)
) c(id,name,description,image,featured,position);
ALTER TABLE salon.services DROP CONSTRAINT services_category_check;
ALTER TABLE salon.services ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE salon.services ADD COLUMN photo_asset_id uuid;
ALTER TABLE salon.services ADD FOREIGN KEY(tenant_id,category) REFERENCES salon.service_categories(tenant_id,id);
ALTER TABLE salon.services ADD FOREIGN KEY(tenant_id,photo_asset_id) REFERENCES salon.page_assets(tenant_id,id);
CREATE INDEX ON salon.services(tenant_id,category);
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['page_assets','salon_pages','service_categories'] LOOP
  EXECUTE format('ALTER TABLE salon.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE salon.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY page_member ON salon.%I TO salon_api USING(tenant_id=salon.tenant_id() AND EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id())) WITH CHECK(tenant_id=salon.tenant_id() AND EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()))',tbl);
 END LOOP;
END $$;
CREATE POLICY page_public ON salon.salon_pages FOR SELECT TO salon_api USING(tenant_id=salon.tenant_id() AND current_setting('app.public',true)='true');
CREATE POLICY category_public ON salon.service_categories FOR SELECT TO salon_api USING(tenant_id=salon.tenant_id() AND current_setting('app.public',true)='true');
CREATE POLICY photo_public ON salon.page_assets FOR SELECT TO salon_api USING(
 tenant_id=salon.tenant_id() AND current_setting('app.public',true)='true' AND (
 EXISTS(SELECT 1 FROM salon.salon_pages p WHERE p.tenant_id=salon.page_assets.tenant_id AND (p.hero_asset_id=salon.page_assets.id OR p.visit_asset_id=salon.page_assets.id)) OR
 EXISTS(SELECT 1 FROM salon.service_categories c WHERE c.tenant_id=salon.page_assets.tenant_id AND c.photo_asset_id=salon.page_assets.id AND (c.featured OR EXISTS(SELECT 1 FROM salon.services s WHERE s.tenant_id=c.tenant_id AND s.category=c.id AND s.active))) OR
 EXISTS(SELECT 1 FROM salon.services s WHERE s.tenant_id=salon.page_assets.tenant_id AND s.photo_asset_id=salon.page_assets.id AND s.active)
 ));
GRANT SELECT,INSERT,UPDATE,DELETE ON salon.page_assets,salon.salon_pages,salon.service_categories TO salon_api;
