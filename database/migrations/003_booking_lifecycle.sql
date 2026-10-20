ALTER TABLE salon.appointments ADD COLUMN rescheduled_from uuid;
ALTER TABLE salon.appointments ADD CONSTRAINT appointment_tenant_id_unique UNIQUE(tenant_id,id);
ALTER TABLE salon.appointments ADD CONSTRAINT reschedule_tenant_fk FOREIGN KEY(tenant_id,rescheduled_from) REFERENCES salon.appointments(tenant_id,id);
ALTER TABLE salon.customers ADD COLUMN booking_consent_at timestamptz;
ALTER TABLE salon.customers ADD COLUMN consent_version text;
DROP POLICY tenant_read ON salon.tenants;
CREATE POLICY tenant_read ON salon.tenants FOR SELECT TO salon_api USING (
 created_by=salon.user_id() OR EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=id AND m.user_id=salon.user_id())
 OR (salon.public_access() AND slug=current_setting('app.slug',true) AND ((booking_enabled AND NOT suspended) OR current_setting('app.cancellation',true)='true'))
 OR current_setting('app.platform_admin',true)='true'
);
