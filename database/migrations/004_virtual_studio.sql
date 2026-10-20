CREATE TABLE salon.studio_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES salon.tenants(id),
 uploaded_by uuid REFERENCES auth.users(id),kind text NOT NULL CHECK(kind IN ('reference','portrait','result')),
 storage_key text NOT NULL UNIQUE,byte_size integer NOT NULL CHECK(byte_size>0),
 consent_at timestamptz NOT NULL DEFAULT now(),consent_version text NOT NULL DEFAULT 'studio-v1',
 expires_at timestamptz,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id)
);
CREATE TABLE salon.hairstyles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES salon.tenants(id),
 employee_id uuid,service_id uuid NOT NULL,reference_asset_id uuid NOT NULL,
 name text NOT NULL,description text NOT NULL DEFAULT '',instructions text NOT NULL,
 category text NOT NULL CHECK(category IN ('cut','color','finish')),published boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES salon.services(tenant_id,id),
 FOREIGN KEY(tenant_id,reference_asset_id) REFERENCES salon.studio_assets(tenant_id,id)
);
CREATE TABLE salon.virtual_tryons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES salon.tenants(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),hairstyle_id uuid NOT NULL,portrait_asset_id uuid NOT NULL,result_asset_id uuid,
 customer_id uuid,appointment_id uuid,request_key uuid NOT NULL,request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 provider text NOT NULL,model text NOT NULL,error text,cost_cents integer,currency text NOT NULL DEFAULT 'USD',
 external_consent_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz,
 deleted_at timestamptz,UNIQUE(tenant_id,request_key),
 FOREIGN KEY(tenant_id,hairstyle_id) REFERENCES salon.hairstyles(tenant_id,id),
 FOREIGN KEY(tenant_id,portrait_asset_id) REFERENCES salon.studio_assets(tenant_id,id),
 FOREIGN KEY(tenant_id,result_asset_id) REFERENCES salon.studio_assets(tenant_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES salon.customers(tenant_id,id),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES salon.appointments(tenant_id,id)
);
CREATE INDEX ON salon.virtual_tryons(tenant_id,created_at);
CREATE INDEX ON salon.virtual_tryons(tenant_id,status) WHERE deleted_at IS NULL;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['studio_assets','hairstyles','virtual_tryons'] LOOP
  EXECUTE format('ALTER TABLE salon.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE salon.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY studio_tenant ON salon.%I TO salon_api USING(tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR current_setting(''app.studio_worker'',true)=''true'')) WITH CHECK(tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR current_setting(''app.studio_worker'',true)=''true''))',tbl);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON salon.studio_assets,salon.hairstyles,salon.virtual_tryons TO salon_api;
