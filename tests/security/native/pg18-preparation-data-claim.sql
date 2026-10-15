-- Private durable first-issued-data-transaction identity bridge.
-- Not current authority, a permit, one execution, selection or a seal.
CREATE SCHEMA umf_security;
REVOKE ALL ON SCHEMA umf_security FROM PUBLIC;
CREATE TABLE umf_security.preparation_data_claim (
 anchor_id pg_catalog.int4 PRIMARY KEY REFERENCES truss.preparation_attempt_anchor(anchor_id),
 claim_id pg_catalog.uuid NOT NULL UNIQUE,
 anchor_nonce pg_catalog.uuid NOT NULL,
 program_id pg_catalog.int8 NOT NULL REFERENCES truss.preparation_program_registration(program_id),
 program_identity pg_catalog.bytea NOT NULL,
 store_control_id pg_catalog.int8 NOT NULL,
 store_receipt_bytes pg_catalog.bytea NOT NULL,
 data_pid pg_catalog.int4 NOT NULL,
 data_xid pg_catalog.xid8 NOT NULL CHECK (data_xid > '0'::pg_catalog.xid8),
 data_role_oid pg_catalog.oid NOT NULL,
 data_backend_start pg_catalog.timestamptz NOT NULL,
 data_xact_start pg_catalog.timestamptz NOT NULL,
 coordinator_pid pg_catalog.int4 NOT NULL,
 coordinator_xid pg_catalog.xid8 NOT NULL,
 coordinator_backend_start pg_catalog.timestamptz NOT NULL,
 coordinator_xact_start pg_catalog.timestamptz NOT NULL,
 issuer_xid pg_catalog.xid8 NOT NULL,
 issued_at pg_catalog.timestamptz NOT NULL
);
CREATE TRIGGER preparation_data_claim_immutable
 BEFORE UPDATE OR DELETE OR TRUNCATE ON umf_security.preparation_data_claim
 FOR EACH STATEMENT EXECUTE FUNCTION truss.catalog_immutable();
ALTER TABLE umf_security.preparation_data_claim ENABLE ALWAYS TRIGGER preparation_data_claim_immutable;
REVOKE ALL ON TABLE umf_security.preparation_data_claim FROM PUBLIC;
REVOKE ALL ON TYPE umf_security.preparation_data_claim FROM PUBLIC;

-- E: excluded control issuer, independently COMMIT before C can consume.
CREATE FUNCTION umf_security.claim_preparation_data(
 original_anchor pg_catalog.int4, original_nonce pg_catalog.uuid,
 original_data_xid pg_catalog.xid8)
RETURNS pg_catalog.uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE a truss.preparation_attempt_anchor%ROWTYPE;
 p truss.preparation_program_registration%ROWTYPE;
 d pg_catalog.pg_stat_activity%ROWTYPE; c pg_catalog.pg_stat_activity%ROWTYPE;
 r umf_security.preparation_data_claim%ROWTYPE;
