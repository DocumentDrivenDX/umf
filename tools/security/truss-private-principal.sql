-- Owned experimental fixture; source-derived observer plus negative profiles.
CREATE ROLE umf_sec_principal_observer NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA security_raw TO umf_sec_principal_observer; GRANT CREATE ON SCHEMA security_raw TO umf_sec_principal_observer; GRANT SELECT ON pg_catalog.pg_roles TO umf_sec_principal_observer; GRANT EXECUTE ON FUNCTION pg_catalog.current_setting(text),pg_catalog.text(boolean),pg_catalog.nameeq(name,name) TO umf_sec_principal_observer; SET ROLE umf_sec_principal_observer; CREATE FUNCTION security_raw.private_principal() RETURNS TABLE(native_superuser text,native_bypass text,native_encoding text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $principal$ SELECT rolsuper::pg_catalog.text,rolbypassrls::pg_catalog.text,pg_catalog.current_setting('client_encoding')::pg_catalog.text FROM pg_catalog.pg_roles WHERE rolname OPERATOR(pg_catalog.=) SESSION_USER $principal$; REVOKE ALL ON FUNCTION security_raw.private_principal() FROM PUBLIC; RESET ROLE; REVOKE CREATE ON SCHEMA security_raw FROM umf_sec_principal_observer; GRANT EXECUTE ON FUNCTION security_raw.private_principal() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; CREATE ROLE umf_sec_observer_low NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT umf_sec_observer_low TO umf_sec_alice,umf_sec_bob,umf_sec_outsider WITH INHERIT FALSE,SET TRUE; GRANT USAGE ON SCHEMA security_raw TO umf_sec_observer_low; GRANT EXECUTE ON FUNCTION security_raw.private_principal() TO umf_sec_observer_low;
SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.diagnostic_closed_resources() RETURNS json LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $closed$ SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource $closed$; REVOKE ALL ON FUNCTION security_raw.diagnostic_closed_resources() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.diagnostic_closed_resources() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; RESET ROLE;
SET ROLE umf_sec_guardian;
CREATE FUNCTION security_raw.own_pid() RETURNS text LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT pg_catalog.pg_backend_pid()::pg_catalog.text $$;
REVOKE ALL ON FUNCTION security_raw.own_pid() FROM PUBLIC;
RESET ROLE;
GRANT CREATE ON SCHEMA security_raw TO umf_sec_principal_observer; SET ROLE umf_sec_principal_observer;
CREATE FUNCTION security_raw.bad_shape() RETURNS TABLE(native_superuser int,native_bypass text,native_encoding text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 0,'false'::text,'UTF8'::text $$;
CREATE FUNCTION security_raw.bad_flags() RETURNS TABLE(native_superuser text,native_bypass text,native_encoding text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 'false'::text,'true'::text,'UTF8'::text $$;
CREATE FUNCTION security_raw.no_rows() RETURNS TABLE(native_superuser text,native_bypass text,native_encoding text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 'false'::text,'false'::text,'UTF8'::text WHERE false $$;
CREATE FUNCTION security_raw.multi_rows() RETURNS TABLE(native_superuser text,native_bypass text,native_encoding text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 'false'::text,'false'::text,'UTF8'::text UNION ALL SELECT 'false'::text,'false'::text,'UTF8'::text $$;
REVOKE ALL ON FUNCTION security_raw.bad_shape(),security_raw.bad_flags(),security_raw.no_rows(),security_raw.multi_rows() FROM PUBLIC;
RESET ROLE;
REVOKE CREATE ON SCHEMA security_raw FROM umf_sec_principal_observer;

REVOKE SELECT ON ALL TABLES IN SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider; REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider; GRANT EXECUTE ON FUNCTION security_raw.diagnostic_closed_resources() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC; REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_catalog FROM PUBLIC; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_catalog TO umf_sec_guardian;
GRANT EXECUTE ON FUNCTION security_raw.private_principal(),security_raw.own_pid(),security_raw.bad_shape(),security_raw.bad_flags(),security_raw.no_rows(),security_raw.multi_rows() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
GRANT EXECUTE ON FUNCTION security_raw.private_principal() TO umf_sec_observer_low;

GRANT CREATE ON SCHEMA security_raw TO umf_sec_principal_observer;
GRANT EXECUTE ON FUNCTION pg_catalog.text(name) TO umf_sec_principal_observer;
SET ROLE umf_sec_principal_observer;
CREATE FUNCTION security_raw.subject_text(actor name) RETURNS TABLE(id text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT SESSION_USER::text WHERE actor OPERATOR(pg_catalog.=) SESSION_USER $$;
CREATE FUNCTION security_raw.subject_name(actor name) RETURNS TABLE(id name) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT SESSION_USER WHERE actor OPERATOR(pg_catalog.=) SESSION_USER $$;
CREATE FUNCTION security_raw.subject_missing(actor name) RETURNS TABLE(id text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT SESSION_USER::text WHERE false $$;
CREATE FUNCTION security_raw.subject_ambiguous(actor name) RETURNS TABLE(id text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT SESSION_USER::text UNION ALL SELECT SESSION_USER::text $$;
REVOKE ALL ON FUNCTION security_raw.subject_text(name),security_raw.subject_name(name),security_raw.subject_missing(name),security_raw.subject_ambiguous(name) FROM PUBLIC;
RESET ROLE;
REVOKE CREATE ON SCHEMA security_raw FROM umf_sec_principal_observer;
GRANT EXECUTE ON FUNCTION security_raw.subject_text(name),security_raw.subject_name(name),security_raw.subject_missing(name),security_raw.subject_ambiguous(name) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
