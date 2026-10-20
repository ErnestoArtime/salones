CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA salon;
REVOKE ALL ON SCHEMA salon FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA salon TO salon_api;
CREATE TABLE salon.tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 created_by uuid NOT NULL REFERENCES auth.users(id), plan text NOT NULL DEFAULT 'trial' CHECK(plan IN ('trial','essential','studio')),
 booking_enabled boolean NOT NULL DEFAULT true, suspended boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE salon.memberships (
 tenant_id uuid NOT NULL REFERENCES salon.tenants(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('owner','manager','receptionist','professional')), PRIMARY KEY(tenant_id,user_id)
);
CREATE INDEX ON salon.memberships(user_id);
CREATE TABLE salon.branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), name text NOT NULL,
 timezone text NOT NULL DEFAULT 'Europe/Madrid', address text NOT NULL DEFAULT '', UNIQUE(tenant_id,id)
);
CREATE TABLE salon.services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), name text NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 480), buffer_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 120),
 price_cents integer NOT NULL CHECK(price_cents>=0), currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'), active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,id)
);
CREATE TABLE salon.employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), branch_id uuid NOT NULL,
 user_id uuid REFERENCES auth.users(id), name text NOT NULL, color text NOT NULL DEFAULT 'plum' CHECK(color IN ('plum','sage','clay','ochre')),
 active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,id), UNIQUE(tenant_id,user_id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES salon.branches(tenant_id,id)
);
CREATE TABLE salon.employee_services (
 tenant_id uuid NOT NULL REFERENCES salon.tenants(id), employee_id uuid NOT NULL, service_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,employee_id,service_id), FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES salon.services(tenant_id,id)
);
CREATE TABLE salon.customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), name text NOT NULL,
 email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE INDEX ON salon.customers(tenant_id,lower(email));
CREATE TABLE salon.schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), employee_id uuid NOT NULL,
 weekday integer NOT NULL CHECK(weekday BETWEEN 1 AND 7), start_time time NOT NULL, end_time time NOT NULL CHECK(end_time>start_time),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id),
 EXCLUDE USING gist(employee_id WITH =, weekday WITH =, int4range(extract(epoch FROM start_time)::int,extract(epoch FROM end_time)::int,'[)') WITH &&)
);
CREATE TABLE salon.absences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), employee_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at), reason text NOT NULL DEFAULT '',
 FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id)
);
CREATE INDEX ON salon.absences(tenant_id,employee_id,starts_at);
CREATE TABLE salon.appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), branch_id uuid NOT NULL,
 employee_id uuid NOT NULL, customer_id uuid NOT NULL, service_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at), blocked_until timestamptz NOT NULL CHECK(blocked_until>=ends_at),
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','completed','cancelled','no_show')),
 service_name text NOT NULL, price_cents integer NOT NULL CHECK(price_cents>=0), currency text NOT NULL DEFAULT 'EUR',
 notes text NOT NULL DEFAULT '', source text NOT NULL CHECK(source IN ('internal','public')),
 request_key uuid NOT NULL, request_hash text NOT NULL, cancellation_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,request_key),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES salon.branches(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES salon.customers(tenant_id,id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES salon.services(tenant_id,id),
 EXCLUDE USING gist(employee_id WITH =,tstzrange(starts_at,blocked_until,'[)') WITH &&) WHERE(status IN ('confirmed','completed'))
);
CREATE INDEX ON salon.appointments(tenant_id,starts_at);
CREATE TABLE salon.audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id), actor_id uuid,
 action text NOT NULL, entity_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION salon.user_id() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$ SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;
CREATE FUNCTION salon.tenant_id() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$ SELECT nullif(current_setting('app.tenant_id',true),'')::uuid $$;
CREATE FUNCTION salon.public_access() RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(current_setting('app.public',true),'')='true' $$;
-- RLS is enforced for the runtime role (never owner/superuser). Context is transaction-local.
ALTER TABLE salon.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON salon.tenants FOR SELECT TO salon_api USING (
 created_by=salon.user_id() OR EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=id AND m.user_id=salon.user_id())
 OR (salon.public_access() AND slug=current_setting('app.slug',true) AND booking_enabled AND NOT suspended)
 OR current_setting('app.platform_admin',true)='true'
);
CREATE POLICY tenant_create ON salon.tenants FOR INSERT TO salon_api WITH CHECK(created_by=salon.user_id());
CREATE POLICY tenant_update ON salon.tenants FOR UPDATE TO salon_api USING(created_by=salon.user_id() OR current_setting('app.platform_admin',true)='true') WITH CHECK(created_by=salon.user_id() OR current_setting('app.platform_admin',true)='true');
ALTER TABLE salon.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON salon.memberships FOR SELECT TO salon_api USING(user_id=salon.user_id() OR current_setting('app.platform_admin',true)='true');
CREATE POLICY membership_insert ON salon.memberships FOR INSERT TO salon_api WITH CHECK(EXISTS(SELECT 1 FROM salon.tenants t WHERE t.id=tenant_id AND t.created_by=salon.user_id()));
-- Other tables require a verified membership or the narrow public-booking transaction context.
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['branches','services','employees','employee_services','customers','schedules','absences','appointments','audit_log'] LOOP
  EXECUTE format('ALTER TABLE salon.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE salon.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY tenant_scope ON salon.%I TO salon_api USING (tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR salon.public_access())) WITH CHECK (tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR salon.public_access()))',tbl);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA salon TO salon_api;
REVOKE UPDATE,DELETE ON salon.audit_log FROM salon_api;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salon FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA salon TO salon_api;
