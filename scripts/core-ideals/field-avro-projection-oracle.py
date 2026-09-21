import io,json,avro,avro.schema,avro.io
from pathlib import Path
from datetime import date,time,datetime,timezone
from decimal import Decimal
assert avro.__version__=='1.12.0'
rows=json.loads(Path('fixtures/validation/field-avro-projection-corpus.json').read_text())['rows'];checks=[]
values={'null':None,'boolean':True,'int':2147483647,'long':9007199254740993,'float':1.0000000000000002,'double':1.0000000000000002,'bytes':b'\x00\xff','string':'Unicode 雪','date':date(2024,1,2),'time-millis':time(12,34,56,789000),'time-micros':time(12,34,56,789123),'timestamp-millis':datetime(2024,1,2,tzinfo=timezone.utc),'timestamp-micros':datetime(2024,1,2,0,0,0,123456,tzinfo=timezone.utc),'local-timestamp-micros':123456789,'decimal(38,9)':Decimal('123.450000000')}
for row in rows:
 schema=avro.schema.parse(row['text']);kind=row['request']['nativeType'];assert schema.fullname=='sales.Example';assert schema.fields[0].name=='value';assert schema.fields[0].doc==row['author']['target']['modules'][0]['elements'][0]['description']
 value=values[kind];out=io.BytesIO();avro.io.DatumWriter(schema).write({'value':value},avro.io.BinaryEncoder(out));back=avro.io.DatumReader(schema).read(avro.io.BinaryDecoder(io.BytesIO(out.getvalue())))['value']
 if kind=='float':assert back==1.0 and back!=value
 else:assert back==value,(kind,back,value)
 checks.append({'nativeType':kind,'binaryBytes':len(out.getvalue()),'scope':'underlying long only; Python ignores local logical type' if kind=='local-timestamp-micros' else 'native sample encode/decode','floatNarrowing':kind=='float'})
Path('fixtures/validation/field-avro-projection-native.json').write_text(json.dumps({'version':avro.__version__,'checks':checks,'limitations':['local-timestamp-micros semantics are not validated by this Python implementation','sample value checks do not prove general value-domain equivalence']},indent=2)+'\n');print(json.dumps({'schemas':len(checks),'sampleRoundTrips':len(checks),'floatNarrowingConfirmed':True}))
