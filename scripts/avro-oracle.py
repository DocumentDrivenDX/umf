"""Independent binary/schema-resolution checks; authored Avro 1.12 fixtures only."""
import io, json, hashlib
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timezone
import avro.schema, avro.io, avro, fastavro

assert avro.__version__ == '1.12.0'
assert fastavro.__version__ == '1.12.2'
checks=[]
limitations=[]
def check(name, fn):
    fn()
    checks.append(name)
def equal(a,b):
    assert a == b, (a,b)
def apache_encode(schema, datum):
    out=io.BytesIO(); avro.io.DatumWriter(schema).write(datum,avro.io.BinaryEncoder(out)); return out.getvalue()
def apache_decode(schema,data,reader=None):
    return avro.io.DatumReader(schema,reader).read(avro.io.BinaryDecoder(io.BytesIO(data)))
def fast_encode(schema,datum):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,datum,strict=True);return out.getvalue()
def fast_decode(schema,data,reader=None):
    return fastavro.schemaless_reader(io.BytesIO(data),schema,reader)

before=Path('fixtures/avro/order.avsc').read_text()
after=Path('fixtures/avro/round-trip.avsc').read_text()
check('all native metadata retained, independently parsed',lambda:equal(json.loads(before),json.loads(after)))
schemas=[avro.schema.parse(s) for s in [before,after]]
fast=[fastavro.parse_schema(json.loads(s)) for s in [before,after]]
base=dict(id=9223372036854775807,status='NEW',token=b'abcd',tags=['one','雪'],labels={'x':'y'},parent=None,amount=Decimal('1234.56'),created=datetime(2026,1,1,tzinfo=timezone.utc),payload=b'\x00\xff',active=True,score=1.5,ratio=2.25,count=-2147483648)
child={**base,'id':-9223372036854775808,'parent':base,'status':'DONE'}
for index,datum in enumerate([base,child]):
    binaries=[apache_encode(s,datum) for s in schemas]+[fast_encode(s,datum) for s in fast]
    check(f'vector {index}: four binary encoders agree before/after',lambda:equal(len(set(binaries)),1))
    for si in range(2):
        check(f'vector {index}: apache decode {si}',lambda:equal(apache_decode(schemas[si],binaries[0]),datum))
        check(f'vector {index}: fastavro decode {si}',lambda:equal(fast_decode(fast[si],binaries[0]),datum))
# Reader defaults apply to absent writer fields, not to permission to omit data.
reader_obj=json.loads(after);reader_obj['fields'].append({'name':'revision','type':'int','default':7})
reader=avro.schema.parse(json.dumps(reader_obj));fast_reader=fastavro.parse_schema(reader_obj)
encoded=apache_encode(schemas[0],base)
check('apache reader schema adds default',lambda:equal(apache_decode(schemas[0],encoded,reader)['revision'],7))
check('fastavro reader schema adds default',lambda:equal(fast_decode(fast[0],encoded,fast_reader)['revision'],7))
for label,schema,encoder in [('apache',schemas[0],apache_encode),('fastavro',fast[0],fast_encode)]:
    for field,value in [('count',2147483648),('token',b'bad'),('status','UNKNOWN')]:
        bad={**base,field:value}
        try: encoder(schema,bad)
        except Exception: checks.append(f'{label}: rejects invalid {field}')
        else:
            if label=='fastavro' and field=='count': limitations.append('fastavro strict writer accepts int outside signed 32-bit range; Apache rejects it')
            else: raise AssertionError(f'{label} accepted invalid {field}')
    missing=dict(base);del missing['active']
    try: encoder(schema,missing)
    except Exception: checks.append(f'{label}: default does not make writer field optional (strict encoding)')
    else: raise AssertionError(f'{label} accepted missing active')
# Negative control: silently changing a default must change resolution behavior.
reader_obj['fields'][-1]['default']=8
check('negative control detects default corruption',lambda:equal(apache_decode(schemas[0],encoded,avro.schema.parse(json.dumps(reader_obj)))['revision'],8))
report={'profile':'Avro 1.12.0 schema JSON; original UMF order fixture','versions':{'avro':avro.__version__,'fastavro':fastavro.__version__},'inputSha256':hashlib.sha256(before.encode()).hexdigest(),'checks':checks,'passed':len(checks),'limitations':limitations+['No upstream conformance corpus yet','No IDL, protocol/RPC or object-container support claim','No cross-format projection claim']}
Path('fixtures/avro/oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Avro independent oracle: {len(checks)} checks passed')
