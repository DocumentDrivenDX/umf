-- Native hash lookup is a candidate filter; the full key remains authoritative.
SET ROLE umf_sec_guardian;
CREATE TABLE security_raw.hash_resource(
 id text COLLATE "C" PRIMARY KEY,
 routing_hash integer GENERATED ALWAYS AS (pg_catalog.hashtext(id)) STORED,
 UNIQUE(routing_hash,id));
CREATE TABLE security_raw.hash_owner(
 resource_id text COLLATE "C" NOT NULL,
 routing_hash integer GENERATED ALWAYS AS (pg_catalog.hashtext(resource_id)) STORED,
 project_id text NOT NULL REFERENCES security_raw.project,
 PRIMARY KEY(resource_id,project_id),
 FOREIGN KEY(routing_hash,resource_id)
 REFERENCES security_raw.hash_resource(routing_hash,id));
CREATE INDEX hash_owner_candidates ON security_raw.hash_owner(routing_hash);
CREATE FUNCTION security_raw.hash_allowed(text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM security_raw.hash_owner o
 JOIN security_raw.m2m_employee_project a ON a.project_id=o.project_id
 JOIN security_raw.employee e ON e.id=a.employee_id
 WHERE o.routing_hash=pg_catalog.hashtext($1)
 AND o.resource_id=$1 COLLATE "C"
 AND a.active AND e.native_login=session_user::text)
$$;
REVOKE ALL ON FUNCTION security_raw.hash_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_raw.hash_allowed(text)
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
ALTER TABLE security_raw.hash_resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_raw.hash_resource FORCE ROW LEVEL SECURITY;
CREATE POLICY hash_resource_read ON security_raw.hash_resource FOR SELECT
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider
 USING(security_raw.hash_allowed(id));
GRANT SELECT ON security_raw.hash_resource
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
RESET ROLE;
