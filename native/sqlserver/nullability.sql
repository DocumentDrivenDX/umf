-- Discovery sidecar: catalog-v3 does not enumerate these facts.
SET NOCOUNT ON;
SELECT 'umf-sqlserver-nullability-evidence-v1' AS profile,
 CONVERT(bit,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')) AS database_view_definition,
 JSON_QUERY(COALESCE((SELECT SCHEMA_NAME(t.schema_id) AS [schema],t.name AS [table],tr.name,tr.is_disabled,tr.is_instead_of_trigger,OBJECT_DEFINITION(tr.object_id) AS definition
 FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id ORDER BY SCHEMA_NAME(t.schema_id),t.name,tr.name FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS triggers,
 JSON_QUERY(COALESCE((SELECT SCHEMA_NAME(schema_id) AS [schema],name,is_nullable,default_object_id,rule_object_id FROM sys.types WHERE is_user_defined=1 ORDER BY SCHEMA_NAME(schema_id),name FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS alias_types,
 JSON_QUERY(COALESCE((SELECT SCHEMA_NAME(t.schema_id) AS [schema],t.name AS [table],c.name,c.is_sparse,c.generated_always_type,c.is_hidden
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE t.is_ms_shipped=0 ORDER BY SCHEMA_NAME(t.schema_id),t.name,c.column_id FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS column_refinements
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;
