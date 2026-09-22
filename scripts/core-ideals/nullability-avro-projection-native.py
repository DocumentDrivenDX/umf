import io,json,hashlib,warnings
from pathlib import Path
from datetime import date,time,datetime,timezone,timedelta
from decimal import Decimal
import avro,avro.schema,avro.io,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
path='fixtures/validation/nullability-avro-projection-corpus.json'
corpus=json.loads(Path(path).read_text());checks=[]
values={'null':None,'boolean':True,'int':2147483647,'long':9007199254740993,'float':1.0000000000000002,'double':1.0000000000000002,'bytes':b'\x00\xff','string':'Unicode 雪','date':date(2024,1,2),'time-millis':time(12,34,56,789000),'time-micros':time(12,34,56,789123),'timestamp-millis':datetime(2024,1,2,tzinfo=timezone.utc),'timestamp-micros':datetime(2024,1,2,0,0,0,123456,tzinfo=timezone.utc),'local-timestamp-micros':123456789,'decimal(38,9)':Decimal('123.450000000')}
for row in corpus['rows']:
 if row['result']['status']=='blocked':assert 'target' not in row['result'] and 'text' not in row;continue
 schema=json.loads(row['text']);assert schema['fields'][0]['name']=='value' and 'default' not in schema['fields'][0];assert schema['fields'][0]['doc']==row['author']['target']['modules'][0]['elements'][0]['description']
 for codec in ['apache','fastavro']:
  with warnings.catch_warnings(record=True) as captured:
   warnings.simplefilter('always')
   parsed=avro.schema.parse(row['text']) if codec=='apache' else fastavro.parse_schema(schema)
   def write_read(datum,strict=False):
    out=io.BytesIO()
    if codec=='apache':avro.io.DatumWriter(parsed).write(datum,avro.io.BinaryEncoder(out))
    else:fastavro.schemaless_writer(out,parsed,datum,strict=strict)
    data=out.getvalue()
    back=avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data))) if codec=='apache' else fastavro.schemaless_reader(io.BytesIO(data),parsed)
    return data,back
   value=values[row['nativeType']]
   if codec=='fastavro' and row['nativeType']=='local-timestamp-micros':value=datetime(1970,1,1)+timedelta(microseconds=value)
   outcomes=[]
   for op,datum in [('present',{'value':value}),('null',{'value':None}),('omitted',{})]+([('strict-omitted',{})] if codec=='fastavro' else []):
    coerced_null=codec=='fastavro' and row['nativeType']=='boolean' and not row['allowsNull'] and op=='null'
    expected=op=='present' or row['allowsNull'] and op!='strict-omitted' or coerced_null
    try:data,back=write_read(datum,op=='strict-omitted')
    except Exception as error:
     assert not expected,(row['id'],codec,op,type(error).__name__,str(error));outcomes.append({'operation':op,'status':'rejected','error':type(error).__name__});continue
    assert expected,(row['id'],codec,op,back)
    expected_value=value if op=='present' else False if coerced_null else None
    if op=='present' and row['nativeType']=='float':assert back['value']==1.0 and back['value']!=value
    else:assert back['value']==expected_value,(row['id'],codec,op,back,expected_value)
    outcomes.append({'operation':op,'status':'accepted','hex':data.hex(),'decoded':repr(back['value']),'inputNullCoercedToFalse':coerced_null,'floatNarrowing':op=='present' and row['nativeType']=='float'})
   # Even nullable generated fields have no reader default for older writer schemas.
   empty={'type':'record','name':'Example','namespace':'availability','fields':[]}
   try:
    if codec=='apache':avro.io.DatumReader(avro.schema.parse(json.dumps(empty)),parsed).read(avro.io.BinaryDecoder(io.BytesIO(b'')))
    else:fastavro.schemaless_reader(io.BytesIO(b''),fastavro.parse_schema(empty),parsed)
   except Exception as error:
    assert type(error).__name__==('SchemaResolutionException' if codec=='apache' else 'SchemaResolutionError')
    outcomes.append({'operation':'reader-missing-field','status':'rejected','error':type(error).__name__})
   else:raise AssertionError('A default was silently introduced')
  checks.append({'id':row['id'],'nativeType':row['nativeType'],'codec':codec,'outcomes':outcomes,'warnings':[str(w.message) for w in captured]})
record={'versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'checks':checks,'limitations':['Single authored field and explicit carrier; sample values do not establish general value-domain equivalence.','Apache Python ignores local-timestamp-micros and receives the underlying long; fastavro uses its logical datetime codec.','Null and omitted writer API inputs remain distinct from reader-resolution defaults.',
'fastavro coerces explicit None to False for non-null booleans; this is input coercion, not encoded null permission.','Float narrowing is measured even for availability-exact mappings; value exactness requires separate facets and residuals.'],'fingerprints':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [path,__file__]}}
Path('fixtures/validation/nullability-avro-projection-native.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'nativeSchemas':len(checks),'outcomes':sum(len(c['outcomes']) for c in checks)}))
