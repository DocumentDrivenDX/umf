export const parquetFieldPaths=[
 'fixtures/parquet/rename/none.parquet',
 ...['decimal32','uint32','int8','timestamp-local','uuid'].map(id=>`fixtures/parquet/logical/${id}.parquet`),
 ...['list-three-element','list-three-renamed','list-primitive','list-tuple','list-array','list-items_tuple','list-nested-repeated','map-canonical','map-legacy-outer','map-key-only'].map(id=>`fixtures/parquet/containers/${id}.parquet`)
];
