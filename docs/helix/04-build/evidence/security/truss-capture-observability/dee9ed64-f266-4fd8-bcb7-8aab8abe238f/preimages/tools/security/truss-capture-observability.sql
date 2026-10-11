CREATE SCHEMA capture_observability;
CREATE ROLE capture_ordinary LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE capture_wrapper NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE capture_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA capture_observability TO capture_ordinary,capture_wrapper,capture_writer;
CREATE FUNCTION capture_observability.writer_entry()
RETURNS TABLE(person text,effective text,role_setting text,database_name text,backend_pid text,xid text,session_oid text,writer_oid text,entry_oid text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ SELECT session_user::text,current_user::text,current_setting('role'),current_database(),pg_backend_pid()::text,pg_current_xact_id()::text,
(SELECT oid::text FROM pg_roles WHERE rolname=session_user),
(SELECT oid::text FROM pg_roles WHERE rolname=current_user),
'capture_observability.writer_entry()'::regprocedure::oid::text $$;
ALTER FUNCTION capture_observability.writer_entry() OWNER TO capture_writer;
REVOKE ALL ON FUNCTION capture_observability.writer_entry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capture_observability.writer_entry() TO capture_ordinary,capture_wrapper;
CREATE FUNCTION capture_observability.unregistered_wrapper()
RETURNS TABLE(before_actor text,person text,effective text,role_setting text,database_name text,backend_pid text,xid text,session_oid text,writer_oid text,entry_oid text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $$ SELECT current_user::text,w.* FROM capture_observability.writer_entry() w $$;
ALTER FUNCTION capture_observability.unregistered_wrapper() OWNER TO capture_wrapper;
REVOKE ALL ON FUNCTION capture_observability.unregistered_wrapper() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capture_observability.unregistered_wrapper() TO capture_ordinary;
