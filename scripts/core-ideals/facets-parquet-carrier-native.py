"""Read independently emitted native declarations with pinned PyArrow."""
import hashlib,json,datetime
from decimal import Decimal
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
corpus='fixtures/validation/facets-parquet-carrier-corpus.json'
rows=json.loads(Path(corpus).read_text())['rows'];results=[];writes=0
for row in rows:
    assert sha(row['path'])==row['sha256']
    request=row['request'];c=request['carrier']
    try:
        native=pq.ParquetFile(row['path']);schema=native.schema_arrow
        result={'accepted':True}
    except (pa.ArrowException,OSError,ValueError) as error:
        result={'accepted':False,'errorType':type(error).__name__,'error':str(error)}
    assert result['accepted']==row['expectNative'],(row,result)
    if result['accepted']:
        assert native.metadata.num_rows==0 and native.read().num_rows==0
        field=schema.field(0);col=native.schema.column(0)
        assert field.name==request['fieldName'] and field.nullable==request['nullable']
        assert field.metadata[b'PARQUET:field_id']==b'37'
        assert native.metadata.metadata[b'future.meaning']==b'unclassified'
        assert native.metadata.metadata[b'umf.maxLength']==b'1'
        if c['kind']=='integer':
            assert field.type.bit_width==c['bits']
            assert pa.types.is_signed_integer(field.type)==c['signed']
            assert col.physical_type==('INT64' if c['bits']==64 else 'INT32')
        if c['kind']=='decimal':
            assert (field.type.precision,field.type.scale)==(c['precision'],c['scale'])
            assert col.physical_type=={'int32':'INT32','int64':'INT64','bytes':'BYTE_ARRAY','fixed':'FIXED_LEN_BYTE_ARRAY'}[c['carrier']]
        t=field.type
        if pa.types.is_boolean(t):value=True
        elif pa.types.is_integer(t):value=1
        elif pa.types.is_floating(t):value=1.25
        elif pa.types.is_decimal(t):value=Decimal('0.12') if t.scale==2 else Decimal(1)
        elif pa.types.is_string(t):value='overlength'
        elif pa.types.is_fixed_size_binary(t):value=b'x'*t.byte_width
        elif pa.types.is_binary(t):value=b'overlength'
        elif pa.types.is_date(t):value=datetime.date(2020,1,2)
        elif pa.types.is_time(t):value=datetime.time(1,2,3)
        elif pa.types.is_timestamp(t):value=datetime.datetime(2020,1,2,tzinfo=datetime.timezone.utc)
        else:raise AssertionError(t)
        values=[value]+([None] if request['nullable'] else [])
        table=pa.Table.from_arrays([pa.array(values,type=t,safe=True)],schema=schema)
        sink=pa.BufferOutputStream();pq.write_table(table,sink,version='2.6')
        decoded=pq.read_table(pa.BufferReader(sink.getvalue())).column(0).to_pylist()
        assert decoded==values,(row,decoded,values)
        writes+=1
        result.update({'arrowType':str(t),'physical':col.physical_type,'logical':json.loads(col.logical_type.to_json()),'sample':repr(value),'decoded':repr(decoded)})
    results.append({'path':row['path'],**result})
paths=[corpus,__file__,'scripts/core-ideals/facets-parquet-carrier-oracle.ts','src/core-ideals/parquet-facet-carrier.ts','src/core-ideals/parquet-carriers.ts','src/adapters/parquet/encode.ts',*[r['path'] for r in rows]]
out={'scope':'Independent empty-file parse and Arrow value write/read using emitted schema; rewritten file physical encodings are not claimed identical','runtime':'PyArrow 21.0.0','cases':len(rows),'accepted':sum(r['accepted'] for r in results),'valueWrites':writes,'bindingAccepted':False,'results':results,'sha256':{p:sha(p) for p in sorted(set(paths))}}
Path('fixtures/validation/facets-parquet-carrier-native.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:out[k] for k in ['cases','accepted','valueWrites']}))
