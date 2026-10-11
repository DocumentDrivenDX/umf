-- Private full-byte operation input comparison. Original issuer/security remains separate.
CREATE FUNCTION truss.runtime_require_catalog_input(original_input bytea) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE op truss.row_home_operation%ROWTYPE;
BEGIN
 IF original_input IS NULL OR octet_length(original_input) NOT BETWEEN 1 AND 1048576 THEN
  RAISE EXCEPTION 'original complete input bytes required' USING ERRCODE='22023';
 END IF;
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase<>'application_finalized' FOR UPDATE;
 IF op.operation_kind<>'catalog-acceptance' OR op.phase<>'admitted' OR op.original_input_bytes IS DISTINCT FROM original_input THEN
  RAISE EXCEPTION 'prepared input differs from original admitted complete bytes' USING ERRCODE='55000';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_require_catalog_input(bytea) FROM PUBLIC;
CREATE FUNCTION truss.runtime_guard_operation_originals() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'operation removal requires original retention admission' USING ERRCODE='55000'; END IF;
 IF OLD.phase='application_finalized' OR OLD.original_writer_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()
  OR ROW(NEW.original_writer_xid,NEW.operation_ordinal,NEW.operation_kind,NEW.original_context_bytes,NEW.original_definition_bytes,NEW.original_input_bytes,NEW.original_prestate_bytes,NEW.admitted_candidate_bytes,NEW.effect_obligation_bytes,NEW.original_group_custody_bytes)
   IS DISTINCT FROM ROW(OLD.original_writer_xid,OLD.operation_ordinal,OLD.operation_kind,OLD.original_context_bytes,OLD.original_definition_bytes,OLD.original_input_bytes,OLD.original_prestate_bytes,OLD.admitted_candidate_bytes,OLD.effect_obligation_bytes,OLD.original_group_custody_bytes) THEN
  RAISE EXCEPTION 'original operation identity and artifact bytes are immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_guard_operation_originals() FROM PUBLIC;
CREATE TRIGGER runtime_operation_originals BEFORE UPDATE OR DELETE ON truss.row_home_operation FOR EACH ROW EXECUTE FUNCTION truss.runtime_guard_operation_originals();
CREATE TRIGGER runtime_operation_no_truncate BEFORE TRUNCATE ON truss.row_home_operation FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_guard_operation_originals();
ALTER TABLE truss.row_home_operation ENABLE ALWAYS TRIGGER runtime_operation_originals;
ALTER TABLE truss.row_home_operation ENABLE ALWAYS TRIGGER runtime_operation_no_truncate;
CREATE FUNCTION truss.runtime_require_catalog_document_carrier(documents jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE op truss.row_home_operation%ROWTYPE; original jsonb; item record; candidate jsonb;
BEGIN
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase<>'application_finalized' FOR UPDATE;
 IF op.operation_kind<>'catalog-acceptance' OR op.phase<>'admitted' OR octet_length(op.original_input_bytes)>1048576 THEN
  RAISE EXCEPTION 'original catalog input custody required' USING ERRCODE='55000';
 END IF;
 original:=convert_from(op.original_input_bytes,'UTF8')::jsonb;
 IF documents IS NULL OR jsonb_typeof(documents)<>'array' OR jsonb_typeof(original->'documents') IS DISTINCT FROM 'array'
  OR jsonb_array_length(documents)<>jsonb_array_length(original->'documents') OR jsonb_array_length(documents) NOT BETWEEN 1 AND 512 THEN
  RAISE EXCEPTION 'complete original document carrier correspondence' USING ERRCODE='55000';
 END IF;
 FOR item IN SELECT value,ordinality FROM jsonb_array_elements(original->'documents') WITH ORDINALITY LOOP
  candidate:=documents->(item.ordinality::int-1);
  IF candidate->>'documentId' IS DISTINCT FROM item.value->>'documentId' OR candidate->>'revision' IS DISTINCT FROM item.value->>'documentRevision'
   OR convert_to(candidate->>'originalText','UTF8') IS DISTINCT FROM decode(item.value->'artifact'->>'bytesBase64','base64') THEN
   RAISE EXCEPTION 'document carrier substitutes original admitted source bytes/order/identity' USING ERRCODE='55000';
  END IF;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_require_catalog_document_carrier(jsonb) FROM PUBLIC;
