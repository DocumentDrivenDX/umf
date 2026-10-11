-- Private catalog non-row generation observer. Full issuer/security/finalizer remains required.
CREATE FUNCTION truss.runtime_observe_catalog_generation() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE op truss.row_home_operation%ROWTYPE; actual_xid xid8:=pg_current_xact_id_if_assigned();
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_WHEN<>'AFTER' OR TG_OP NOT IN ('INSERT','UPDATE','DELETE')
  OR TG_TABLE_SCHEMA<>'truss' OR TG_NARGS<>0 OR actual_xid IS NULL OR TG_TABLE_NAME NOT IN ('schema_rev','schema_doc','type_def','prop_def','key_def','key_lifecycle_history','rel_def','rel_endpoint','relationship_lineage','catalog_acceptance_report','schema_head','catalog_binding_archive') THEN
  RAISE EXCEPTION 'original registered catalog event required' USING ERRCODE='55000';
 END IF;
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o WHERE o.original_writer_xid=actual_xid AND o.phase<>'application_finalized' FOR UPDATE;
 IF op.operation_kind<>'catalog-acceptance' OR NOT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted
   AND l.relation='truss.schema_head'::regclass AND l.mode IN ('ExclusiveLock','AccessExclusiveLock')) THEN
  RAISE EXCEPTION 'original catalog acceptance exclusion required' USING ERRCODE='55000';
 END IF;
 IF op.effect_generation=9223372036854775807 THEN RAISE EXCEPTION 'catalog generation exhausted' USING ERRCODE='54000'; END IF;
 UPDATE truss.row_home_operation o SET effect_generation=o.effect_generation+1,phase='admitted',
  readiness_generation=NULL,sealed_generation=NULL,application_generation=NULL,application_result_bytes=NULL
  WHERE o.original_writer_xid=actual_xid AND o.operation_ordinal=op.operation_ordinal;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_observe_catalog_generation() FROM PUBLIC;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.schema_rev
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.schema_rev ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.schema_doc
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.schema_doc ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.type_def
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.type_def ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.prop_def
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.prop_def ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.key_def
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.key_def ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.key_lifecycle_history
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.key_lifecycle_history ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.rel_def
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.rel_def ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.rel_endpoint
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.rel_endpoint ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.relationship_lineage
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.relationship_lineage ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.catalog_acceptance_report
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.catalog_acceptance_report ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE TRIGGER runtime_catalog_generation AFTER INSERT OR UPDATE OR DELETE ON truss.schema_head
 FOR EACH ROW EXECUTE FUNCTION truss.runtime_observe_catalog_generation();
ALTER TABLE truss.schema_head ENABLE ALWAYS TRIGGER runtime_catalog_generation;
CREATE FUNCTION truss.runtime_refuse_catalog_truncate() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'catalog truncate has no admitted complete effect procedure' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_refuse_catalog_truncate() FROM PUBLIC;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.schema_rev
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.schema_rev ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.schema_doc
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.schema_doc ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.type_def
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.type_def ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.prop_def
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.prop_def ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.key_def
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.key_def ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.key_lifecycle_history
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.key_lifecycle_history ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.rel_def
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.rel_def ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.rel_endpoint
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.rel_endpoint ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.relationship_lineage
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.relationship_lineage ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.catalog_acceptance_report
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.catalog_acceptance_report ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
CREATE TRIGGER runtime_catalog_no_truncate BEFORE TRUNCATE ON truss.schema_head
 FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_refuse_catalog_truncate();
ALTER TABLE truss.schema_head ENABLE ALWAYS TRIGGER runtime_catalog_no_truncate;
