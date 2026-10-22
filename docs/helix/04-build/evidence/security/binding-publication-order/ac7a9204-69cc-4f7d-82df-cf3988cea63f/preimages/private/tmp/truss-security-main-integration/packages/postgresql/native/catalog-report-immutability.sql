-- Private immutable byte-home component. Insert/publication/retention authority
-- and complete report semantics remain separate protected producer obligations.
CREATE FUNCTION truss.runtime_immutable_catalog_report() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_RELID<>'truss.catalog_acceptance_report'::regclass OR TG_NARGS<>0
  OR TG_WHEN<>'BEFORE' OR NOT (
   (TG_LEVEL='ROW' AND TG_OP IN ('UPDATE','DELETE'))
   OR (TG_LEVEL='STATEMENT' AND TG_OP='TRUNCATE')) THEN
  RAISE EXCEPTION 'unregistered immutable report event' USING ERRCODE='55000';
 END IF;
 RAISE EXCEPTION 'original catalog acceptance report bytes are immutable' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_immutable_catalog_report() FROM PUBLIC;
CREATE TRIGGER runtime_catalog_report_immutable BEFORE UPDATE OR DELETE
 ON truss.catalog_acceptance_report FOR EACH ROW EXECUTE FUNCTION truss.runtime_immutable_catalog_report();
ALTER TABLE truss.catalog_acceptance_report ENABLE ALWAYS TRIGGER runtime_catalog_report_immutable;
CREATE TRIGGER runtime_catalog_report_no_truncate BEFORE TRUNCATE
 ON truss.catalog_acceptance_report FOR EACH STATEMENT EXECUTE FUNCTION truss.runtime_immutable_catalog_report();
ALTER TABLE truss.catalog_acceptance_report ENABLE ALWAYS TRIGGER runtime_catalog_report_no_truncate;
