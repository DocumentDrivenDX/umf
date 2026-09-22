"""Parse and exercise every emitted record with both pinned native codecs."""
import io, json, decimal, datetime, hashlib, warnings
from pathlib import Path
import avro, avro.io, avro.schema, fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
decimal.getcontext().prec=28
decimal.getcontext().rounding=decimal.ROUND_HALF_EVEN
fixture='fixtures/validation/facets-avro-projection-targets.json'
rows=json.loads(Path(fixture).read_text())
results=[]
checks=[]
def value(t):
    if t=='boolean':return True
    if t in ('int','long'):return 1
    if t in ('float','double'):return 1.5
    if t=='string':return '😀é'
    if t in ('bytes','fixed'):return b'' if size==0 else b'\x01\x02'
    if t.startswith('decimal-'):return decimal.Decimal('0.12').quantize(decimal.Decimal(1).scaleb(-json.loads(row['schema'])['fields'][0]['type']['scale']))
    if t=='date':return datetime.date(2020,1,2)
    if t.startswith('time-'):return datetime.time(1,2,3)
    if t.startswith('local-'):return 0
    return datetime.datetime(2020,1,2,1,2,3,tzinfo=datetime.timezone.utc)
def parse(engine,text):return avro.schema.parse(text) if engine=='apache' else fastavro.parse_schema(json.loads(text))
def write(engine,schema,v):
    b=io.BytesIO()
    if engine=='apache':avro.io.DatumWriter(schema).write({'value':v},avro.io.BinaryEncoder(b))
    else:fastavro.schemaless_writer(b,schema,{'value':v},strict=True)
    return b.getvalue()
def read(engine,schema,data):
    b=io.BytesIO(data)
    v=avro.io.DatumReader(schema).read(avro.io.BinaryDecoder(b)) if engine=='apache' else fastavro.schemaless_reader(b,schema)
    assert b.tell()==len(data)
    return v['value']
for row in rows:
    t=row['request']['nativeType'];size=row['request'].get('fixedSize')
    schemas={};notices={}
    for e in ['apache','fastavro']:
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter('always')
            schemas[e]=parse(e,row['schema'])
            notices[e]=[str(w.message) for w in captured]
    if t=='local-timestamp-micros':assert any('Unknown local-timestamp' in x for x in notices['apache'])
    v=value(t)
    for engine,schema in schemas.items():
        data=write(engine,schema,v)
        decoded={e:read(e,s,data) for e,s in schemas.items()}
        # Apache does not implement local-timestamp conversion; retain that discrepancy.
        if t=='local-timestamp-micros':
            assert decoded['apache']==0 and decoded['fastavro']==datetime.datetime(1970,1,1)
        else:
            assert all(x==v for x in decoded.values()),(row['id'],engine,repr(v),decoded)
        results.append({'id':row['id'],'writer':engine,'parseWarnings':notices,'hex':data.hex(),'input':repr(v),'reads':{e:repr(x) for e,x in decoded.items()}})
    if row['request']['mode']!='report' or row['request']['encoding']!='native-type' or row['request']['profile']!='declared-schema':continue
    if t=='float':
        for e,s in schemas.items():assert read(e,s,write(e,s,1.0000000000000002))==1.0
        checks.append({'id':row['id'],'counterexample':'binary64 narrows to binary32'})
    if t=='int':
        try:write('apache',schemas['apache'],2147483648)
        except avro.errors.AvroTypeException:pass
        else:raise AssertionError('Apache unexpectedly accepted overflowing int')
        assert read('fastavro',schemas['fastavro'],write('fastavro',schemas['fastavro'],2147483648))==2147483648
        checks.append({'id':row['id'],'counterexample':'fastavro accepts int overflow'})
    if t.startswith('decimal-'):
        assert read('apache',schemas['apache'],write('apache',schemas['apache'],decimal.Decimal('1.2')))==decimal.Decimal('0.12')
        checks.append({'id':row['id'],'counterexample':'Apache Decimal coefficient rescaling'})
        raw=write('fastavro',schemas['fastavro'],bytes.fromhex('04d2'))
        assert raw
        checks.append({'id':row['id'],'counterexample':'fastavro accepts physical bytes without Decimal precision validation'})
    if t=='string':
        for e,s in schemas.items():assert read(e,s,write(e,s,'longer than the bound'))=='longer than the bound'
        checks.append({'id':row['id'],'counterexample':'string maximum is not enforced'})
    if t=='fixed' and size>0:
        for e,s in schemas.items():
            try:write(e,s,b'')
            except Exception:pass
            else:raise AssertionError('Fixed accepted shorter bytes')
        checks.append({'id':row['id'],'counterexample':'fixed rejects shorter values allowed by maximum'})
paths=[fixture,__file__,'scripts/core-ideals/facets-avro-projection-cases.ts','scripts/core-ideals/facets-avro-projection-oracle.ts','src/core-ideals/facets-avro-projection.ts','spec/core/facets-avro-projection.schema.json']
out={'scope':'Emitted scalar record schemas, pinned native parsing and sample codecs; not binding acceptance','versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'schemas':len(rows),'writerCases':len(results),'crossCodecReads':len(results)*2,'counterexamples':checks,'results':results,'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/facets-avro-projection-native.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:out[k] for k in ['schemas','writerCases','crossCodecReads']}))
