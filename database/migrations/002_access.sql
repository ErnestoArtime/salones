ALTER TABLE salon.memberships ADD COLUMN email text NOT NULL DEFAULT '';
CREATE FUNCTION salon.owns_tenant(tid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM salon.tenants t WHERE t.id=tid AND t.created_by=salon.user_id())
$$;
REVOKE ALL ON FUNCTION salon.owns_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION salon.owns_tenant(uuid) TO salon_api;
DROP POLICY membership_read ON salon.memberships;
CREATE POLICY membership_read ON salon.memberships FOR SELECT TO salon_api USING(user_id=salon.user_id() OR salon.owns_tenant(tenant_id) OR current_setting('app.platform_admin',true)='true');
CREATE POLICY membership_update ON salon.memberships FOR UPDATE TO salon_api USING(salon.owns_tenant(tenant_id) AND role<>'owner') WITH CHECK(salon.owns_tenant(tenant_id) AND role<>'owner');
CREATE POLICY membership_delete ON salon.memberships FOR DELETE TO salon_api USING(salon.owns_tenant(tenant_id) AND role<>'owner');
CREATE FUNCTION salon.find_confirmed_user(email_input text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT salon.owns_tenant(salon.tenant_id()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN (SELECT u.id FROM auth.users u WHERE lower(u.email)=lower(email_input) AND u.email_confirmed_at IS NOT NULL LIMIT 1);
END;
$$;
REVOKE ALL ON FUNCTION salon.find_confirmed_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION salon.find_confirmed_user(text) TO salon_api;
DROP POLICY tenant_scope ON salon.audit_log;
CREATE POLICY audit_read_write ON salon.audit_log TO salon_api USING(tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR salon.public_access() OR current_setting('app.platform_admin',true)='true')) WITH CHECK(tenant_id=salon.tenant_id() AND (EXISTS(SELECT 1 FROM salon.memberships m WHERE m.tenant_id=salon.tenant_id() AND m.user_id=salon.user_id()) OR salon.public_access() OR current_setting('app.platform_admin',true)='true'));
