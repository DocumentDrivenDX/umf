-- Private comparison/lock primitive only. Expected values do not confer trusted
-- deployment admission or transition authority. Invoke on original executor.
CREATE FUNCTION truss.runtime_lock_source_epoch(
 expected_installation text, expected_epoch text, expected_incarnation text)
RETURNS TABLE(installation_id text,source_epoch text,target_incarnation text,
 profile_hex text,evidence_hex text,evidence_sha256 text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE pointer truss.source_epoch_current%ROWTYPE;
 epoch truss.source_epoch_registry%ROWTYPE;
BEGIN
 IF current_user::text IS DISTINCT FROM (CASE WHEN current_setting('role')='none'
  THEN session_user::text ELSE current_setting('role') END) THEN
  RAISE EXCEPTION 'original invoker epoch boundary required' USING ERRCODE='55000';
 END IF;
 IF expected_installation IS NULL OR expected_epoch IS NULL OR expected_incarnation IS NULL
  OR octet_length(expected_installation) NOT BETWEEN 1 AND 1024
  OR octet_length(expected_epoch) NOT BETWEEN 1 AND 256
  OR octet_length(expected_incarnation) NOT BETWEEN 1 AND 1024 THEN
  RAISE EXCEPTION 'bounded original epoch comparison required' USING ERRCODE='55000';
 END IF;
 SELECT c.* INTO pointer FROM truss.source_epoch_current c WHERE c.singleton_id=1 FOR SHARE;
 IF NOT FOUND OR pointer.installation_id IS DISTINCT FROM expected_installation
  OR pointer.source_epoch IS DISTINCT FROM expected_epoch THEN
  RAISE EXCEPTION 'current source epoch correspondence required' USING ERRCODE='55000';
 END IF;
 SELECT r.* INTO epoch FROM truss.source_epoch_registry r
  WHERE r.installation_id=pointer.installation_id AND r.source_epoch=pointer.source_epoch;
 IF NOT FOUND OR epoch.target_incarnation IS DISTINCT FROM expected_incarnation
  OR epoch.evidence_sha256 IS DISTINCT FROM sha256(epoch.evidence_bytes) THEN
  RAISE EXCEPTION 'original epoch evidence correspondence required' USING ERRCODE='55000';
 END IF;
 RETURN QUERY SELECT epoch.installation_id,epoch.source_epoch,epoch.target_incarnation,
  encode(epoch.profile_bytes,'hex'),encode(epoch.evidence_bytes,'hex'),encode(epoch.evidence_sha256,'hex');
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_lock_source_epoch(text,text,text) FROM PUBLIC;
