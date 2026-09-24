import json,io,datetime
from decimal import Decimal
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
fixture=json.loads(Path('fixtures/sqlserver/avro-projection.json').read_text());native=json.loads(fixture['result']['nativeSchema'])
row={'id':9007199254740993,'flag':True,'tiny':255,'small':-32768,'ordinary':-2147483648,'exact':Decimal('9'*29+'.'+'1'*9),'numeric_value':Decimal('12345678901234567.123'),'cash':Decimal('922337203685477.5807'),'small_cash':Decimal('214748.3647'),'approximate':1.25,'single':1.25,'words':'word','unicode_words':'雪🧪','unlimited':'long text','fixed_text':'AB  ','unicode_fixed':'雪   ','bytes':b'\x00\xff','fixed_bytes':bytes(range(8)),'version_stamp':bytes(range(8)),'day':datetime.date(9999,12,31),'clock':'23:59:59.1234567','local_stamp':'9999-12-31T23:59:59.1234567','instant':'2026-01-01T12:00:00.1234567+05:30','legacy_stamp':'2026-01-01T00:00:00.003','small_stamp':'2026-01-01T00:01:00','amount':Decimal('12345678901234.1234'),'identifier':'123e4567-e89b-12d3-a456-426614174000','document':'<root>雪</root>','variant':'1','computed':-2147483647}
assert set(row)=={f['name'] for f in native['fields']}
def apache(schema,row):
    parsed=avro.schema.parse(json.dumps(schema));out=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(out));data=out.getvalue();decoded=avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data)));return data,decoded
def fast(schema,row):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,row,strict=True);data=out.getvalue();return data,fastavro.schemaless_reader(io.BytesIO(data),schema)
baseline,decoded=apache(native,row);other,fast_decoded=fast(native,row);assert decoded==row==fast_decoded and baseline==other
cases=[]
for output in fixture['exports']:
    schema=json.loads(output['schema']);a,values=apache(schema,row);b,other_values=fast(schema,row);assert a==b==baseline and values==other_values==row
    cases.append({'format':output['format'],'bytes':len(a),'valuesAgree':True,'bytesAgree':True})
nullable={**row,**{f['name']:None for f in native['fields'] if isinstance(f['type'],list)}}
assert apache(native,nullable)[1]==fast(native,nullable)[1]==nullable
wide={**row,'tiny':300};assert apache(native,wide)[1]['tiny']==300
bad_fixed={**row,'fixed_bytes':b'bad'}
for writer in [apache,fast]:
    try:writer(native,bad_fixed)
    except Exception:pass
    else:raise AssertionError('Bad fixed length accepted')
Path('fixtures/sqlserver/avro-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'fields':len(row),'cases':cases,'nullableValuesAgree':True,'fixedLengthRejected':True,'targetAcceptsTinyint300':True,'scope':'Target schema/binary/value behavior, not a SQL Server instance converter; source native catalog evidence is separate.'},indent=2)+'\n')
print({'fields':len(row),'recoveries':len(cases),'bytes':len(baseline)})
