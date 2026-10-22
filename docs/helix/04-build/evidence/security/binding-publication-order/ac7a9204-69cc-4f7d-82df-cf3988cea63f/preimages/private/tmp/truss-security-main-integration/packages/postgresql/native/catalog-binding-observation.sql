-- Private current-operation source observation, not registered binding authority.
CREATE FUNCTION truss.runtime_collect_original_catalog_binding(original_revision int)
RETURNS TABLE(binding_hex text,input_hex text,binding_sha256 text,writer_xid text,operation_ordinal text,effect_generation text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE op truss.row_home_operation%ROWTYPE; archived truss.catalog_binding_archive%ROWTYPE;
 original_input jsonb; binding jsonb; artifact jsonb;
BEGIN
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o
  WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase<>'application_finalized' FOR UPDATE;
 IF op.operation_kind<>'catalog-acceptance' OR op.phase<>'admitted' OR original_revision IS NULL OR original_revision<=0 THEN
  RAISE EXCEPTION 'original binding observation admission required' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted
  AND l.relation='truss.schema_head'::regclass AND l.mode IN ('ExclusiveLock','AccessExclusiveLock')) THEN
  RAISE EXCEPTION 'original binding observation exclusion required' USING ERRCODE='55000';
 END IF;
 PERFORM * FROM truss.runtime_collect_new_core_catalog_inventory(original_revision);
 SELECT a.* INTO archived FROM truss.catalog_binding_archive a WHERE a.revision=original_revision;
 IF NOT FOUND OR archived.original_writer_xid IS DISTINCT FROM op.original_writer_xid
  OR archived.original_input_bytes IS DISTINCT FROM op.original_input_bytes THEN
  RAISE EXCEPTION 'original binding archive operation correspondence required' USING ERRCODE='55000';
 END IF;
 original_input:=convert_from(op.original_input_bytes,'UTF8')::jsonb;
 binding:=original_input->'binding';artifact:=binding->'artifact';
 IF original_input->>'interfaceVersion' IS DISTINCT FROM 'truss-acceptance-input/0.1.0'
  OR binding->>'state' IS DISTINCT FROM 'present'
  OR archived.vocabulary IS DISTINCT FROM binding->'vocabulary'
  OR archived.artifact_identity_utf8 IS DISTINCT FROM convert_to(artifact->>'identity','UTF8')
  OR encode(archived.binding_sha256,'hex') IS DISTINCT FROM artifact->>'sha256'
  OR archived.binding_sha256 IS DISTINCT FROM sha256(archived.original_binding_bytes)
  OR archived.original_binding_bytes IS DISTINCT FROM decode(artifact->>'bytesBase64','base64') THEN
  RAISE EXCEPTION 'original binding archive artifact correspondence required' USING ERRCODE='55000';
 END IF;
 RETURN QUERY SELECT encode(archived.original_binding_bytes,'hex'),encode(archived.original_input_bytes,'hex'),
  encode(archived.binding_sha256,'hex'),op.original_writer_xid::text,op.operation_ordinal::text,op.effect_generation::text;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_collect_original_catalog_binding(int) FROM PUBLIC;
