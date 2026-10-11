-- ADR-008 trusted-host issued ordinal candidate; not installed readiness.
-- Private pre-effect configuration capture; registered meaning/installed authority remain unqualified.
-- Context0.4 original epoch/actor/asserted byte capture component; not complete installed admission.
-- Context0.3 private byte-capture component; strict origin decoding/profile and installed authority remain separate.
-- Internal operation admission on the original 0.13 registry.
-- No public EXECUTE or capability readiness. Full producer/finalizer follows separately.
CREATE FUNCTION truss.runtime_admit_operation_with_configuration_context(
  issued_ordinal bigint, kind text, definition_bytes bytea, input_bytes bytea, prestate_bytes bytea,
  candidate_bytes bytea, obligation_bytes bytea, group_bytes bytea,
  asserted_bytes bytea, capture_profile_bytes bytea,
  expected_installation text, expected_epoch text, expected_incarnation text, configuration_profile_bytes bytea
) RETURNS TABLE(writer_xid text, ordinal text, context_hex text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  native_xid xid8;
  head_revision int;
  next_ordinal bigint;
  native_context bytea;
  epoch_capture record;
  configuration_sizes record;
  captured_configuration truss.installation_admission%ROWTYPE;
  item bytea;
  total_bytes bigint := 0;
BEGIN
  IF issued_ordinal IS NULL OR issued_ordinal < 0 THEN
    RAISE EXCEPTION 'invalid host-issued operation ordinal' USING ERRCODE='22023';
  END IF;
  -- This component observes at an invoker boundary. Never capture a nested
  -- definer owner as the selected operation actor. Full role OID/grammar and
  -- original public-entry custody remain separately qualified obligations.
  IF current_user::text IS DISTINCT FROM (CASE
      WHEN current_setting('role')='none' THEN session_user::text
      ELSE current_setting('role') END) THEN
    RAISE EXCEPTION 'original invoker actor boundary required' USING ERRCODE='55000';
  END IF;
  IF kind IS NULL OR kind NOT IN ('mutation','import','catalog-transform',
       'catalog-acceptance','home-migration','administrative-repair') THEN
    RAISE EXCEPTION 'unsupported operation kind' USING ERRCODE='22023';
  END IF;
  IF asserted_bytes IS NULL OR octet_length(asserted_bytes) NOT BETWEEN 1 AND 131072
    OR capture_profile_bytes IS NULL OR octet_length(capture_profile_bytes) NOT BETWEEN 1 AND 65536 THEN
    RAISE EXCEPTION 'original asserted capture bounds' USING ERRCODE='22023';
  END IF;
  FOREACH item IN ARRAY ARRAY[definition_bytes,input_bytes,prestate_bytes,
      candidate_bytes,obligation_bytes,group_bytes,asserted_bytes,capture_profile_bytes] LOOP
    IF item IS NULL OR octet_length(item) NOT BETWEEN 1 AND 1048576 THEN
      RAISE EXCEPTION 'original artifact bound' USING ERRCODE='22023';
    END IF;
    total_bytes := total_bytes + octet_length(item);
  END LOOP;
  IF total_bytes > 4194304 THEN
    RAISE EXCEPTION 'operation artifact aggregate bound' USING ERRCODE='54000';
  END IF;
  -- Lock/observe original current epoch before catalog/business admission.
  -- Expected values compare facts; trusted deployment admission is separate.
  SELECT * INTO STRICT epoch_capture FROM truss.runtime_lock_source_epoch(
    expected_installation,expected_epoch,expected_incarnation);
  total_bytes := total_bytes + (octet_length(epoch_capture.profile_hex)+octet_length(epoch_capture.evidence_hex))/2;
  IF total_bytes>4194304 THEN
    RAISE EXCEPTION 'original epoch artifact aggregate bound' USING ERRCODE='54000';
  END IF;
  -- Catalog exclusion precedes operation-registry and business locks.
  -- Never upgrade an earlier shared head admission in this internal profile.
  IF kind='catalog-acceptance' THEN
    IF EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted
        AND l.relation='truss.schema_head'::regclass AND l.mode IN ('RowShareLock','RowExclusiveLock'))
        AND NOT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted
          AND l.relation='truss.schema_head'::regclass AND l.mode IN ('ExclusiveLock','AccessExclusiveLock')) THEN
      RAISE EXCEPTION 'earlier shared head admission cannot upgrade to catalog exclusion' USING ERRCODE='55000';
    END IF;
    LOCK TABLE truss.schema_head IN EXCLUSIVE MODE;
  END IF;
  SELECT h.rev INTO STRICT head_revision FROM truss.schema_head h WHERE h.id=1 FOR SHARE;
  IF configuration_profile_bytes IS NULL OR octet_length(configuration_profile_bytes) NOT BETWEEN 1 AND 65536 THEN
    RAISE EXCEPTION 'original configuration profile bounds' USING ERRCODE='22023';
  END IF;
  SELECT octet_length(a.configuration_bytes)::bigint AS configuration,
    octet_length(a.selected_binding_bytes)::bigint AS binding,
    octet_length(a.installed_inventory_bytes)::bigint AS inventory
    INTO configuration_sizes FROM truss.installation_admission a WHERE a.head_id=1;
  IF NOT FOUND OR configuration_sizes.configuration<1 OR configuration_sizes.binding<1
    OR configuration_sizes.inventory<1 OR configuration_sizes.configuration+configuration_sizes.binding+configuration_sizes.inventory>16777216 THEN
    RAISE EXCEPTION 'original pre-effect configuration bounds' USING ERRCODE='55000';
  END IF;
  total_bytes:=total_bytes+configuration_sizes.configuration+configuration_sizes.binding+configuration_sizes.inventory+octet_length(configuration_profile_bytes);
  IF total_bytes>20971520 THEN
    RAISE EXCEPTION 'configuration operation aggregate bounds' USING ERRCODE='54000';
  END IF;
  SELECT a.* INTO STRICT captured_configuration FROM truss.installation_admission a WHERE a.head_id=1;
  IF captured_configuration.installation_id_utf8 IS DISTINCT FROM convert_to(epoch_capture.installation_id,'UTF8')
    OR captured_configuration.source_epoch_utf8 IS DISTINCT FROM convert_to(epoch_capture.source_epoch,'UTF8')
    OR captured_configuration.configuration_generation<0
    OR captured_configuration.key_reuse NOT IN ('forbid','allow')
    OR captured_configuration.journal_mode NOT IN ('engine','trigger') THEN
    RAISE EXCEPTION 'original pre-effect configuration correspondence' USING ERRCODE='55000';
  END IF;
  native_xid := pg_current_xact_id();
  IF EXISTS (SELECT 1 FROM truss.row_home_operation AS o
      WHERE o.original_writer_xid=native_xid AND o.phase<>'application_finalized') THEN
    RAISE EXCEPTION 'unfinished operation' USING ERRCODE='55000';
  END IF;
  -- Host custody owns nonreuse across rolled-back attempts (ADR-008).
  -- Native state independently rejects conflicts with surviving operations.
  IF EXISTS (SELECT 1 FROM truss.row_home_operation AS o
      WHERE o.original_writer_xid=native_xid AND o.operation_ordinal >= issued_ordinal) THEN
    RAISE EXCEPTION 'host-issued ordinal conflicts with surviving operation' USING ERRCODE='55000';
  END IF;
  next_ordinal := issued_ordinal;
  native_context := convert_to(jsonb_build_object(
    'interfaceVersion','truss-native-operation-context/0.4',
    'xid',native_xid::text,'ordinal',next_ordinal::text,
    'sessionUser',session_user::text,'actingUser',current_user::text,
    'actorRoleOid',(SELECT r.oid::text FROM pg_catalog.pg_roles r WHERE r.rolname=current_user),
    'sessionRoleOid',(SELECT r.oid::text FROM pg_catalog.pg_roles r WHERE r.rolname=session_user),
    'database',current_database(),'backendPid',pg_backend_pid()::text,
    'assertedOriginUtf8Hex',encode(asserted_bytes,'hex'),
    'assertedOriginCaptureProfileHex',encode(capture_profile_bytes,'hex'),
    'installationId',epoch_capture.installation_id,'sourceEpoch',epoch_capture.source_epoch,
    'targetIncarnation',epoch_capture.target_incarnation,
    'sourceEpochProfileHex',epoch_capture.profile_hex,
    'sourceEpochEvidenceHex',epoch_capture.evidence_hex
  )::text,'UTF8');
  IF octet_length(native_context)>1048576 THEN
    RAISE EXCEPTION 'original encoded context bound' USING ERRCODE='54000';
  END IF;
  IF total_bytes+octet_length(native_context)>20971520 THEN
    RAISE EXCEPTION 'configuration encoded operation aggregate bounds' USING ERRCODE='54000';
  END IF;
  INSERT INTO truss.row_home_operation(original_writer_xid,operation_ordinal,
    operation_kind,phase,effect_generation,original_context_bytes,
    original_definition_bytes,original_input_bytes,original_prestate_bytes,
    admitted_candidate_bytes,effect_obligation_bytes,original_group_custody_bytes)
  VALUES(native_xid,next_ordinal,kind,'admitted',0,native_context,
    definition_bytes,input_bytes,prestate_bytes,candidate_bytes,obligation_bytes,group_bytes);
  INSERT INTO truss.operation_configuration(original_writer_xid,operation_ordinal,
    installation_id,source_epoch,target_incarnation,configuration_generation,
    key_reuse,journal_mode,original_context_sha256,admission_profile_bytes,
    configuration_bytes,selected_binding_bytes,installed_inventory_bytes)
  VALUES(native_xid,next_ordinal,epoch_capture.installation_id,epoch_capture.source_epoch,
    epoch_capture.target_incarnation,captured_configuration.configuration_generation,
    captured_configuration.key_reuse,captured_configuration.journal_mode,sha256(native_context),
    configuration_profile_bytes,captured_configuration.configuration_bytes,
    captured_configuration.selected_binding_bytes,captured_configuration.installed_inventory_bytes);
  RETURN QUERY SELECT native_xid::text,next_ordinal::text,encode(native_context,'hex');
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_admit_operation_with_configuration_context(bigint,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,text,text,text,bytea) FROM PUBLIC;
