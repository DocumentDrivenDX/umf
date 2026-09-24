import json,io,datetime,warnings
from decimal import Decimal
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
import avro,avro.schema,avro.io,fastavro
assert (pa.__version__,avro.__version__,fastavro.__version__)==('21.0.0','1.12.0','1.12.2')
fixture=json.loads(Path('fixtures/parquet/avro/projection.json').read_text());native=json.loads(fixture['result']['nativeSchema'])
table=pq.read_table('fixtures/parquet/avro/nested.parquet');rows=table.drop(['stamp','clock','local']).to_pylist()
# Explicit oracle-only bindings, not a library row converter. Read ns carriers exactly.
for i,row in enumerate(rows):
    for name in ['stamp','clock','local']:row[name]=table.column(name).cast(pa.int64())[i].as_py()
    if row['unsigned'] is not None:row['unsigned']=Decimal(row['unsigned'])
    if row['lookup'] is not None:row['lookup']=[{'key':k,'value':v} for k,v in row['lookup']]
def normalized(row):
    result=dict(row);local=result.get('local')
    if isinstance(local,datetime.datetime):
        delta=local-datetime.datetime(1970,1,1);result['local']=delta.days*86400000000+delta.seconds*1000000+delta.microseconds
    return result
def apache(schema,row):
    parsed=avro.schema.parse(json.dumps(schema));out=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(out));data=out.getvalue();return data,avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data)))
def fast(schema,row):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,row,strict=True);data=out.getvalue();return data,fastavro.schemaless_reader(io.BytesIO(data),schema)
cases=[];corpus=[]
with warnings.catch_warnings(record=True) as notices:
    warnings.simplefilter('always')
    for c in json.loads(Path('fixtures/parquet/avro/corpus.json').read_text())['cases']:
        if c['status']!='projected':continue
        schema=json.loads(c['nativeSchema']);avro.schema.parse(c['nativeSchema']);fastavro.parse_schema(schema);corpus.append({'family':c['family'],'id':c['id'],'schemasAccepted':True})
    for i,row in enumerate(rows):
        baseline,a=apache(native,row);other,b=fast(native,row);assert baseline==other and normalized(a)==normalized(b)==row
        for output in fixture['exports']:
            schema=json.loads(output['schema']);data,a=apache(schema,row);other,b=fast(schema,row);assert data==other==baseline and normalized(a)==normalized(b)==row
            cases.append({'row':i,'format':output['format'],'bytes':len(data),'normalizedValuesAgree':True})
    gap={**rows[0],'small':1000,'unsigned':Decimal('-1')};assert normalized(apache(native,gap)[1])==gap and normalized(fast(native,gap)[1])==gap
Path('fixtures/parquet/avro/oracle.json').write_text(json.dumps({'pyarrow':pa.__version__,'avro':avro.__version__,'fastavro':fastavro.__version__,'cases':cases,'corpus':corpus,'warnings':sorted(set(str(w.message) for w in notices)),'targetAcceptsNativeIntegerRangeViolations':True,'scope':'Schema/value evidence with explicitly authored oracle conversion of uint64, map entries and temporal carriers. No general library row encoder. Python local timestamp APIs normalized only for the declared field.'},indent=2)+'\n')
print({'rows':len(rows),'recoveries':len(cases),'corpusSchemas':len(corpus),'warnings':len(notices)})
