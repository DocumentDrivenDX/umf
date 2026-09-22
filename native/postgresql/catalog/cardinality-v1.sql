-- Supplement to catalog snapshot v3; original captures remain unchanged.
-- Explicit type relationships only: dimensions are observations, not constraints.
WITH RECURSIVE columns AS (
 SELECT n.nspname AS schema,c.relname AS relation,a.attname AS name,
 a.attnum AS ordinal,a.attndims AS dimensions,a.atttypid AS type_oid
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
 AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
), reachable(oid) AS (
 SELECT type_oid FROM columns
 UNION
 SELECT edge.oid FROM reachable r JOIN pg_type t ON t.oid=r.oid
 CROSS JOIN LATERAL (VALUES(t.typelem),(t.typbasetype)) edge(oid)
 WHERE edge.oid<>0
), types AS (
 SELECT t.*,n.nspname FROM reachable r JOIN pg_type t ON t.oid=r.oid
 JOIN pg_namespace n ON n.oid=t.typnamespace
)
SELECT jsonb_build_object(
 'profile','postgresql-cardinality-catalog','version','1.0.0',
 'serverVersion',current_setting('server_version_num')::integer,
 'columns',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'schema',c.schema,'relation',c.relation,'name',c.name,'ordinal',c.ordinal,
 'declaredDimensions',c.dimensions,'type',jsonb_build_object('schema',t.nspname,'name',t.typname)
 ) ORDER BY c.schema,c.relation,c.ordinal) FROM columns c JOIN types t ON t.oid=c.type_oid),'[]'::jsonb),
 'types',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'identity',jsonb_build_object('schema',t.nspname,'name',t.typname),
 'kind',t.typtype,'category',t.typcategory,
 'element',CASE WHEN e.oid IS NULL THEN NULL ELSE jsonb_build_object('schema',e.nspname,'name',e.typname) END,
 'base',CASE WHEN b.oid IS NULL THEN NULL ELSE jsonb_build_object('schema',b.nspname,'name',b.typname) END,
 'standardArray',coalesce(e.typarray=t.oid,false)
 ) ORDER BY t.nspname,t.typname) FROM types t
 LEFT JOIN types e ON e.oid=t.typelem LEFT JOIN types b ON b.oid=t.typbasetype),'[]'::jsonb)
);
