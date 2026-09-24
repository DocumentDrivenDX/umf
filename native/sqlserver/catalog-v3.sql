SET NOCOUNT ON;
SELECT 'sqlserver-catalog-v3' AS profile, 'captured' AS state,
 CONVERT(nvarchar(128),SERVERPROPERTY('ProductVersion')) AS serverVersion,
 'native/sqlserver/catalog-v3.sql' AS query,
 JSON_QUERY(COALESCE((SELECT SCHEMA_NAME(t.schema_id) AS [schema],t.name,
  JSON_QUERY(COALESCE((SELECT c.name,c.column_id,c.system_type_id,c.user_type_id,
   SCHEMA_NAME(ty.schema_id) AS type_schema,ty.name AS type_name,bt.name AS base_type_name,
   ty.is_user_defined,ty.is_assembly_type,c.max_length,c.precision,c.scale,
   c.is_nullable,c.is_identity,c.is_computed,c.collation_name,
   OBJECT_DEFINITION(c.default_object_id) AS default_definition,cc.definition AS computed_definition,
   CONVERT(nvarchar(128),ic.seed_value) AS identity_seed,
   CONVERT(nvarchar(128),ic.increment_value) AS identity_increment,
   CONVERT(nvarchar(max),ep.value) AS description
   FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id
   LEFT JOIN sys.types bt ON bt.user_type_id=c.system_type_id AND bt.system_type_id=bt.user_type_id
   LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
   LEFT JOIN sys.identity_columns ic ON ic.object_id=c.object_id AND ic.column_id=c.column_id
   LEFT JOIN sys.extended_properties ep ON ep.class=1 AND ep.major_id=c.object_id AND ep.minor_id=c.column_id AND ep.name=N'MS_Description'
   WHERE c.object_id=t.object_id ORDER BY c.column_id FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS columns
-- Append these expressions to the table-level SELECT in catalog.sql.
  ,JSON_QUERY(COALESCE((SELECT k.name,RTRIM(k.type) AS kind,k.is_system_named,
    i.type_desc AS index_type,i.is_disabled,i.ignore_dup_key,
    JSON_QUERY(COALESCE((SELECT ic.key_ordinal,c.column_id,c.name,ic.is_descending_key
      FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE ic.object_id=k.parent_object_id AND ic.index_id=k.unique_index_id AND ic.key_ordinal>0
      ORDER BY ic.key_ordinal FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS columns
    FROM sys.key_constraints k JOIN sys.indexes i ON i.object_id=k.parent_object_id AND i.index_id=k.unique_index_id
    WHERE k.parent_object_id=t.object_id ORDER BY k.name FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS keys
  ,JSON_QUERY(COALESCE((SELECT f.name,f.is_system_named,f.is_disabled,f.is_not_trusted,f.is_not_for_replication,
    f.delete_referential_action_desc AS delete_action,f.update_referential_action_desc AS update_action,
    OBJECT_SCHEMA_NAME(f.referenced_object_id) AS referenced_schema,OBJECT_NAME(f.referenced_object_id) AS referenced_table,
    JSON_QUERY(COALESCE((SELECT fc.constraint_column_id AS ordinal,fc.parent_column_id AS column_id,
      COL_NAME(fc.parent_object_id,fc.parent_column_id) AS column_name,
      fc.referenced_column_id,COL_NAME(fc.referenced_object_id,fc.referenced_column_id) AS referenced_column_name
      FROM sys.foreign_key_columns fc WHERE fc.constraint_object_id=f.object_id
      ORDER BY fc.constraint_column_id FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS columns
    FROM sys.foreign_keys f WHERE f.parent_object_id=t.object_id ORDER BY f.name
    FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS foreign_keys
  ,JSON_QUERY(COALESCE((SELECT c.name,c.is_system_named,c.parent_column_id,c.definition,c.is_disabled,
    c.is_not_trusted,c.is_not_for_replication,c.uses_database_collation
    FROM sys.check_constraints c WHERE c.parent_object_id=t.object_id ORDER BY c.name
    FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS checks

-- Append these expressions to the table-level SELECT in catalog-v2.sql.
  ,JSON_QUERY(COALESCE((SELECT i.index_id,i.name,i.type,i.type_desc,i.is_unique,
    i.is_primary_key,i.is_unique_constraint,i.is_disabled,i.is_hypothetical,
    i.ignore_dup_key,i.fill_factor,i.is_padded,i.allow_row_locks,i.allow_page_locks,
    i.has_filter,i.filter_definition,i.compression_delay,i.optimize_for_sequential_key,
    i.data_space_id,ds.name AS data_space_name,ds.type_desc AS data_space_type,
    JSON_QUERY(COALESCE((SELECT ic.index_column_id,ic.column_id,c.name,
      ic.key_ordinal,ic.partition_ordinal,ic.is_descending_key,ic.is_included_column,
      ic.column_store_order_ordinal
      FROM sys.index_columns ic LEFT JOIN sys.columns c
        ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id
      ORDER BY ic.index_column_id FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS columns
    FROM sys.indexes i LEFT JOIN sys.data_spaces ds ON ds.data_space_id=i.data_space_id
    WHERE i.object_id=t.object_id ORDER BY i.index_id
    FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS indexes

  FROM sys.tables t WHERE t.is_ms_shipped=0 ORDER BY SCHEMA_NAME(t.schema_id),t.name
  FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS tables
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;
