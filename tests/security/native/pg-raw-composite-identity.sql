-- Fixed authored composite-key witness; not compiler-installed admission.
SET ROLE umf_sec_guardian;
CREATE TABLE security_raw.composite_resource(
 namespace text COLLATE "C" NOT NULL,
 id text COLLATE "C" NOT NULL,
 PRIMARY KEY(namespace,id));
CREATE TABLE security_raw.composite_owner(
 namespace text COLLATE "C" NOT NULL,
 id text COLLATE "C" NOT NULL,
 project_id text NOT NULL REFERENCES security_raw.project,
 PRIMARY KEY(namespace,id,project_id),
 FOREIGN KEY(namespace,id) REFERENCES security_raw.composite_resource);
CREATE TABLE security_raw.composite_subject(
 namespace text COLLATE "C" NOT NULL,
 id text COLLATE "C" NOT NULL,
 native_login text UNIQUE NOT NULL,
 PRIMARY KEY(namespace,id));
CREATE TABLE security_raw.composite_assignment(
 subject_namespace text COLLATE "C" NOT NULL,
 subject_id text COLLATE "C" NOT NULL,
 project_id text NOT NULL REFERENCES security_raw.project,
 active boolean NOT NULL,
 PRIMARY KEY(subject_namespace,subject_id,project_id),
 FOREIGN KEY(subject_namespace,subject_id)
 REFERENCES security_raw.composite_subject(namespace,id));
CREATE FUNCTION security_raw.composite_allowed(text,text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM security_raw.composite_owner o
 JOIN security_raw.m2m_employee_project a ON a.project_id=o.project_id
 JOIN security_raw.employee e ON e.id=a.employee_id
 WHERE o.namespace=$1 COLLATE "C" AND o.id=$2 COLLATE "C"
 AND a.active AND e.native_login=session_user::text)
$$;
REVOKE ALL ON FUNCTION security_raw.composite_allowed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_raw.composite_allowed(text,text)
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
ALTER TABLE security_raw.composite_resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_raw.composite_resource FORCE ROW LEVEL SECURITY;
CREATE POLICY composite_read ON security_raw.composite_resource FOR SELECT
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider
 USING(security_raw.composite_allowed(namespace,id));
GRANT SELECT ON security_raw.composite_resource
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
CREATE TABLE security_raw."QuotedResource"(
 "Tenant" text COLLATE "C" NOT NULL,
 "ResourceID" text COLLATE "C" NOT NULL,
 PRIMARY KEY("Tenant","ResourceID"));
-- Case-distinct homes carry equal local labels with opposite Project ownership.
CREATE TABLE security_raw.quotedresource(tenant text COLLATE "C" NOT NULL,resourceid text COLLATE "C" NOT NULL,PRIMARY KEY(tenant,resourceid));
ALTER TABLE security_raw.quotedresource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_raw.quotedresource FORCE ROW LEVEL SECURITY;
CREATE POLICY lower_quoted_read ON security_raw.quotedresource FOR SELECT
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider
 USING(security_raw.composite_allowed(tenant,resourceid));
GRANT SELECT ON security_raw.quotedresource
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
ALTER TABLE security_raw."QuotedResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_raw."QuotedResource" FORCE ROW LEVEL SECURITY;
CREATE POLICY quoted_read ON security_raw."QuotedResource" FOR SELECT
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider
 USING(security_raw.composite_allowed("Tenant","ResourceID"));
GRANT SELECT ON security_raw."QuotedResource"
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
RESET ROLE;
