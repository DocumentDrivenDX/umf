-- Development fail-closed barrier. Replace only with the complete admitted finalizer.
-- A phase flag is never substituted for complete row/non-row/journal/feed proof.
CREATE FUNCTION truss.runtime_operation_commit_barrier() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_LEVEL<>'ROW' OR TG_WHEN<>'AFTER' OR TG_TABLE_SCHEMA<>'truss'
      OR TG_TABLE_NAME<>'row_home_operation' OR TG_NARGS<>0 THEN
    RAISE EXCEPTION 'unregistered operation commit event' USING ERRCODE='55000';
  END IF;
  RAISE EXCEPTION 'complete runtime finalizer is not installed' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_operation_commit_barrier() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER runtime_operation_commit_barrier
AFTER INSERT OR UPDATE OR DELETE ON truss.row_home_operation
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION truss.runtime_operation_commit_barrier();
ALTER TABLE truss.row_home_operation ENABLE ALWAYS TRIGGER runtime_operation_commit_barrier;
