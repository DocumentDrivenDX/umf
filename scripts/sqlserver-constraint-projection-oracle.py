import json,io
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
cases=json.loads(Path('fixtures/sqlserver/constraint-projections.json').read_text())['cases']
# These deliberately violate constraints from the independently executed SQL fixture.
rows={'Child':{'id':2,'parent_b':99,'parent_a':99,'qty':-1,'other':-1},'Parent':{'a':9,'b':9,'code':'one'},'Untrusted':{'id':1,'parent_code':'absent'}}
def apache(schema,row):
    parsed=avro.schema.parse(json.dumps(schema));out=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(out));data=out.getvalue();return data,avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data)))
def fast(schema,row):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,row,strict=True);data=out.getvalue();return data,fastavro.schemaless_reader(io.BytesIO(data),schema)
results=[]
for c in cases:
    row=rows[c['table']];native=json.loads(c['result']['nativeSchema']);baseline,a=apache(native,row);other,b=fast(native,row);assert baseline==other and a==b==row
    for output in c['exports']:
        schema=json.loads(output['schema']);data,a=apache(schema,row);other,b=fast(schema,row);assert data==other==baseline and a==b==row
        # Two separately encoded equal records remain valid: Avro enforces no table key.
        stream=io.BytesIO(data+data);reader=avro.io.DatumReader(avro.schema.parse(json.dumps(schema)));decoder=avro.io.BinaryDecoder(stream)
        assert [reader.read(decoder),reader.read(decoder)]==[row,row] and stream.read()==b''
        stream=io.BytesIO(data+data);assert [fastavro.schemaless_reader(stream,schema),fastavro.schemaless_reader(stream,schema)]==[row,row] and stream.read()==b''
        results.append({'table':c['table'],'format':output['format'],'bytes':len(data),'valuesAgree':True})
native_evidence=json.loads(Path('fixtures/sqlserver/constraints-oracle.json').read_text())
assert all(p['rejections']==5 and p['untrustedConstraintStillEnforcesNewRows'] for p in native_evidence['behaviors'])
Path('fixtures/sqlserver/constraint-projection-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'cases':results,'acceptedRows':rows,'nativeSourceEvidence':'fixtures/sqlserver/constraints-oracle.json','nativeDdlSha256':native_evidence['ddlSha256'],'scope':'Target schemas accept orphan/check-violating rows and independent duplicate records. Native enforcement is separately tested; no cross-system constraint execution or row conversion is claimed.'},indent=2)+'\n')
print({'recoveries':len(results),'tables':len(cases)})
