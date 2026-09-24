-- Key evidence supplements the existing catalog capture; never infer author intent.
SELECT coalesce(jsonb_agg(entry ORDER BY entry->>'table',entry->>'index'),'[]'::jsonb)::text
FROM (
 SELECT jsonb_build_object(
  'schema',n.nspname,'table',t.relname,'relationKind',t.relkind,
  'index',ic.relname,'accessMethod',am.amname,
  'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,
  'ready',i.indisready,'live',i.indislive,'immediate',i.indimmediate,
  'nullsNotDistinct',i.indnullsnotdistinct,'keyCount',i.indnkeyatts,'attributeCount',i.indnatts,
  'predicate',pg_get_expr(i.indpred,i.indrelid,false),
  'expressions',pg_get_expr(i.indexprs,i.indrelid,false),'definition',pg_get_indexdef(i.indexrelid),
  'constraint',(SELECT jsonb_build_object('name',c.conname,'kind',c.contype,
    'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred,
    'definition',pg_get_constraintdef(c.oid,false)) FROM pg_constraint c WHERE c.conindid=i.indexrelid AND c.contype IN ('p','u')),
  'parents',(SELECT coalesce(jsonb_agg(p.inhparent::regclass::text ORDER BY p.inhseqno),'[]'::jsonb) FROM pg_inherits p WHERE p.inhrelid=t.oid),
  'children',(SELECT coalesce(jsonb_agg(p.inhrelid::regclass::text ORDER BY p.inhrelid),'[]'::jsonb) FROM pg_inherits p WHERE p.inhparent=t.oid),
  'components',(SELECT jsonb_agg(jsonb_build_object(
     'position',x.position,'attribute',x.attnum,'name',a.attname,'notNull',a.attnotnull,
     'type',format_type(a.atttypid,a.atttypmod),'typeSchema',tn.nspname,'typeName',ty.typname,'typeKind',ty.typtype,
     'operatorClass',CASE WHEN op.oid IS NOT NULL THEN onsp.nspname||'.'||op.opcname END,
     'collation',CASE WHEN co.oid IS NOT NULL THEN jsonb_build_object('schema',cn.nspname,'name',co.collname,'provider',co.collprovider,'deterministic',co.collisdeterministic,'locale',co.colllocale,'version',co.collversion) END
   ) ORDER BY x.position)
   FROM unnest(i.indkey::smallint[]) WITH ORDINALITY x(attnum,position)
   LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=x.attnum
   LEFT JOIN pg_type ty ON ty.oid=a.atttypid LEFT JOIN pg_namespace tn ON tn.oid=ty.typnamespace
   LEFT JOIN pg_opclass op ON op.oid=i.indclass[(x.position-1)::integer] LEFT JOIN pg_namespace onsp ON onsp.oid=op.opcnamespace
   LEFT JOIN pg_collation co ON co.oid=i.indcollation[(x.position-1)::integer] LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace)
 ) AS entry
 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
) rows;
