SET NOCOUNT ON;
SELECT 'sqlserver-catalog-v1' AS profile, 'captured' AS state,
 CONVERT(nvarchar(128),SERVERPROPERTY('ProductVersion')) AS serverVersion,
 'native/sqlserver/catalog.sql' AS query,
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
  FROM sys.tables t WHERE t.is_ms_shipped=0 ORDER BY SCHEMA_NAME(t.schema_id),t.name
  FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS tables
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;
