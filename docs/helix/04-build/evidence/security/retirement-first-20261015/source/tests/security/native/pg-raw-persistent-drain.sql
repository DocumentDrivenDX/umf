-- Dedicated trusted host issuer; application readers have no enrollment/retirement capability.
CREATE ROLE umf_sec_issuer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA security_drain TO umf_sec_issuer;
CREATE ROLE umf_sec_incarnation NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT pg_read_all_stats TO umf_sec_incarnation;
GRANT USAGE ON SCHEMA security_drain TO umf_sec_incarnation,umf_sec_alice;
SET ROLE umf_sec_guardian;
CREATE TABLE security_drain.publisher(
 id uuid PRIMARY KEY,actor name NOT NULL,pid integer NOT NULL,
 incarnation timestamptz NOT NULL,state text NOT NULL CHECK(state IN ('enrolled','pending','released')));
REVOKE ALL ON security_drain.publisher FROM PUBLIC;
CREATE FUNCTION security_drain.publisher_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Publisher history unavailable' USING ERRCODE='42501'; END IF;
 IF NOT ((OLD.state='enrolled' AND NEW.state='pending') OR (OLD.state='pending' AND NEW.state='released')) OR
 ROW(OLD.id,OLD.actor,OLD.pid,OLD.incarnation) IS DISTINCT FROM ROW(NEW.id,NEW.actor,NEW.pid,NEW.incarnation)
 THEN RAISE EXCEPTION 'Publisher retirement unavailable' USING ERRCODE='42501'; END IF;
 IF NEW.state='released' THEN PERFORM pg_catalog.pg_advisory_xact_lock(10070019); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION security_drain.publisher_history() FROM PUBLIC;
CREATE TRIGGER publisher_retirement BEFORE UPDATE OR DELETE ON security_drain.publisher
FOR EACH ROW EXECUTE FUNCTION security_drain.publisher_history();
CREATE TRIGGER publisher_history BEFORE TRUNCATE ON security_drain.publisher
FOR EACH STATEMENT EXECUTE FUNCTION security_drain.publisher_history();
CREATE FUNCTION security_drain.backend_incarnation() RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT backend_start FROM pg_catalog.pg_stat_activity WHERE pid=pg_catalog.pg_backend_pid()
$$;
REVOKE ALL ON FUNCTION security_drain.backend_incarnation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_drain.backend_incarnation() TO umf_sec_guardian;
RESET ROLE;
ALTER FUNCTION security_drain.backend_incarnation() OWNER TO umf_sec_incarnation;
GRANT EXECUTE ON FUNCTION security_drain.backend_incarnation() TO umf_sec_guardian;
SET ROLE umf_sec_guardian;
CREATE FUNCTION security_drain.publisher_backend_matches(native_actor name,native_pid integer,native_incarnation timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity a
 WHERE a.pid=native_pid AND a.usename=native_actor AND a.backend_start=native_incarnation
 AND a.backend_type='client backend')
$$;
REVOKE ALL ON FUNCTION security_drain.publisher_backend_matches(name,integer,timestamptz) FROM PUBLIC;
RESET ROLE;
ALTER FUNCTION security_drain.publisher_backend_matches(name,integer,timestamptz) OWNER TO umf_sec_incarnation;
GRANT EXECUTE ON FUNCTION security_drain.publisher_backend_matches(name,integer,timestamptz) TO umf_sec_guardian;
SET ROLE umf_sec_guardian;
CREATE FUNCTION security_drain.enroll_publisher(publication_id uuid,native_actor name,native_pid integer,native_incarnation timestamptz) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
 RAISE EXCEPTION 'Unsupported enrollment snapshot' USING ERRCODE='42501'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(10070019) THEN
 RAISE EXCEPTION 'Publisher enrollment guard unavailable' USING ERRCODE='42501'; END IF;
 IF publication_id IS NULL OR native_actor IS DISTINCT FROM 'umf_sec_alice'::name
 OR native_pid IS NULL OR native_incarnation IS NULL
 OR NOT security_drain.publisher_backend_matches(native_actor,native_pid,native_incarnation)
 THEN RAISE EXCEPTION 'Publisher enrollment unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO security_drain.publisher VALUES(publication_id,native_actor,native_pid,native_incarnation,'enrolled');
 RETURN 'enrolled';
END $$;
REVOKE ALL ON FUNCTION security_drain.enroll_publisher(uuid,name,integer,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_drain.enroll_publisher(uuid,name,integer,timestamptz) TO umf_sec_issuer;
CREATE FUNCTION security_drain.read_enrolled(publication_id uuid) RETURNS TABLE(id text,value text,owners jsonb,cells jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
 RAISE EXCEPTION 'Unsupported publisher snapshot' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(10070019);
 UPDATE security_drain.publisher p SET state='pending' WHERE p.id=publication_id
 AND p.state='enrolled' AND p.actor=SESSION_USER AND p.pid=pg_catalog.pg_backend_pid()
 AND p.incarnation=security_drain.backend_incarnation();
 IF NOT FOUND THEN
 RAISE EXCEPTION 'Publisher custody unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.id,r.value,
 (SELECT coalesce(jsonb_agg(o.project_id ORDER BY o.project_id COLLATE "C"),'[]'::jsonb)
  FROM security_raw.resource_project o WHERE o.resource_id=r.id),d.cells
 FROM security_raw.resource r JOIN security_raw.resource_disclosure d ON d.id=r.id
 ORDER BY r.id COLLATE "C";
END $$;
REVOKE ALL ON FUNCTION security_drain.read_enrolled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_drain.read_enrolled(uuid) TO umf_sec_alice;
CREATE OR REPLACE FUNCTION security_drain.revoke_alice() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
 RAISE EXCEPTION 'Unsupported writer snapshot' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(10070019);
 IF EXISTS(SELECT 1 FROM security_drain.publisher WHERE state<>'released') THEN
 RAISE EXCEPTION 'Publisher drain unavailable' USING ERRCODE='42501'; END IF;
 UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice';
 RETURN 'revoked';
END $$;
-- Private issuer retirement orders the realm guard before publisher tuple locks.
CREATE FUNCTION security_drain.retire_publisher(publication_id uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
 RAISE EXCEPTION 'Unsupported retirement snapshot' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(10070019);
 UPDATE security_drain.publisher p SET state='released'
 WHERE p.id=publication_id AND p.state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Publisher retirement unavailable' USING ERRCODE='42501'; END IF;
 RETURN 'retired';
END $$;
REVOKE ALL ON FUNCTION security_drain.retire_publisher(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_drain.retire_publisher(uuid) TO umf_sec_issuer;
RESET ROLE;

-- Ordinary raw access has no final-consumer custody and is therefore denied.
REVOKE ALL ON ALL TABLES IN SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider;
REVOKE ALL ON SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider;
