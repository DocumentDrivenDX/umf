-- Fixed source-bound P04 witness, not a general policy compiler or installer.
CREATE ROLE umf_sec_mw_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA security_mask_write AUTHORIZATION umf_sec_mw_owner;
REVOKE ALL ON SCHEMA security_mask_write FROM PUBLIC;
SET ROLE umf_sec_mw_owner;
CREATE TABLE security_mask_write.subject(
 login text COLLATE "C" PRIMARY KEY,
 read_class text COLLATE "C" NOT NULL CHECK(read_class IN('original','masked','withheld','denied')),
 normal_allowed boolean NOT NULL,field_allowed boolean NOT NULL,blind_allowed boolean NOT NULL);
CREATE TABLE security_mask_write.resource(id text COLLATE "C" PRIMARY KEY,amount bigint);
INSERT INTO security_mask_write.resource VALUES('r1',100);
ALTER TABLE security_mask_write.resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_mask_write.resource FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON security_mask_write.resource TO umf_sec_mw_owner USING(true) WITH CHECK(true);
CREATE SEQUENCE security_mask_write.effects;
CREATE VIEW security_mask_write.disclosed WITH(security_barrier=true) AS
 SELECT r.id,CASE s.read_class
  WHEN 'original' THEN jsonb_build_object('disposition','original','value',CASE WHEN r.amount IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('integerToken',r.amount::text) END)
  WHEN 'masked' THEN '{"disposition":"transformed","value":{"integerToken":"0"}}'::jsonb
  ELSE '{"disposition":"withheld"}'::jsonb END AS cell
 FROM security_mask_write.resource r JOIN security_mask_write.subject s ON s.login=SESSION_USER::text
 WHERE s.read_class IN('original','masked','withheld');
CREATE FUNCTION security_mask_write.assign_amount(requested_id text,proposed bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor security_mask_write.subject%ROWTYPE; before_value bigint;
BEGIN
 IF current_setting('server_version_num') IS DISTINCT FROM '180006'
  OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  OR current_setting('transaction_read_only') IS DISTINCT FROM 'off'
  OR current_setting('role') IS DISTINCT FROM 'none' THEN
  RAISE EXCEPTION 'Unsupported write context' USING ERRCODE='0A000';
 END IF;
 IF requested_id IS NULL THEN
  RAISE EXCEPTION 'Invalid public Resource Key' USING ERRCODE='22023';
 END IF;
 LOCK TABLE security_mask_write.subject IN SHARE MODE NOWAIT;
 BEGIN
  SELECT * INTO STRICT actor FROM security_mask_write.subject WHERE login=SESSION_USER::text;
 EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'Write authorization refused' USING ERRCODE='42501';
 END;
 -- Assignment intent is checked BEFORE hidden lookup/equality, even for no-op.
 -- The exact authored profile declares blindAmount only for the amount Field.
 IF actor.normal_allowed IS NOT TRUE OR actor.field_allowed IS NOT TRUE
  OR (actor.read_class='original' OR actor.blind_allowed) IS NOT TRUE THEN
  RAISE EXCEPTION 'Write authorization refused' USING ERRCODE='42501';
 END IF;
 SELECT amount INTO before_value FROM security_mask_write.resource WHERE id=requested_id FOR UPDATE;
 IF FOUND AND before_value IS DISTINCT FROM proposed THEN
  UPDATE security_mask_write.resource SET amount=proposed WHERE id=requested_id;
  PERFORM nextval('security_mask_write.effects'::regclass);
 END IF;
 -- No affected count, old/new or presence result; unknown IDs acknowledge too.
 RETURN '{"status":"acknowledged"}'::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION security_mask_write.assign_amount(text,bigint) FROM PUBLIC;
RESET ROLE;