BEGIN
 IF current_setting('server_version_num')<>'180006'
  OR current_setting('transaction_isolation')<>'read committed'
  OR current_setting('transaction_read_only')<>'off'
  OR current_setting('role')<>'none'
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
  OR original_anchor IS NULL OR original_nonce IS NULL OR original_data_xid IS NULL THEN
  RAISE EXCEPTION 'excluded fresh control issuer required' USING ERRCODE='55000';
 END IF;
 SELECT * INTO a FROM ONLY truss.preparation_attempt_anchor
  WHERE anchor_id=original_anchor AND anchor_nonce=original_nonce FOR UPDATE NOWAIT;
 IF NOT FOUND OR pg_xact_status(a.issuer_xid) IS DISTINCT FROM 'committed'
  OR a.postmaster_started_at IS DISTINCT FROM pg_postmaster_start_time()
  OR a.database_oid IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())
  OR pg_backend_pid() IN (a.data_pid,a.coordinator_pid) THEN
  RAISE EXCEPTION 'original committed native anchor required' USING ERRCODE='55000';
 END IF;
 PERFORM truss.require_preparation_peer_xid(a.coordinator_pid,a.coordinator_xid);
 PERFORM truss.require_preparation_peer_xid(a.data_pid,original_data_xid);
 PERFORM pg_stat_clear_snapshot();
 SELECT * INTO d FROM pg_catalog.pg_stat_activity WHERE pid=a.data_pid;
 SELECT * INTO c FROM pg_catalog.pg_stat_activity WHERE pid=a.coordinator_pid;
 IF d.datid IS DISTINCT FROM a.database_oid OR c.datid IS DISTINCT FROM a.database_oid
  OR d.usesysid IS DISTINCT FROM a.data_role_oid OR c.usesysid IS DISTINCT FROM a.coordinator_role_oid
  OR d.backend_start IS DISTINCT FROM a.data_backend_started_at
  OR c.backend_start IS DISTINCT FROM a.coordinator_backend_started_at
  OR c.xact_start IS DISTINCT FROM a.coordinator_xact_started_at
  OR d.xact_start IS NULL OR d.state NOT IN ('active','idle in transaction')
  OR c.state NOT IN ('active','idle in transaction')
  OR d.backend_xid::text::numeric IS DISTINCT FROM mod(original_data_xid::text::numeric,4294967296)
  OR c.backend_xid::text::numeric IS DISTINCT FROM mod(a.coordinator_xid::text::numeric,4294967296)
  OR d.backend_type IS DISTINCT FROM 'client backend'
  OR c.backend_type IS DISTINCT FROM 'client backend' THEN
  RAISE EXCEPTION 'original live native incarnations required' USING ERRCODE='55000';
 END IF;
 SELECT r0.* INTO p FROM ONLY truss.preparation_program_registration r0
  WHERE convert_to('"'||r0.program_identity::text||'"','UTF8')=a.program_identity
   AND r0.store_control_id=a.store_control_id AND r0.store_receipt_bytes=a.store_receipt_bytes
   AND r0.issuer_xid IS DISTINCT FROM pg_current_xact_id() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'original committed same-store program required' USING ERRCODE='55000';END IF;
 -- Unique anchor means competing claims cannot replace or union native tuples.
 INSERT INTO umf_security.preparation_data_claim VALUES (
  a.anchor_id,gen_random_uuid(),a.anchor_nonce,p.program_id,a.program_identity,
  a.store_control_id,a.store_receipt_bytes,d.pid,original_data_xid,d.usesysid,
  d.backend_start,d.xact_start,c.pid,a.coordinator_xid,c.backend_start,c.xact_start,
  pg_current_xact_id(),clock_timestamp()) ON CONFLICT(anchor_id) DO NOTHING;
 SELECT * INTO STRICT r FROM ONLY umf_security.preparation_data_claim WHERE anchor_id=a.anchor_id;
 IF r.anchor_nonce IS DISTINCT FROM a.anchor_nonce OR r.program_id IS DISTINCT FROM p.program_id
  OR r.program_identity IS DISTINCT FROM a.program_identity
  OR r.store_control_id IS DISTINCT FROM a.store_control_id OR r.store_receipt_bytes IS DISTINCT FROM a.store_receipt_bytes
  OR r.data_pid IS DISTINCT FROM d.pid OR r.data_xid IS DISTINCT FROM original_data_xid
  OR r.data_role_oid IS DISTINCT FROM d.usesysid OR r.data_backend_start IS DISTINCT FROM d.backend_start
  OR r.data_xact_start IS DISTINCT FROM d.xact_start OR r.coordinator_pid IS DISTINCT FROM c.pid
  OR r.coordinator_xid IS DISTINCT FROM a.coordinator_xid
  OR r.coordinator_backend_start IS DISTINCT FROM c.backend_start OR r.coordinator_xact_start IS DISTINCT FROM c.xact_start THEN
  RAISE EXCEPTION 'anchor already bound to its original issued data transaction' USING ERRCODE='55000';
 END IF;
 RETURN r.claim_id;
