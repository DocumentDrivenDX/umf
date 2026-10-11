-- Experimental trusted-host profile. No Truss public API or owner-authority grant.
CREATE SCHEMA protected_capture;
CREATE ROLE pc_actor LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_other LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_wrapper NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_registrar LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_authority NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE pc_revoker LOGIN NOSUPERUSER NOBYPASSRLS;
REVOKE ALL ON SCHEMA protected_capture FROM PUBLIC;
GRANT USAGE ON SCHEMA protected_capture TO pc_actor,pc_other,pc_wrapper,pc_writer,pc_registrar,pc_authority,pc_revoker;
CREATE TABLE protected_capture.capability (
 token bytea PRIMARY KEY CHECK (octet_length(token)=32),
 database_oid oid NOT NULL, backend_pid integer NOT NULL,
 xid xid8 NOT NULL, person_oid oid NOT NULL, actor_oid oid NOT NULL,
 attempt bigint NOT NULL CHECK (attempt>0), payload bytea NOT NULL,
 authority_generation bigint NOT NULL DEFAULT 1 CHECK (authority_generation>0),
 used boolean NOT NULL DEFAULT false
);
CREATE TABLE protected_capture.effect (attempt bigint PRIMARY KEY, actor_oid oid NOT NULL, payload bytea NOT NULL);
ALTER TABLE protected_capture.capability OWNER TO pc_writer;
ALTER TABLE protected_capture.effect OWNER TO pc_writer;
GRANT INSERT ON protected_capture.capability TO pc_registrar;
-- Fixed single-actor authority primitive, not an ontology policy resolver.
CREATE TABLE protected_capture.authority (
 actor_oid oid PRIMARY KEY, generation bigint NOT NULL CHECK (generation>0),
 permitted boolean NOT NULL
);
ALTER TABLE protected_capture.authority OWNER TO pc_authority;
INSERT INTO protected_capture.authority
SELECT oid,1,true FROM pg_roles WHERE rolname='pc_actor';
-- Owner-derived normalized read rule over a private raw relational fixture.
CREATE TABLE protected_capture.employee(id text PRIMARY KEY,native_login text UNIQUE NOT NULL);
CREATE TABLE protected_capture.project(id text PRIMARY KEY);
CREATE TABLE protected_capture.resource(id text PRIMARY KEY);
CREATE TABLE protected_capture.m2m_employee_project(employee_id text REFERENCES protected_capture.employee,project_id text REFERENCES protected_capture.project,active boolean NOT NULL,PRIMARY KEY(employee_id,project_id));
CREATE TABLE protected_capture.m2m_resource_project(resource_id text REFERENCES protected_capture.resource,project_id text REFERENCES protected_capture.project,PRIMARY KEY(resource_id,project_id));
ALTER TABLE protected_capture.employee OWNER TO pc_authority;
ALTER TABLE protected_capture.project OWNER TO pc_authority;
ALTER TABLE protected_capture.resource OWNER TO pc_authority;
ALTER TABLE protected_capture.m2m_employee_project OWNER TO pc_authority;
ALTER TABLE protected_capture.m2m_resource_project OWNER TO pc_authority;
INSERT INTO protected_capture.employee VALUES('Alice','pc_actor'),('Bob','pc_other');
INSERT INTO protected_capture.project VALUES('A'),('B'),('D');
INSERT INTO protected_capture.resource VALUES('RA'),('RB'),('RD'),('RO'),('RAB');
INSERT INTO protected_capture.m2m_employee_project VALUES('Alice','A',true),('Alice','B',false),('Bob','B',true);
INSERT INTO protected_capture.m2m_resource_project VALUES('RA','A'),('RB','B'),('RD','D'),('RAB','A'),('RAB','B');
CREATE FUNCTION protected_capture.ontology_allowed(resource_id text)
RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path=pg_catalog
AS $ontology_owner$ SELECT /*OWNER_PREDICATE*/ $ontology_owner$;
ALTER FUNCTION protected_capture.ontology_allowed(text) OWNER TO pc_authority;
REVOKE ALL ON FUNCTION protected_capture.ontology_allowed(text) FROM PUBLIC;
CREATE FUNCTION protected_capture.check_authority(actor oid,generation bigint,resource_id text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ DECLARE a protected_capture.authority%ROWTYPE;
BEGIN
 SELECT k.* INTO a FROM protected_capture.authority k WHERE k.actor_oid=$1 FOR SHARE;
 IF NOT FOUND OR NOT a.permitted OR a.generation<>$2 THEN
  RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501';
 END IF;
 IF NOT protected_capture.ontology_allowed($3) THEN
  RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501';
 END IF;
END $$;
ALTER FUNCTION protected_capture.check_authority(oid,bigint,text) OWNER TO pc_authority;
REVOKE ALL ON FUNCTION protected_capture.check_authority(oid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.check_authority(oid,bigint,text) TO pc_writer;
CREATE FUNCTION protected_capture.revoke_actor()
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ UPDATE protected_capture.authority SET permitted=false,generation=generation+1
 WHERE actor_oid=(SELECT oid FROM pg_roles WHERE rolname='pc_actor') $$;
ALTER FUNCTION protected_capture.revoke_actor() OWNER TO pc_authority;
REVOKE ALL ON FUNCTION protected_capture.revoke_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.revoke_actor() TO pc_revoker;
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
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501';
 END IF;
 UPDATE protected_capture.capability k SET used=true
 WHERE k.token=$1 AND NOT k.used AND k.attempt=$2 AND k.payload=$3
 AND k.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
 AND k.backend_pid=pg_backend_pid() AND k.xid=pg_current_xact_id()
 AND k.person_oid=(SELECT oid FROM pg_roles WHERE rolname=session_user)
 RETURNING k.* INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501'; END IF;
 PERFORM protected_capture.check_authority(c.actor_oid,c.authority_generation,convert_from(c.payload,'UTF8'));
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

CREATE FUNCTION protected_capture.revoke_assignment()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ BEGIN
 UPDATE protected_capture.authority SET generation=generation+1
 WHERE actor_oid=(SELECT oid FROM pg_roles WHERE rolname='pc_actor');
 UPDATE protected_capture.m2m_employee_project SET active=false WHERE employee_id='Alice' AND project_id='A';
END $$;
ALTER FUNCTION protected_capture.revoke_assignment() OWNER TO pc_authority;
REVOKE ALL ON FUNCTION protected_capture.revoke_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION protected_capture.revoke_assignment() TO pc_revoker;
