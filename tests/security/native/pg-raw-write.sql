-- Fixed raw write semantics; lifecycle/current-authority guards remain separate.
CREATE ROLE umf_sec_carol LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_dave LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_eve LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_frank LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_grace LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_henry LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_iris LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA security_write AUTHORIZATION umf_sec_guardian;
REVOKE ALL ON SCHEMA security_write FROM PUBLIC;
GRANT USAGE ON SCHEMA security_write TO umf_sec_alice,umf_sec_bob,
 umf_sec_carol,umf_sec_dave,umf_sec_eve,umf_sec_frank,umf_sec_grace,umf_sec_henry,umf_sec_iris,umf_sec_outsider;
SET ROLE umf_sec_guardian;
INSERT INTO security_raw.employee VALUES
 ('Carol','umf_sec_carol'),('Dave','umf_sec_dave'),('Eve','umf_sec_eve'),
 ('Frank','umf_sec_frank'),('Grace','umf_sec_grace'),('Henry','umf_sec_henry'),('Iris','umf_sec_iris');
INSERT INTO security_raw.m2m_employee_project
 SELECT e,p,true FROM unnest(ARRAY['Carol','Dave','Eve','Frank','Grace','Henry','Iris']) e
 CROSS JOIN unnest(ARRAY['A','B']) p;
CREATE TABLE security_write.action_grant(
 employee_id text REFERENCES security_raw.employee,
 project_id text REFERENCES security_raw.project,
 action text NOT NULL,
 PRIMARY KEY(employee_id,project_id,action));
INSERT INTO security_write.action_grant
 SELECT e,p,a FROM unnest(ARRAY['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Henry','Iris']) e
 CROSS JOIN unnest(ARRAY['A','B']) p
 CROSS JOIN unnest(ARRAY['read','create','update','delete','writeId','writeOwner','writeValue','changeOwner','changePolicy']) a
 WHERE NOT(e='Dave' AND a='changeOwner')
 AND NOT(e='Eve' AND p='B' AND a='changeOwner')
 AND NOT(e='Frank' AND p='B' AND a='changePolicy')
 AND NOT(e='Grace' AND a IN ('changePolicy','writeValue'))
 AND NOT(e='Henry' AND ((p='B' AND a='writeValue') OR (p='A' AND a='writeId')))
 AND NOT(e='Iris' AND a='update');
CREATE TABLE security_write.resource(
 id text COLLATE "C" PRIMARY KEY,
 owner_project text COLLATE "C" NOT NULL REFERENCES security_raw.project,
 value text COLLATE "C" NOT NULL);
INSERT INTO security_write.resource VALUES
 ('WA','A','alice'),('WB','B','bob'),('WC','A','carol'),
 ('WD','A','dave'),('WE','A','eve-new'),('WEO','B','eve-old'),
 ('WF','A','frank-new'),('WFO','B','frank-old'),('WG','A','grace'),('WH','A','henry-new'),('WHO','B','henry-old');
CREATE FUNCTION security_write.can_action(text,text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM security_raw.employee e
 JOIN security_raw.m2m_employee_project m ON m.employee_id=e.id
 JOIN security_write.action_grant g ON g.employee_id=e.id AND g.project_id=m.project_id
 WHERE e.native_login=session_user::text AND m.active
 AND m.project_id=$1 AND g.action=$2)
$$;
REVOKE ALL ON FUNCTION security_write.can_action(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_write.can_action(text,text)
 TO umf_sec_alice,umf_sec_bob,umf_sec_carol,umf_sec_dave,umf_sec_eve,
 umf_sec_frank,umf_sec_grace,umf_sec_henry,umf_sec_iris,umf_sec_outsider;
CREATE FUNCTION security_write.check_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actions text[]; projects text[]; a text; p text;
BEGIN
 IF TG_OP='UPDATE' THEN
  actions:=ARRAY['update'];projects:=ARRAY[OLD.owner_project,NEW.owner_project];
  IF OLD.id IS DISTINCT FROM NEW.id THEN actions:=actions||ARRAY['writeId']; END IF;
  IF OLD.value IS DISTINCT FROM NEW.value THEN actions:=actions||ARRAY['writeValue']; END IF;
  IF OLD.owner_project IS DISTINCT FROM NEW.owner_project THEN
   actions:=actions||ARRAY['writeOwner','changeOwner','changePolicy'];
  END IF;
 ELSE
  actions:=ARRAY[lower(TG_OP),'writeId','writeOwner','writeValue','changeOwner','changePolicy'];
  IF TG_OP='INSERT' THEN actions[1]:='create';projects:=ARRAY[NEW.owner_project];
  ELSE projects:=ARRAY[OLD.owner_project]; END IF;
 END IF;
 FOREACH p IN ARRAY projects LOOP
  FOREACH a IN ARRAY actions LOOP
   IF NOT security_write.can_action(p,a) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Write authorization refused';
   END IF;
  END LOOP;
 END LOOP;
 -- Excluded integrity witness: survives rollback to establish execution order.
 PERFORM pg_catalog.nextval('security_write.allowed_mutations'::pg_catalog.regclass);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$$;
REVOKE ALL ON FUNCTION security_write.check_mutation() FROM PUBLIC;
CREATE SEQUENCE security_write.allowed_mutations;
CREATE TRIGGER resource_mutation BEFORE INSERT OR UPDATE OR DELETE
 ON security_write.resource FOR EACH ROW EXECUTE FUNCTION security_write.check_mutation();
ALTER TABLE security_write.resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_write.resource FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_read ON security_write.resource FOR SELECT
 USING(security_write.can_action(owner_project,'read'));
CREATE POLICY resource_create ON security_write.resource FOR INSERT
 WITH CHECK(security_write.can_action(owner_project,'create'));
CREATE POLICY resource_update ON security_write.resource FOR UPDATE
 USING(security_write.can_action(owner_project,'update'))
 WITH CHECK(security_write.can_action(owner_project,'update'));
CREATE POLICY resource_delete ON security_write.resource FOR DELETE
 USING(security_write.can_action(owner_project,'delete'));
GRANT SELECT,INSERT,UPDATE,DELETE ON security_write.resource
 TO umf_sec_alice,umf_sec_bob,umf_sec_carol,umf_sec_dave,umf_sec_eve,
 umf_sec_frank,umf_sec_grace,umf_sec_henry,umf_sec_iris,umf_sec_outsider;
RESET ROLE;
