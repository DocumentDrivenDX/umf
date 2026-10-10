-- Additive L02 field-permission witness; original L01 fixture stays unchanged.
CREATE ROLE umf_sec_jules LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA security_write TO umf_sec_jules;
SET ROLE umf_sec_guardian;
INSERT INTO security_raw.employee VALUES ('Jules','umf_sec_jules');
INSERT INTO security_raw.m2m_employee_project VALUES ('Jules','A',true),('Jules','B',true);
INSERT INTO security_write.action_grant
 SELECT 'Jules',p,a FROM unnest(ARRAY['A','B']) p
 CROSS JOIN unnest(ARRAY['read','create','update','delete','writeId','writeOwner','writeValue','changeOwner','changePolicy']) a
 WHERE NOT(p='B' AND a='writeOwner');
-- Excluded installer seed step precedes all ordinary execution.
ALTER TABLE security_write.resource DISABLE TRIGGER resource_mutation;
RESET ROLE;
INSERT INTO security_write.resource VALUES ('WJ','A','jules-new'),('WJO','B','jules-old');
SET ROLE umf_sec_guardian;
ALTER TABLE security_write.resource ENABLE TRIGGER resource_mutation;
GRANT SELECT,INSERT,UPDATE,DELETE ON security_write.resource TO umf_sec_jules;
GRANT EXECUTE ON FUNCTION security_write.can_action(text,text) TO umf_sec_jules;
RESET ROLE;
