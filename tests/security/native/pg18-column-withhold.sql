-- P01 fixed relational carrier profile. Installed only in the owned disposable DB.
CREATE SCHEMA security_columns AUTHORIZATION umf_sec_guardian;
REVOKE ALL ON SCHEMA security_columns FROM PUBLIC;
GRANT USAGE ON SCHEMA security_columns TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
CREATE ROLE umf_sec_column_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
SET ROLE umf_sec_guardian;
CREATE TABLE security_columns.resource(
 id text COLLATE "C" PRIMARY KEY,
 label text COLLATE "C" NOT NULL,
 public_note text COLLATE "C",
 secret text COLLATE "C" NOT NULL,
 private_audit jsonb NOT NULL);
INSERT INTO security_columns.resource VALUES
 ('RA','A label',NULL,'private-A','{"staff":"Alice"}'),
 ('RAB','Shared label','visible é','private-AB','{"staff":"Alice and Bob"}'),
 ('RB','B label','visible B','private-B','{"staff":"Bob"}'),
 ('RD','Unassigned label',NULL,'private-D','{"staff":"nobody"}'),
 ('RO','Ownerless label',NULL,'private-O','{"staff":"nobody"}');
ALTER TABLE security_columns.resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_columns.resource FORCE ROW LEVEL SECURITY;
CREATE POLICY member_read ON security_columns.resource FOR SELECT
 TO umf_sec_alice,umf_sec_bob,umf_sec_outsider,umf_sec_guardian
 USING(security_raw.allowed(id));
REVOKE ALL ON security_columns.resource FROM PUBLIC;
GRANT SELECT(id,label,public_note) ON security_columns.resource TO umf_sec_column_reader;
-- This invoker view cannot convert owner SELECT into ordinary SELECT.
CREATE VIEW security_columns.invoker_probe WITH (security_invoker=true,security_barrier=true)
 AS SELECT id,secret FROM security_columns.resource;
GRANT SELECT ON security_columns.invoker_probe TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
-- Excluded owner view has no ordinary grant. Its deliberate grant is a negative control.
CREATE VIEW security_columns.owner_probe WITH (security_barrier=true)
 AS SELECT id,secret FROM security_columns.resource;
RESET ROLE;
GRANT umf_sec_column_reader TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
