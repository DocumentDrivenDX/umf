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