END;
$$;
REVOKE ALL ON FUNCTION umf_security.claim_preparation_data(int4,uuid,xid8) FROM PUBLIC;

-- C: original fresh coordinator, identity tuple only; no minted authority.
-- D's older RR snapshot MUST NOT read the later E claim row.
CREATE FUNCTION umf_security.require_preparation_data_claim(
 original_anchor pg_catalog.int4, original_nonce pg_catalog.uuid)
RETURNS TABLE(claim_id pg_catalog.uuid,data_pid pg_catalog.int4,
 data_xid pg_catalog.xid8,program_id pg_catalog.int8)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a truss.preparation_attempt_anchor%ROWTYPE;
 r umf_security.preparation_data_claim%ROWTYPE;
 d pg_catalog.pg_stat_activity%ROWTYPE;
BEGIN
 IF truss.check_preparation_attempt_coordinator(original_anchor,original_nonce) IS NOT TRUE THEN
  RAISE EXCEPTION 'original current coordinator transaction required' USING ERRCODE='55000';END IF;
 SELECT * INTO a FROM ONLY truss.preparation_attempt_anchor WHERE anchor_id=original_anchor AND anchor_nonce=original_nonce;
 SELECT r0.* INTO r FROM ONLY umf_security.preparation_data_claim r0
  WHERE r0.anchor_id=original_anchor AND r0.anchor_nonce=original_nonce FOR SHARE NOWAIT;
 IF NOT FOUND OR pg_xact_status(r.issuer_xid) IS DISTINCT FROM 'committed'
  OR r.coordinator_pid IS DISTINCT FROM pg_backend_pid() OR r.coordinator_xid IS DISTINCT FROM pg_current_xact_id()
  OR r.coordinator_pid IS DISTINCT FROM a.coordinator_pid OR r.coordinator_xid IS DISTINCT FROM a.coordinator_xid
  OR r.coordinator_backend_start IS DISTINCT FROM a.coordinator_backend_started_at
  OR r.coordinator_xact_start IS DISTINCT FROM a.coordinator_xact_started_at
  OR r.data_pid IS DISTINCT FROM a.data_pid OR r.data_role_oid IS DISTINCT FROM a.data_role_oid
  OR r.data_backend_start IS DISTINCT FROM a.data_backend_started_at
  OR r.program_identity IS DISTINCT FROM a.program_identity OR r.store_control_id IS DISTINCT FROM a.store_control_id
  OR r.store_receipt_bytes IS DISTINCT FROM a.store_receipt_bytes
  OR NOT EXISTS(SELECT 1 FROM ONLY truss.preparation_program_registration p
   WHERE p.program_id=r.program_id AND p.store_control_id=r.store_control_id AND p.store_receipt_bytes=r.store_receipt_bytes
    AND convert_to('"'||p.program_identity::text||'"','UTF8')=r.program_identity AND p.issuer_xid IS DISTINCT FROM pg_current_xact_id()) THEN
  RAISE EXCEPTION 'original committed data claim and scope required' USING ERRCODE='55000';END IF;
 PERFORM truss.require_preparation_peer_xid(r.data_pid,r.data_xid);
 PERFORM pg_stat_clear_snapshot();
 SELECT * INTO d FROM pg_catalog.pg_stat_activity WHERE pid=r.data_pid;
 IF d.datid IS DISTINCT FROM a.database_oid OR d.usesysid IS DISTINCT FROM r.data_role_oid
  OR d.backend_start IS DISTINCT FROM r.data_backend_start OR d.xact_start IS DISTINCT FROM r.data_xact_start
  OR d.state NOT IN ('active','idle in transaction')
  OR d.backend_xid::text::numeric IS DISTINCT FROM mod(r.data_xid::text::numeric,4294967296) THEN
  RAISE EXCEPTION 'original issued data transaction is no longer live' USING ERRCODE='55000';END IF;
 RETURN QUERY SELECT r.claim_id,r.data_pid,r.data_xid,r.program_id;
END;
$$;
REVOKE ALL ON FUNCTION umf_security.require_preparation_data_claim(int4,uuid) FROM PUBLIC;
