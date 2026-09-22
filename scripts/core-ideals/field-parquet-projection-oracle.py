import json,pathlib,pyarrow,pyarrow.parquet as pq
assert pyarrow.__version__=='21.0.0'
c=json.loads(pathlib.Path('fixtures/validation/field-parquet-projection-corpus.json').read_text())
types={'boolean':'BOOLEAN','int32':'INT32','int64':'INT64','float32':'FLOAT','float64':'DOUBLE','binary':'BYTE_ARRAY','string':'BYTE_ARRAY','date':'INT32','time-millis':'INT32','time-micros':'INT64','timestamp-millis-utc':'INT64','timestamp-micros-utc':'INT64'}
for row in c['rows']:
    file=pq.ParquetFile(row['path']); col=file.schema.column(0); r=row['request']
    assert file.metadata.num_rows==0 and file.metadata.num_row_groups==0
    assert col.name==r['fieldName'] and col.physical_type==types[r['nativeType']]
    assert col.max_definition_level==(0 if r['repetition']=='required' else 1)
    assert col.max_repetition_level==(1 if r['repetition']=='repeated' else 0)
    arrow_type=file.schema_arrow.field(0).type
    if r['repetition']=='repeated':
        assert pyarrow.types.is_list(arrow_type)
        arrow_type=arrow_type.value_type
    expected={'boolean':pyarrow.bool_(),'int32':pyarrow.int32(),'int64':pyarrow.int64(),'float32':pyarrow.float32(),'float64':pyarrow.float64(),'binary':pyarrow.binary(),'string':pyarrow.string(),'date':pyarrow.date32(),'time-millis':pyarrow.time32('ms'),'time-micros':pyarrow.time64('us'),'timestamp-millis-utc':pyarrow.timestamp('ms',tz='UTC'),'timestamp-micros-utc':pyarrow.timestamp('us',tz='UTC')}
    assert arrow_type==expected[r['nativeType']], (r,arrow_type)
    assert file.read().num_rows==0
records=0
blocked=0
for row in c['records']:
    if row['result']['status']=='blocked':
        blocked+=1
        continue
    file=pq.ParquetFile(row['path'])
    expected_names=[] if row['variant']=='empty' else ['id','labels','active']
    assert file.schema.names==expected_names
    assert file.metadata.num_rows==0 and file.read().num_rows==0
    for i,name in enumerate(expected_names):
        binding=next(f for f in row['request']['fields'] if f['fieldName']==name)
        column=file.schema.column(i)
        assert column.physical_type==types[binding['nativeType']]
        assert column.max_definition_level==(0 if binding['repetition']=='required' else 1)
        assert column.max_repetition_level==(1 if binding['repetition']=='repeated' else 0)
    records+=1
out={'runtime':'PyArrow '+pyarrow.__version__,'schemas':len(c['rows']),'records':records,'blockedRecords':blocked,'scope':'Native empty-file reading, physical types and repetition levels; no row-value encoding claim'}
pathlib.Path('fixtures/validation/field-parquet-projection-native.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
