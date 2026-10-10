-- Disposable raw relational profile; no graph-backend qualification.
CREATE ROLE umf_sec_guardian NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_alice LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_bob LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_outsider LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA security_raw AUTHORIZATION umf_sec_guardian;
REVOKE ALL ON SCHEMA security_raw FROM PUBLIC;
GRANT USAGE ON SCHEMA security_raw TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
SET ROLE umf_sec_guardian;
CREATE TABLE security_raw.company(id text PRIMARY KEY);
CREATE TABLE security_raw.project(id text PRIMARY KEY,company_id text NOT NULL REFERENCES security_raw.company);
CREATE TABLE security_raw.employee(id text PRIMARY KEY,native_login text UNIQUE NOT NULL);
CREATE TABLE security_raw.m2m_employee_project(employee_id text REFERENCES security_raw.employee,project_id text REFERENCES security_raw.project,active boolean NOT NULL,PRIMARY KEY(employee_id,project_id));
CREATE TABLE security_raw.resource(id text PRIMARY KEY,value text NOT NULL);
CREATE TABLE security_raw.m2m_resource_project(resource_id text REFERENCES security_raw.resource,project_id text REFERENCES security_raw.project,PRIMARY KEY(resource_id,project_id));
INSERT INTO security_raw.company VALUES('C');
INSERT INTO security_raw.project VALUES('A','C'),('B','C'),('D','C');
INSERT INTO security_raw.employee VALUES('Alice','umf_sec_alice'),('Bob','umf_sec_bob');
INSERT INTO security_raw.m2m_employee_project VALUES('Alice','A',true),('Alice','B',false),('Bob','B',true);
INSERT INTO security_raw.resource VALUES('RA','A-only'),('RB','B-only'),('RD','unassigned-sibling'),('RO','ownerless'),('RAB','multiple-owners');
INSERT INTO security_raw.m2m_resource_project VALUES('RA','A'),('RB','B'),('RD','D'),('RAB','A'),('RAB','B');
CREATE FUNCTION security_raw.allowed(resource_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM security_raw.m2m_resource_project o
 JOIN security_raw.m2m_employee_project a ON a.project_id=o.project_id
 JOIN security_raw.employee e ON e.id=a.employee_id
 WHERE o.resource_id=$1 AND a.active AND e.native_login=session_user::text)
$$;
REVOKE ALL ON FUNCTION security_raw.allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_raw.allowed(text) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
ALTER TABLE security_raw.resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_raw.resource FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_read ON security_raw.resource FOR SELECT TO umf_sec_alice,umf_sec_bob,umf_sec_outsider USING(security_raw.allowed(id));
GRANT SELECT ON security_raw.resource TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
REVOKE ALL ON ALL TABLES IN SCHEMA security_raw FROM PUBLIC;
RESET ROLE;
-- Secured ontology traversal publication: source resource and target Project
-- both require current connection membership. Raw junctions remain private.
SET ROLE umf_sec_guardian;
CREATE POLICY resource_owner_projection ON security_raw.resource FOR SELECT TO umf_sec_guardian USING(security_raw.allowed(id));
CREATE VIEW security_raw.resource_project WITH (security_barrier=true) AS
 SELECT r.id AS resource_id,o.project_id
 FROM security_raw.resource r
 JOIN security_raw.m2m_resource_project o ON o.resource_id=r.id
 JOIN security_raw.m2m_employee_project a ON a.project_id=o.project_id AND a.active
 JOIN security_raw.employee e ON e.id=a.employee_id
 WHERE e.native_login=session_user::text;
GRANT SELECT ON security_raw.resource_project TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
RESET ROLE;
-- Private property/retained carriers and a dependent child home. Their ordinary
-- raw privileges are absent even when the owning resource's public row is visible.
SET ROLE umf_sec_guardian;
CREATE TABLE security_raw.resource_private_carrier(
 resource_id text PRIMARY KEY REFERENCES security_raw.resource,
 bag jsonb NOT NULL,retained bytea NOT NULL);
CREATE TABLE security_raw.resource_child_carrier(
 resource_id text PRIMARY KEY REFERENCES security_raw.resource,
 private_value text NOT NULL);
INSERT INTO security_raw.resource_private_carrier VALUES
 ('RA','{"salary":100,"note":null}',decode('7365637265742d41','hex')),
 ('RAB','{"salary":333}',decode('7365637265742d4142','hex')),
 ('RB','{"salary":200,"note":"hidden"}',decode('7365637265742d42','hex')),
 ('RD','{"salary":444}',decode('7365637265742d44','hex')),
 ('RO','{"salary":555}',decode('7365637265742d4f','hex'));
INSERT INTO security_raw.resource_child_carrier VALUES
 ('RA','child-secret-A'),('RAB','child-secret-AB'),('RB','child-secret-B'),
 ('RD','child-secret-D'),('RO','child-secret-O');
REVOKE ALL ON security_raw.resource_private_carrier,security_raw.resource_child_carrier FROM PUBLIC;
RESET ROLE;
-- Native typed field publication. Unknown note domains refuse instead of coercing.
SET ROLE umf_sec_guardian;
CREATE FUNCTION security_raw.note_cell(bag jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE f jsonb := '{"documentId":"domain","moduleId":"m","elementId":"note"}'::jsonb; note jsonb;
BEGIN
 IF jsonb_typeof(bag) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Unsupported note domain' USING ERRCODE='P0001'; END IF;
 note := bag->'note';
 IF NOT (bag ? 'note') THEN RETURN jsonb_build_object('field',f,'disposition','absent'); END IF;
 IF jsonb_typeof(note)='null' THEN RETURN jsonb_build_object('field',f,'disposition','original','value',NULL); END IF;
 IF jsonb_typeof(note)='string' THEN RETURN jsonb_build_object('field',f,'disposition','original','value',jsonb_build_object('string',note #>> '{}')); END IF;
 RAISE EXCEPTION 'Unsupported note domain' USING ERRCODE='P0001';
END $$;
REVOKE ALL ON FUNCTION security_raw.note_cell(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_raw.note_cell(jsonb) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
CREATE VIEW security_raw.resource_disclosure WITH (security_barrier=true) AS
 SELECT r.id,jsonb_build_array(
  jsonb_build_object('field','{"documentId":"domain","moduleId":"m","elementId":"resourceId"}'::jsonb,'disposition','original','value',jsonb_build_object('string',r.id)),
  security_raw.note_cell(p.bag),
  CASE WHEN r.id='RAB' THEN jsonb_build_object('field','{"documentId":"domain","moduleId":"m","elementId":"salary"}'::jsonb,'disposition','transformed','outputType','{"documentId":"domain","moduleId":"m","elementId":"resourceId"}'::jsonb,'value',jsonb_build_object('string','restricted'))
   ELSE jsonb_build_object('field','{"documentId":"domain","moduleId":"m","elementId":"salary"}'::jsonb,'disposition','withheld') END
 ) AS cells
 FROM security_raw.resource r LEFT JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id;
GRANT SELECT ON security_raw.resource_disclosure TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
RESET ROLE;
