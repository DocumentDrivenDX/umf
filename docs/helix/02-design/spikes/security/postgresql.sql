-- Disposable PostgreSQL 17.9 feasibility fixture. Not Truss or Ashlar DDL.
CREATE ROLE umf_security_alice LOGIN;
CREATE ROLE umf_security_bob LOGIN;
CREATE ROLE umf_security_outsider LOGIN;
CREATE SCHEMA sec;
REVOKE ALL ON SCHEMA sec FROM PUBLIC;
GRANT USAGE ON SCHEMA sec TO umf_security_alice, umf_security_bob, umf_security_outsider;

CREATE TABLE sec.company(id text PRIMARY KEY);
CREATE TABLE sec.project(id text PRIMARY KEY, company_id text NOT NULL REFERENCES sec.company);
CREATE TABLE sec.staff(id text PRIMARY KEY, native_role text UNIQUE NOT NULL);
CREATE TABLE sec.assignment(staff_id text REFERENCES sec.staff, project_id text REFERENCES sec.project,
 active boolean NOT NULL, PRIMARY KEY(staff_id,project_id));
CREATE TABLE sec.resource(id text PRIMARY KEY, project_id text REFERENCES sec.project, value text NOT NULL);
INSERT INTO sec.company VALUES ('C');
INSERT INTO sec.project VALUES ('A','C'),('B','C');
INSERT INTO sec.staff VALUES ('Alice','umf_security_alice'),('Bob','umf_security_bob');
INSERT INTO sec.assignment VALUES ('Alice','A',true),('Alice','B',false),('Bob','B',true);
INSERT INTO sec.resource VALUES ('RA','A','public-A'),('RB','B','public-B'),('RO',NULL,'orphan');

CREATE FUNCTION sec.allowed(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sec AS $$
 SELECT EXISTS (SELECT 1 FROM sec.assignment a JOIN sec.staff s ON s.id=a.staff_id
 WHERE s.native_role=session_user::text AND a.project_id=p AND a.active)
$$;
REVOKE ALL ON FUNCTION sec.allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sec.allowed(text) TO umf_security_alice,umf_security_bob,umf_security_outsider;
ALTER TABLE sec.resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE sec.resource FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_read ON sec.resource FOR SELECT USING(sec.allowed(project_id));
CREATE POLICY resource_write ON sec.resource FOR ALL USING(sec.allowed(project_id)) WITH CHECK(sec.allowed(project_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON sec.resource TO umf_security_alice,umf_security_bob,umf_security_outsider;

-- Synthetic graph mapping: separately stored typed records and association endpoints.
CREATE TABLE sec.node(type_id text NOT NULL, id text NOT NULL, props jsonb NOT NULL,
 PRIMARY KEY(type_id,id));
CREATE TABLE sec.edge(type_id text NOT NULL,id text NOT NULL,source_type text NOT NULL,
 source_id text NOT NULL,target_type text NOT NULL,target_id text NOT NULL,props jsonb NOT NULL,
 PRIMARY KEY(type_id,id), FOREIGN KEY(source_type,source_id) REFERENCES sec.node(type_id,id),
 FOREIGN KEY(target_type,target_id) REFERENCES sec.node(type_id,id));
INSERT INTO sec.node VALUES ('Staff','Alice','{}'),('Staff','Bob','{}'),
 ('Project','A','{}'),('Project','B','{}'),
 ('Resource','RA','{"value":"public-A"}'),('Resource','RB','{"value":"public-B"}'),
 ('Resource','RO','{"value":"orphan"}');
INSERT INTO sec.edge VALUES
 ('Assignment','AA','Staff','Alice','Project','A','{"active":true}'),
 ('Assignment','AB','Staff','Alice','Project','B','{"active":false}'),
 ('Assignment','BB','Staff','Bob','Project','B','{"active":true}'),
 ('Ownership','OA','Resource','RA','Project','A','{}'),
 ('Ownership','OB','Resource','RB','Project','B','{}');
CREATE FUNCTION sec.graph_allowed(t text,r text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sec AS $$
 SELECT EXISTS(SELECT 1 FROM sec.edge o JOIN sec.edge a
 ON a.target_type=o.target_type AND a.target_id=o.target_id
 JOIN sec.staff s ON s.id=a.source_id
 WHERE o.type_id='Ownership' AND o.source_type=t AND o.source_id=r
 AND o.target_type='Project' AND a.type_id='Assignment' AND a.source_type='Staff'
 AND a.props->'active'='true'::jsonb AND s.native_role=session_user::text)
$$;
REVOKE ALL ON FUNCTION sec.graph_allowed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sec.graph_allowed(text,text) TO umf_security_alice,umf_security_bob,umf_security_outsider;
ALTER TABLE sec.node ENABLE ROW LEVEL SECURITY;
ALTER TABLE sec.node FORCE ROW LEVEL SECURITY;
CREATE POLICY node_read ON sec.node FOR SELECT
 USING(type_id='Resource' AND sec.graph_allowed(type_id,id));
GRANT SELECT ON sec.node TO umf_security_alice,umf_security_bob,umf_security_outsider;

-- Separate field protection profile. Base bags and retained bytes have no ordinary grants.
CREATE TABLE sec.secret_resource(id text PRIMARY KEY,project_id text NOT NULL REFERENCES sec.project,
 bag jsonb NOT NULL,retained text NOT NULL);
INSERT INTO sec.secret_resource VALUES
 ('SA','A','{"salary":100,"note":null}','raw-secret-A'),
 ('SB','B','{"salary":200}','raw-secret-B');
CREATE VIEW sec.safe_resource WITH (security_barrier=true) AS
 SELECT id, bag->'note' AS note,
 CASE WHEN bag ? 'note' THEN 'original' ELSE 'absent' END AS note_disposition,
 NULL::numeric AS salary,'withheld'::text AS salary_disposition
 FROM sec.secret_resource WHERE sec.allowed(project_id);
GRANT SELECT ON sec.safe_resource TO umf_security_alice,umf_security_bob,umf_security_outsider;

-- Native observation only: these permissions are intentionally absent.
REVOKE ALL ON sec.assignment,sec.staff,sec.edge,sec.secret_resource FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sec FROM PUBLIC;
