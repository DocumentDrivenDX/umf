-- Test evidence query for PostgreSQL 17. This is an explicitly bounded catalog view,
-- not a full catalog interchange vocabulary. OIDs and physical file identifiers are
-- replaced by qualified names; exact sequence bounds are strings.
WITH namespaces AS (
 SELECT oid,nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text AS acl
 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
), relations AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','S','f')
), dependency_objects AS (
 SELECT 'pg_class'::regclass AS classid,c.oid AS objid FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
 UNION SELECT 'pg_type'::regclass,t.oid FROM pg_type t JOIN namespaces n ON n.oid=t.typnamespace
 UNION SELECT 'pg_proc'::regclass,p.oid FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace
 UNION SELECT 'pg_constraint'::regclass,c.oid FROM pg_constraint c JOIN namespaces n ON n.oid=c.connamespace
 UNION SELECT 'pg_attrdef'::regclass,d.oid FROM pg_attrdef d JOIN relations r ON r.oid=d.adrelid
 UNION SELECT 'pg_trigger'::regclass,t.oid FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
 UNION SELECT 'pg_rewrite'::regclass,w.oid FROM pg_rewrite w JOIN relations r ON r.oid=w.ev_class
 UNION SELECT 'pg_collation'::regclass,c.oid FROM pg_collation c JOIN namespaces n ON n.oid=c.collnamespace
 UNION SELECT 'pg_policy'::regclass,p.oid FROM pg_policy p JOIN relations r ON r.oid=p.polrelid
), dependency_rows AS (
 SELECT jsonb_build_object('dependent',jsonb_build_object('catalog',d.classid::regclass::text,'type',a.type,'schema',a.schema,'name',a.name,'identity',a.identity),
  'referenced',jsonb_build_object('catalog',d.refclassid::regclass::text,'type',b.type,'schema',b.schema,'name',b.name,'identity',b.identity),'kind',d.deptype) AS edge
 FROM pg_depend d JOIN dependency_objects o ON o.classid=d.classid AND o.objid=d.objid
 CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) a
 CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) b
)
SELECT jsonb_build_object(
 'profile','umf-postgresql-catalog-evidence-17-v3',
 'namespaces',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',owner,'acl',acl) ORDER BY nspname) FROM namespaces),
 'relations',(SELECT jsonb_agg(jsonb_build_object(
  'schema',r.nspname,'name',r.relname,'kind',r.relkind,'persistence',r.relpersistence,
  'owner',pg_get_userbyid(r.relowner),'acl',r.relacl::text,'options',r.reloptions,
  'rowSecurity',r.relrowsecurity,'forceRowSecurity',r.relforcerowsecurity,
  'comment',obj_description(r.oid,'pg_class'),
  'partitionKey',pg_get_partkeydef(r.oid),'partitionBound',pg_get_expr(r.relpartbound,r.oid),
  'parents',(SELECT jsonb_agg(p.inhparent::regclass::text ORDER BY p.inhseqno) FROM pg_inherits p WHERE p.inhrelid=r.oid),
  'view',CASE WHEN r.relkind IN ('v','m') THEN pg_get_viewdef(r.oid,false) END,
  'columns',(SELECT jsonb_agg(jsonb_build_object(
   'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
   'nativeType',(SELECT jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'category',t.typcategory,'dimensions',a.attndims,'modifier',a.atttypmod) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.oid=a.atttypid),
   'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
   'collation',CASE WHEN a.attcollation<>0 THEN a.attcollation::regcollation::text END,
   'default',pg_get_expr(d.adbin,d.adrelid),'comment',col_description(r.oid,a.attnum),
   'storage',a.attstorage,'compression',a.attcompression,'acl',a.attacl::text
  ) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'kind',c.contype,'definition',pg_get_constraintdef(c.oid,false),'deferrable',c.condeferrable,'deferred',c.condeferred,'validated',c.convalidated) ORDER BY c.conname) FROM pg_constraint c WHERE c.conrelid=r.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'replicaIdentity',i.indisreplident) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=r.oid),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role) END ORDER BY role) FROM unnest(p.polroles) role),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=r.oid),
  'sequence',(SELECT jsonb_build_object('type',format_type(s.seqtypid,NULL),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle) FROM pg_sequence s WHERE s.seqrelid=r.oid)
 ) ORDER BY r.nspname,r.relname) FROM relations r),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl::text,'base',format_type(t.typbasetype,t.typtypmod),'notNull',t.typnotnull,'default',t.typdefault,'comment',obj_description(t.oid,'pg_type'),
  'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid,false),'validated',c.convalidated) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid)
 ) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN namespaces n ON n.oid=t.typnamespace WHERE t.typtype IN ('d','e')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'comment',obj_description(p.oid,'pg_proc')) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p')),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,'relation',r.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,false),'function',t.tgfoid::regprocedure::text,'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,'comment',obj_description(t.oid,'pg_trigger')) ORDER BY r.nspname,r.relname,t.tgname) FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal),
 'compositeTypes',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl::text,'comment',obj_description(t.oid,'pg_type'),'attributes',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'collation',CASE WHEN a.attcollation<>0 THEN a.attcollation::regcollation::text END) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN namespaces n ON n.oid=t.typnamespace JOIN pg_class c ON c.oid=t.typrelid WHERE t.typtype='c' AND c.relkind='c'),
 'rangeTypes',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl::text,'comment',obj_description(t.oid,'pg_type'),'subtype',format_type(r.rngsubtype,NULL),'multirange',format_type(r.rngmultitypid,NULL),'collation',CASE WHEN r.rngcollation<>0 THEN r.rngcollation::regcollation::text END,'operatorClass',(SELECT format('%I.%I',ns.nspname,o.opcname) FROM pg_opclass o JOIN pg_namespace ns ON ns.oid=o.opcnamespace WHERE o.oid=r.rngsubopc),'canonical',r.rngcanonical::regprocedure::text,'subtypeDifference',r.rngsubdiff::regprocedure::text) ORDER BY n.nspname,t.typname) FROM pg_range r JOIN pg_type t ON t.oid=r.rngtypid JOIN namespaces n ON n.oid=t.typnamespace),
 'collations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.collname,'owner',pg_get_userbyid(c.collowner),'provider',c.collprovider,'deterministic',c.collisdeterministic,'encoding',c.collencoding,'collate',c.collcollate,'ctype',c.collctype,'locale',c.colllocale,'rules',c.collicurules,'version',c.collversion,'comment',obj_description(c.oid,'pg_collation')) ORDER BY n.nspname,c.collname,c.collencoding) FROM pg_collation c JOIN namespaces n ON n.oid=c.collnamespace),
 'dependencies',(SELECT coalesce(jsonb_agg(edge ORDER BY edge::text),'[]'::jsonb) FROM dependency_rows)
)::text;
