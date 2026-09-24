import json,io,datetime,warnings
from decimal import Decimal
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
rows={'authored':{'flag':True,'count':2147483647,'large':9007199254740993,'single':1.25,'wide':1.25,'amount':Decimal('12345678901234.1234'),'day':datetime.date(2026,9,21),'date_text':'20260921','instant':datetime.datetime(2026,9,21,12,0,tzinfo=datetime.timezone.utc),'local_time':0,'vector':[0.25,None,1.5],'title':'Snow 雪'},'providers':{'provider_id':'P1','provider_name':'Provider 雪','provider_npi':None,'state_code':'CA'}}
def normalized(row):
    result=dict(row);local=result.get('local_time')
    if isinstance(local,datetime.datetime):
        delta=local-datetime.datetime(1970,1,1);result['local_time']=delta.days*86400000000+delta.seconds*1000000+delta.microseconds
    return result
def apache(schema,row):
    parsed=avro.schema.parse(json.dumps(schema));out=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(out));data=out.getvalue();return data,avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data)))
def fast(schema,row):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,row,strict=True);data=out.getvalue();return data,fastavro.schemaless_reader(io.BytesIO(data),schema)
results=[]
with warnings.catch_warnings(record=True) as notices:
    warnings.simplefilter('always')
    for c in json.loads(Path('fixtures/tablespec/avro-projection.json').read_text())['cases']:
        row=rows[c['id']];native=json.loads(c['result']['nativeSchema']);baseline,a=apache(native,row);other,b=fast(native,row)
        assert baseline==other and normalized(a)==normalized(b)==row
        for output in c['exports']:
            schema=json.loads(output['schema']);data,a=apache(schema,row);other,b=fast(schema,row);assert data==other==baseline and normalized(a)==normalized(b)==row
            results.append({'id':c['id'],'format':output['format'],'bytes':len(data),'normalizedValuesAgree':True,'localTimestampReturnTypes':[type(a.get('local_time')).__name__,type(b.get('local_time')).__name__]})
        if c['id']=='authored':
            short={**row,'vector':[1.0]};assert normalized(apache(native,short)[1])==short and normalized(fast(native,short)[1])==short
Path('fixtures/tablespec/avro-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'cases':results,'warnings':sorted(set(str(w.message) for w in notices)),'targetAcceptsWrongEmbeddingDimension':True,'scope':'Target binary/value evidence. Python implementations expose local timestamps differently; normalize only the declared local-time field to exact epoch microseconds. int64 selection exceeds the pinned Spark INTEGER width; no native data conversion claimed.'},indent=2)+'\n')
print({'recoveries':len(results),'warnings':len(notices)})
# Table-level constraints are deliberately absent from the projected Avro record.
# Independent writers accept repeated keys and rows with no context discriminator.
table_checks=[]
for case in json.loads(Path('fixtures/tablespec/avro-table-losses.json').read_text())['cases']:
    schema=json.loads(case['result']['nativeSchema'])
    for writer in (apache,fast):
        values=[writer(schema,{'id':7})[1] for _ in range(2)]
        assert values==[{'id':7},{'id':7}]
        table_checks.append({'mode':case['mode'],'engine':writer.__name__,'duplicateKeyRowsAccepted':True,'contextDiscriminatorAbsent':True})
Path('fixtures/tablespec/avro-table-losses-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'checks':table_checks,'scope':'Target acceptance counterexamples only; no native TableSpec row validator or conversion is asserted.'},indent=2)+'\n')
print({'tableLossChecks':len(table_checks)})
integer_checks=[]
for case in json.loads(Path('fixtures/tablespec/avro-integers.json').read_text())['cases']:
    result=case['result']
    if result['status']=='blocked':
        column=json.loads(result['source']['extensions']['umf.tablespec']['originalSource'],parse_float=Decimal,parse_int=Decimal)['columns'][0]
        issue=next(i for i in result['issues'] if i['code']=='TABLESPEC_AVRO_UNSUPPORTED')
        key=issue['path'].split('/')[-1];value=column[key]
        assert value!=value.to_integral_value() or abs(value)>9007199254740991 or value.is_zero() and value.is_signed()
        integer_checks.append({'qualifier':key,'value':str(value),'exactBoundaryConfirmed':True})
    else:
        schema=json.loads(result['nativeSchema']);row={'n':Decimal('1.2')}
        a,av=apache(schema,row);b,bv=fast(schema,row)
        assert a==b and av==bv==row
Path('fixtures/tablespec/avro-integers-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'checks':integer_checks,'exactDecimalTargetBinaryAgreement':True,'scope':'Exact Decimal boundary checks and target codec agreement; native TableSpec coercion is not executed.'},indent=2)+'\n')
print({'integerBoundaryChecks':len(integer_checks),'exactDecimalTarget':True})
