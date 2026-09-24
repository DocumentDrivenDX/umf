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
