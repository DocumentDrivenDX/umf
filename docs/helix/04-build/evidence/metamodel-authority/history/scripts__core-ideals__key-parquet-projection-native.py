"""Native empty-file schema acceptance and data-writing counterexamples."""
import json,hashlib
from decimal import Decimal
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
corpus='fixtures/validation/key-parquet-projection-corpus.json';cases=json.loads(Path(corpus).read_text())['rows'];rows=[]
def pack(value):
    if isinstance(value,bytes):return {'hex':value.hex()}
    if isinstance(value,Decimal):return {'decimal':str(value)}
    if isinstance(value,dict):return {k:pack(v) for k,v in value.items()}
    if isinstance(value,list):return [pack(v) for v in value]
    return value
for case in cases:
    assert sha(case['path'])==case['sha256']
    native=pq.ParquetFile(case['path']);schema=native.schema_arrow;assert native.metadata.num_rows==0;assert native.read().num_rows==0
    assert len(schema)==len(case['request']['columns']);observations=[]
    for i,column in enumerate(case['request']['columns']):
        field=schema.field(i);assert field.name==column['name'];assert not field.nullable
        assert field.metadata[b'PARQUET:field_id']==str(column['fieldId']).encode()
        carrier=column['carrier'];physical=native.schema.column(i)
        if carrier['kind']=='integer':assert field.type.bit_width==carrier['bits'] and pa.types.is_signed_integer(field.type)==carrier['signed']
        if carrier['kind']=='decimal':
            assert (field.type.precision,field.type.scale)==(carrier['precision'],carrier['scale'])
            assert physical.physical_type=={'int32':'INT32','int64':'INT64','bytes':'BYTE_ARRAY','fixed':'FIXED_LEN_BYTE_ARRAY'}[carrier['carrier']]
        if carrier['kind']=='fixed':assert field.type.byte_width==carrier['bytes'] and physical.physical_type=='FIXED_LEN_BYTE_ARRAY'
        observations.append({'name':field.name,'type':str(field.type),'physical':physical.physical_type,'fieldId':column['fieldId'],'definitionLevel':physical.max_definition_level,'repetitionLevel':physical.max_repetition_level})
    assert native.metadata.metadata is None
    t=schema.field(0).type;first=schema.field(0).name;code=schema.field(1).name
    a,b=(Decimal('1.20'),Decimal('2.20')) if pa.types.is_decimal(t) else (True,False) if pa.types.is_boolean(t) else (b'\x01'*t.byte_width,b'\x02'*t.byte_width) if pa.types.is_fixed_size_binary(t) else (b'\x01',b'\x02') if pa.types.is_binary(t) else ('a','b') if pa.types.is_string(t) else (1,2)
    values=[{first:a,code:'a'},{first:a,code:'a'},{first:a,code:'b'},{first:b,code:'a'}]
    table=pa.Table.from_pylist(values,schema=schema);sink=pa.BufferOutputStream();pq.write_table(table,sink,version='2.6',row_group_size=2)
    rewritten=pq.ParquetFile(pa.BufferReader(sink.getvalue()));decoded=rewritten.read(use_threads=False).to_pylist();assert decoded==values
    invalid=pa.Table.from_pylist([{first:None,code:'a'}],schema=schema)
    try:pq.write_table(invalid,pa.BufferOutputStream())
    except (pa.ArrowException,ValueError) as error:refusal=type(error).__name__
    else:raise AssertionError('Required null unexpectedly encoded')
    row={'name':case['name'],'fields':observations,'decoded':pack(decoded),'requiredNullRefused':refusal,'rowGroups':rewritten.metadata.num_row_groups}
    if pa.types.is_fixed_size_binary(t):
        try:pa.array([b'x'],type=t,safe=True)
        except pa.ArrowException as error:row['shortFixedRefused']=type(error).__name__
        else:raise AssertionError('Short fixed value unexpectedly accepted')
    if pa.types.is_integer(t):
        converted=pa.Table.from_pylist([{first:1.5,code:'a'}],schema=schema);assert converted.column(0)[0].as_py()==1;row['inputTruncation']={'input':1.5,'stored':1}
    rows.append(row)
paths=[corpus,__file__,'scripts/core-ideals/key-parquet-projection-oracle.ts','scripts/core-ideals/key-parquet-projection-cases.ts','src/core-ideals/key-parquet-projection.ts','src/core-ideals/parquet-key-carrier.ts','src/core-ideals/parquet-facet-carrier.ts','src/adapters/parquet/encode.ts','scripts/core-ideals/key-avro-projection-cases.ts','scripts/core-ideals/key-tablespec-projection-cases.ts','spec/core/key-parquet-projection.schema.json',*[c['path'] for c in cases]]
proof={'scope':'PyArrow acceptance of independently emitted empty schema files and duplicate data writes using their Arrow schemas; rewritten physical encodings are not claimed identical. No collection uniqueness or full binding acceptance claim.','runtime':'PyArrow 21.0.0','rows':rows,'sha256':{p:sha(p) for p in paths}}
Path('fixtures/validation/key-parquet-projection-native.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'schemas':len(rows),'duplicateWriteReads':len(rows),'requiredNullRefusals':len(rows),'inputTruncations':sum('inputTruncation'in r for r in rows)}))
