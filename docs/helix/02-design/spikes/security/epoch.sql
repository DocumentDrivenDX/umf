-- Disposable PostgreSQL epoch protocol spike; not a production installer.
CREATE SEQUENCE sec.authority_generation AS bigint START WITH 1 NO CYCLE;
SELECT pg_catalog.setval('sec.authority_generation',1,true);
CREATE TABLE sec.authority_epoch(singleton boolean PRIMARY KEY CHECK(singleton), generation bigint NOT NULL);
INSERT INTO sec.authority_epoch VALUES(true,1);
CREATE FUNCTION sec.assert_current_epoch() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sec AS $$
DECLARE retained bigint; observed bigint;
BEGIN
  SELECT generation INTO STRICT retained FROM sec.authority_epoch WHERE singleton;
  -- Sequence state is not MVCC: an old table snapshot cannot impersonate the current epoch.
  SELECT last_value INTO STRICT observed FROM sec.authority_generation;
  IF retained<>observed THEN RAISE EXCEPTION 'authority unavailable'; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='Authority snapshot unavailable';
END
$$;
REVOKE ALL ON FUNCTION sec.assert_current_epoch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sec.assert_current_epoch() TO umf_security_alice,umf_security_bob,umf_security_outsider;
REVOKE ALL ON sec.authority_epoch,sec.authority_generation FROM PUBLIC;
