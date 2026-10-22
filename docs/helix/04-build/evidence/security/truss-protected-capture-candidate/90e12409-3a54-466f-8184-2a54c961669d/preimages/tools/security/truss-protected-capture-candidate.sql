-- Experimental trusted-host profile. No Truss public API or owner-authority grant.
CREATE SCHEMA protected_capture;
CREATE ROLE pc_actor LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_other LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_wrapper NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_registrar LOGIN NOSUPERUSER NOBYPASSRLS;
REVOKE ALL ON SCHEMA protected_capture FROM PUBLIC;
GRANT USAGE ON SCHEMA protected_capture TO pc_actor,pc_other,pc_wrapper,pc_writer,pc_registrar;
CREATE TABLE protected_capture.capability (
 token bytea PRIMARY KEY CHECK (octet_length(token)=32),
 database_oid oid NOT NULL, backend_pid integer NOT NULL,
 xid xid8 NOT NULL, person_oid oid NOT NULL, actor_oid oid NOT NULL,
 attempt bigint NOT NULL CHECK (attempt>0), payload bytea NOT NULL,
 used boolean NOT NULL DEFAULT false
);
CREATE TABLE protected_capture.effect (attempt bigint PRIMARY KEY, actor_oid oid NOT NULL, payload bytea NOT NULL);
ALTER TABLE protected_capture.capability OWNER TO pc_writer;
ALTER TABLE protected_capture.effect OWNER TO pc_writer;
GRANT INSERT ON protected_capture.capability TO pc_registrar;
-- Capture is native INVOKER; no caller-provided actor field enters this query.
CREATE FUNCTION protected_capture.capture()
RETURNS TABLE(database_oid oid,backend_pid integer,xid xid8,person_oid oid,actor_oid oid)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $$ SELECT (SELECT oid FROM pg_database WHERE datname=current_database()),pg_backend_pid(),pg_current_xact_id(),
(SELECT oid FROM pg_roles WHERE rolname=session_user),(SELECT oid FROM pg_roles WHERE rolname=current_user) $$;
REVOKE ALL ON FUNCTION protected_capture.capture() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.capture() TO pc_actor;
CREATE FUNCTION protected_capture.write(token bytea,attempt bigint,payload bytea)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ DECLARE c protected_capture.capability%ROWTYPE;
BEGIN
 UPDATE protected_capture.capability k SET used=true
 WHERE k.token=$1 AND NOT k.used AND k.attempt=$2 AND k.payload=$3
 AND k.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
 AND k.backend_pid=pg_backend_pid() AND k.xid=pg_current_xact_id()
 AND k.person_oid=(SELECT oid FROM pg_roles WHERE rolname=session_user)
 RETURNING k.* INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO protected_capture.effect VALUES(c.attempt,c.actor_oid,c.payload);
END $$;
ALTER FUNCTION protected_capture.write(bytea,bigint,bytea) OWNER TO pc_writer;
REVOKE ALL ON FUNCTION protected_capture.write(bytea,bigint,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.write(bytea,bigint,bytea) TO pc_actor;
CREATE FUNCTION protected_capture.entry(token bytea,attempt bigint,payload bytea)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $$ BEGIN
 -- This candidate admits the fixed login only; SET ROLE requires a separate profile.
 IF current_user <> session_user OR current_user <> 'pc_actor' THEN
  RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM protected_capture.write($1,$2,$3);
END $$;
REVOKE ALL ON FUNCTION protected_capture.entry(bytea,bigint,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.entry(bytea,bigint,bytea) TO pc_actor,pc_wrapper;
CREATE FUNCTION protected_capture.wrapper(token bytea,attempt bigint,payload bytea)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ SELECT protected_capture.entry($1,$2,$3) $$;
ALTER FUNCTION protected_capture.wrapper(bytea,bigint,bytea) OWNER TO pc_wrapper;
REVOKE ALL ON FUNCTION protected_capture.wrapper(bytea,bigint,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.wrapper(bytea,bigint,bytea) TO pc_actor;
