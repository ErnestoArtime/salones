-- Additive migration. Financial entries are append-only for the runtime role.
CREATE TABLE salon.cash_days (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id),
 branch_id uuid NOT NULL, business_date date NOT NULL, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 opening_cents integer NOT NULL CHECK(opening_cents BETWEEN 0 AND 100000000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 opened_by uuid NOT NULL REFERENCES auth.users(id), opened_at timestamptz NOT NULL DEFAULT now(),
 closed_by uuid REFERENCES auth.users(id), closed_at timestamptz, counted_cents integer,
 expected_cents integer, difference_cents integer, totals jsonb, notes text NOT NULL DEFAULT '',
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,branch_id,business_date,currency),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES salon.branches(tenant_id,id),
 CHECK((status='open' AND closed_at IS NULL) OR (status='closed' AND closed_at IS NOT NULL AND counted_cents>=0 AND expected_cents IS NOT NULL AND difference_cents=counted_cents-expected_cents AND totals IS NOT NULL))
);
CREATE TABLE salon.commission_rates (
 tenant_id uuid NOT NULL REFERENCES salon.tenants(id), employee_id uuid NOT NULL, rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(tenant_id,employee_id), FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id)
);
CREATE TABLE salon.money_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES salon.tenants(id),
 cash_day_id uuid NOT NULL, appointment_id uuid, employee_id uuid, reverses_entry_id uuid,
 kind text NOT NULL CHECK(kind IN ('payment','refund','cash_in','cash_out','commission_payout')),
 method text NOT NULL CHECK(method IN ('cash','card','transfer','other')),
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
 commission_rate_bps integer NOT NULL DEFAULT 0 CHECK(commission_rate_bps BETWEEN 0 AND 10000),
 commission_cents integer NOT NULL DEFAULT 0, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 note text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL, request_hash text NOT NULL, UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_key),
 FOREIGN KEY(tenant_id,cash_day_id) REFERENCES salon.cash_days(tenant_id,id),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES salon.appointments(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES salon.employees(tenant_id,id),
 FOREIGN KEY(tenant_id,reverses_entry_id) REFERENCES salon.money_entries(tenant_id,id),
 CHECK((kind='payment' AND appointment_id IS NOT NULL AND employee_id IS NOT NULL AND reverses_entry_id IS NULL AND commission_cents BETWEEN 0 AND amount_cents)
    OR (kind='refund' AND appointment_id IS NOT NULL AND employee_id IS NOT NULL AND reverses_entry_id IS NOT NULL AND commission_cents BETWEEN -amount_cents AND 0)
    OR (kind='commission_payout' AND employee_id IS NOT NULL AND appointment_id IS NULL AND reverses_entry_id IS NULL AND commission_cents=0)
    OR (kind IN ('cash_in','cash_out') AND method='cash' AND employee_id IS NULL AND appointment_id IS NULL AND reverses_entry_id IS NULL AND commission_cents=0))
);
CREATE INDEX money_day_idx ON salon.money_entries(tenant_id,cash_day_id,created_at);
CREATE INDEX money_appointment_idx ON salon.money_entries(tenant_id,appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX money_employee_idx ON salon.money_entries(tenant_id,employee_id,currency) WHERE employee_id IS NOT NULL;
CREATE INDEX money_refund_idx ON salon.money_entries(tenant_id,reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['cash_days','commission_rates','money_entries'] LOOP
  EXECUTE format('ALTER TABLE salon.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE salon.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY finance_scope ON salon.%I TO salon_api USING(tenant_id=salon.tenant_id() AND EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id() AND m.role IN (''owner'',''manager'',''receptionist''))) WITH CHECK(tenant_id=salon.tenant_id() AND EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id() AND m.role IN (''owner'',''manager'',''receptionist'')))',tbl);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON salon.cash_days,salon.commission_rates TO salon_api;
GRANT SELECT,INSERT ON salon.money_entries TO salon_api;
REVOKE UPDATE,DELETE,TRUNCATE ON salon.money_entries FROM salon_api;

CREATE TABLE salon.studio_settings (
 tenant_id uuid PRIMARY KEY REFERENCES salon.tenants(id), enabled boolean NOT NULL DEFAULT true,
 monthly_limit integer NOT NULL DEFAULT 100 CHECK(monthly_limit BETWEEN 0 AND 100),
 updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE salon.studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon.studio_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY studio_settings_read ON salon.studio_settings FOR SELECT TO salon_api USING(tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR current_setting('app.studio_worker',true)='true'));
CREATE POLICY studio_settings_insert ON salon.studio_settings FOR INSERT TO salon_api WITH CHECK(tenant_id=salon.tenant_id() AND EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id() AND m.role IN ('owner','manager')));
CREATE POLICY studio_settings_update ON salon.studio_settings FOR UPDATE TO salon_api USING(tenant_id=salon.tenant_id() AND EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id() AND m.role IN ('owner','manager'))) WITH CHECK(tenant_id=salon.tenant_id());
GRANT SELECT,INSERT,UPDATE ON salon.studio_settings TO salon_api;
ALTER TABLE salon.virtual_tryons ADD COLUMN assessment text CHECK(assessment IN ('approved','rejected')),
 ADD COLUMN assessment_notes text NOT NULL DEFAULT '', ADD COLUMN assessed_by uuid REFERENCES auth.users(id), ADD COLUMN assessed_at timestamptz;
