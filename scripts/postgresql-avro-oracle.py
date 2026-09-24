import json,io,datetime,warnings
from decimal import Decimal
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
fixture=json.loads(Path('fixtures/postgresql/avro-projection.json').read_text());native=json.loads(fixture['result']['nativeSchema'])
row={'flag':True,'small':-32768,'ordinary':2147483647,'large':9007199254740993,'exact':Decimal('1234567890123456.1234'),'single':1.25,'wide':1.25,'words':'Snow 雪','bounded':'🧪','padded':'AB  ','data':b'\x00\xff','day':datetime.date(2026,9,21),'clock':datetime.time(23,59,59,123000),'zoned_clock':'24:00:00+05:30','local_stamp':0,'instant':datetime.datetime(2026,9,21,12,0,tzinfo=datetime.timezone.utc),'items':'[0:1]={1,2}','domain_value':'42','document':'{"key": 1}','identifier':'123e4567-e89b-12d3-a456-426614174000'}
assert set(row)=={f['name'] for f in native['fields']}
def normalized(row):
    result=dict(row);local=result.get('local_stamp')
    if isinstance(local,datetime.datetime):
        delta=local-datetime.datetime(1970,1,1);result['local_stamp']=delta.days*86400000000+delta.seconds*1000000+delta.microseconds
    return result
def apache(schema,row):
    parsed=avro.schema.parse(json.dumps(schema));out=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(out));data=out.getvalue();return data,avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data)))
def fast(schema,row):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,row,strict=True);data=out.getvalue();return data,fastavro.schemaless_reader(io.BytesIO(data),schema)
cases=[]
with warnings.catch_warnings(record=True) as notices:
    warnings.simplefilter('always')
    baseline,a=apache(native,row);other,b=fast(native,row);assert baseline==other and normalized(a)==normalized(b)==row
    for output in fixture['exports']:
        schema=json.loads(output['schema']);data,a=apache(schema,row);other,b=fast(schema,row);assert data==other==baseline and normalized(a)==normalized(b)==row
        cases.append({'format':output['format'],'bytes':len(data),'normalizedValuesAgree':True,'localTimestampReturnTypes':[type(a['local_stamp']).__name__,type(b['local_stamp']).__name__]})
    nulls={k:None for k in row};assert apache(native,nulls)[1]==fast(native,nulls)[1]==nulls
    wide={**row,'small':40000,'words':'\x00'};assert normalized(apache(native,wide)[1])==wide and normalized(fast(native,wide)[1])==wide
Path('fixtures/postgresql/avro-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'fields':len(row),'cases':cases,'warnings':sorted(set(str(w.message) for w in notices)),'nullableValuesAgree':True,'targetAcceptsSmallint40000AndNulText':True,'scope':'Target schema/binary/value behavior, not a PostgreSQL instance converter. Local timestamp normalized only for declared field to exact epoch microseconds.'},indent=2)+'\n')
print({'fields':len(row),'recoveries':len(cases),'bytes':len(baseline)})
