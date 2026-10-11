-- Fixed synthetic mapping experiment; not a Truss installer or Weft lowering.
CREATE ROLE umf_graph_guardian NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_alice LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_bob LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_outsider LOGIN NOSUPERUSER NOBYPASSRLS;
ALTER SCHEMA truss OWNER TO umf_graph_guardian;
ALTER TABLE truss.object OWNER TO umf_graph_guardian;
ALTER TABLE truss.edge OWNER TO umf_graph_guardian;
REVOKE ALL ON ALL TABLES IN SCHEMA truss FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA truss FROM PUBLIC;
GRANT USAGE ON SCHEMA truss TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
-- Excluded table owner reads hidden facts; ordinary actors cannot assume it.
-- A fixed experiment binding, not a production attribute issuer.
CREATE FUNCTION truss.security_subject() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $subject$
DECLARE matches bigint; selected_id bigint;
BEGIN
 SELECT count(*),min(o.id) INTO matches,selected_id FROM truss.object o
 WHERE o.type_id=1 AND o.props->>'201'=SESSION_USER::text;
 IF matches<>1 THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security principal binding refused';
 END IF;
 RETURN selected_id;
END
$subject$;
ALTER FUNCTION truss.security_subject() OWNER TO umf_graph_guardian;
REVOKE ALL ON FUNCTION truss.security_subject() FROM PUBLIC;
CREATE FUNCTION truss.security_allowed(resource_id bigint, resource_type int)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $policy$
DECLARE subject_id bigint;
BEGIN
 subject_id:=truss.security_subject();
 RETURN resource_type=3 AND EXISTS (
 SELECT 1 FROM truss.edge own
 JOIN truss.edge assignment ON assignment.target_id=own.target_id
   AND assignment.target_type=own.target_type
 JOIN truss.object staff ON staff.id=assignment.source_id
   AND staff.type_id=assignment.source_type
 WHERE own.rel_type_id=12 AND own.source_type=3 AND own.target_type=2
   AND own.source_id=resource_id
   AND assignment.rel_type_id=11 AND assignment.source_type=1
   AND assignment.target_type=2 AND assignment.props->'301'='true'::jsonb
   AND staff.type_id=1 AND staff.id=subject_id);
END
$policy$;
ALTER FUNCTION truss.security_allowed(bigint,int) OWNER TO umf_graph_guardian;
REVOKE ALL ON FUNCTION truss.security_allowed(bigint,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION truss.security_allowed(bigint,int) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
ALTER TABLE truss.object ENABLE ROW LEVEL SECURITY;
CREATE POLICY security_resource_read ON truss.object FOR SELECT
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider
 USING (truss.security_allowed(id,type_id));
GRANT SELECT(id,type_id) ON truss.object TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
CREATE FUNCTION truss.security_resources() RETURNS TABLE(resource_id text,value text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $read$
BEGIN
 -- Mandatory even when there are zero candidate Resources.
 PERFORM truss.security_subject();
 RETURN QUERY SELECT o.props->>'101',o.props->>'102' FROM truss.object o
 WHERE o.type_id=3 AND truss.security_allowed(o.id,o.type_id);
END
$read$;
ALTER FUNCTION truss.security_resources() OWNER TO umf_graph_guardian;
REVOKE ALL ON FUNCTION truss.security_resources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION truss.security_resources() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
