-- Internal PostgreSQL 17.4 discovery supplement. Raw node trees remain the
-- authority for occurrences/structure; these OID lookups alone do not qualify
-- a predicate or establish that every relevant dependency was interpreted.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SELECT jsonb_build_object(
 'profile','postgresql-facet-constraints-discovery-v1',
 'serverVersion',current_setting('server_version_num')::integer,
 'encoding',current_setting('server_encoding'),
 'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'oid',c.oid::text,'schema',ns.nspname,'relation',r.relname,'relationKind',r.relkind,
  'name',c.conname,'validated',c.convalidated,'noInherit',c.connoinherit,
  'isLocal',c.conislocal,'inheritanceCount',c.coninhcount,'parentOid',c.conparentid::text,
  'columnNumbers',c.conkey,'expression',pg_get_expr(c.conbin,c.conrelid,false),
  'nodeTree',c.conbin::text,
  'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
   'typeOid',a.atttypid::text,'typeSchema',tn.nspname,'typeName',t.typname,
   'typeKind',t.typtype,'modifier',a.atttypmod,'dimensions',a.attndims)
   ORDER BY a.attnum) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
   JOIN pg_namespace tn ON tn.oid=t.typnamespace
   WHERE a.attrelid=c.conrelid AND a.attnum>0 AND NOT a.attisdropped),
  'operatorLookups',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'oid',o.oid::text,'schema',onsp.nspname,'name',o.oprname,
   'leftTypeOid',o.oprleft::text,'rightTypeOid',o.oprright::text,
   'resultTypeOid',o.oprresult::text,'functionOid',o.oprcode::oid::text,
   'functionSchema',pn.nspname,'functionName',p.proname)
   ORDER BY o.oid) FROM pg_operator o JOIN pg_namespace onsp ON onsp.oid=o.oprnamespace
   JOIN pg_proc p ON p.oid=o.oprcode JOIN pg_namespace pn ON pn.oid=p.pronamespace
   WHERE o.oid IN (SELECT (m[1])::oid FROM regexp_matches(c.conbin::text,':opno ([0-9]+)', 'g') m)), '[]'::jsonb),
  'functionLookups',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'oid',p.oid::text,'schema',pn.nspname,'name',p.proname,
   'argumentTypeOids',p.proargtypes::oid[]::text,'resultTypeOid',p.prorettype::text,
   'kind',p.prokind,'volatility',p.provolatile,'strict',p.proisstrict)
   ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace
   WHERE p.oid IN (SELECT (m[1])::oid FROM regexp_matches(c.conbin::text,':funcid ([0-9]+)', 'g') m)), '[]'::jsonb)
 ) ORDER BY ns.nspname,r.relname,c.conname)
 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
 JOIN pg_namespace ns ON ns.oid=r.relnamespace
 WHERE c.contype='c' AND ns.nspname NOT IN ('pg_catalog','information_schema')
 AND ns.nspname !~ '^pg_toast' AND ns.nspname !~ '^pg_temp'), '[]'::jsonb));
COMMIT;
