-- Disposable P08 stored-token witness, not a qualified tokenization provider.
-- All shared declaration obligations remain unverified.
CREATE SCHEMA security_token_crypto;
REVOKE ALL ON SCHEMA security_token_crypto FROM PUBLIC;
CREATE EXTENSION pgcrypto WITH SCHEMA security_token_crypto;
CREATE ROLE umf_sec_token_vault NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA security_token_vault AUTHORIZATION umf_sec_token_vault;
CREATE SCHEMA security_tokens AUTHORIZATION umf_sec_guardian;
REVOKE ALL ON SCHEMA security_token_vault,security_tokens FROM PUBLIC;
GRANT USAGE ON SCHEMA security_token_crypto TO umf_sec_token_vault;
GRANT EXECUTE ON FUNCTION security_token_crypto.hmac(bytea,bytea,text) TO umf_sec_token_vault;
GRANT USAGE ON SCHEMA security_token_vault,security_tokens TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
SET ROLE umf_sec_guardian;
CREATE TABLE security_tokens.resource(id pg_catalog.text PRIMARY KEY REFERENCES security_raw.resource,token pg_catalog.text NOT NULL);
ALTER TABLE security_tokens.resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_tokens.resource FORCE ROW LEVEL SECURITY;
CREATE POLICY token_read ON security_tokens.resource FOR SELECT TO umf_sec_guardian USING(security_raw.allowed(id));
CREATE VIEW security_tokens.disclosed WITH (security_barrier=true) AS
 SELECT id,pg_catalog.jsonb_build_object('field',pg_catalog.jsonb_build_object('documentId','domain','moduleId','m','elementId','token'),'disposition','original','storageEffect','stored-transformed','storageTransform',pg_catalog.jsonb_build_object('catalog','stored','revision','1','id','vault','version','1'),'value',pg_catalog.jsonb_build_object('string',token)) AS cell
 FROM security_tokens.resource;
GRANT SELECT ON security_tokens.disclosed TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
GRANT USAGE ON SCHEMA security_tokens TO umf_sec_token_vault;
GRANT INSERT ON security_tokens.resource TO umf_sec_token_vault;
CREATE POLICY token_enroll ON security_tokens.resource FOR INSERT TO umf_sec_token_vault WITH CHECK(true);
RESET ROLE;
SET ROLE umf_sec_token_vault;
CREATE TABLE security_token_vault.key_material(singleton pg_catalog.bool PRIMARY KEY CHECK(singleton),key_bytes pg_catalog.bytea NOT NULL CHECK(pg_catalog.octet_length(key_bytes)=32));
CREATE TABLE security_token_vault.entries(token pg_catalog.text PRIMARY KEY,plaintext pg_catalog.text UNIQUE NOT NULL);
CREATE FUNCTION security_token_vault.enroll(resource_id pg_catalog.text,cleartext pg_catalog.text) RETURNS pg_catalog.text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result pg_catalog.text;
BEGIN
 result:=pg_catalog.encode(security_token_crypto.hmac(pg_catalog.convert_to(cleartext,'UTF8'),(SELECT key_bytes FROM security_token_vault.key_material WHERE singleton),'sha256'),'hex');
 IF result IS NULL THEN RAISE EXCEPTION 'excluded vault key required' USING ERRCODE='55000'; END IF;
 INSERT INTO security_token_vault.entries(token,plaintext) VALUES(result,cleartext) ON CONFLICT(token) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM security_token_vault.entries WHERE token=result AND plaintext=cleartext) THEN RAISE EXCEPTION 'ambiguous token refused' USING ERRCODE='55000'; END IF;
 INSERT INTO security_tokens.resource(id,token) VALUES(resource_id,result);
 RETURN result;
END;
$$;
CREATE FUNCTION security_token_vault.detokenize(value pg_catalog.text) RETURNS pg_catalog.text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT plaintext FROM security_token_vault.entries WHERE token=value
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA security_token_vault FROM PUBLIC;
REVOKE ALL ON FUNCTION security_token_vault.enroll(text,text),security_token_vault.detokenize(text) FROM PUBLIC;
RESET ROLE;
