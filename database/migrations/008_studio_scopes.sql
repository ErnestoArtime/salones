ALTER TABLE salon.hairstyles ADD COLUMN target_scope text NOT NULL DEFAULT 'hair'
 CHECK(target_scope IN ('hair','beard','hair_beard'));
ALTER TABLE salon.virtual_tryons ADD COLUMN target_scope text NOT NULL DEFAULT 'hair'
 CHECK(target_scope IN ('hair','beard','hair_beard'));
ALTER TABLE salon.virtual_tryons ADD COLUMN beard_hairstyle_id uuid;
ALTER TABLE salon.virtual_tryons ADD CONSTRAINT tryon_beard_same_tenant
 FOREIGN KEY(tenant_id,beard_hairstyle_id) REFERENCES salon.hairstyles(tenant_id,id);
ALTER TABLE salon.virtual_tryons ADD CONSTRAINT tryon_beard_scope
 CHECK(beard_hairstyle_id IS NULL OR target_scope='hair_beard');
