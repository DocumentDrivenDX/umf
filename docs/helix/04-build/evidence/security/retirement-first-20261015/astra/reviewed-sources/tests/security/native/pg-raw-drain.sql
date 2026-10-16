-- Participating stable realm, ordinary revoker; full writer closure is separate.
CREATE ROLE umf_sec_revoker LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA security_drain AUTHORIZATION umf_sec_guardian;
REVOKE ALL ON SCHEMA security_drain FROM PUBLIC;
GRANT USAGE ON SCHEMA security_drain TO umf_sec_revoker;
SET ROLE umf_sec_guardian;
CREATE FUNCTION security_drain.revoke_alice() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(10070019);
 UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice';
 RETURN 'revoked';
END
$$;
REVOKE ALL ON FUNCTION security_drain.revoke_alice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_drain.revoke_alice() TO umf_sec_revoker;
RESET ROLE;
