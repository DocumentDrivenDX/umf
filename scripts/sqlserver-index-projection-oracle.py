import io,json
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
fixture=json.loads(Path('fixtures/sqlserver/index-projection.json').read_text());schema=json.loads(fixture['result']['nativeSchema']);parsed=avro.schema.parse(json.dumps(schema))
rows=[{'id':3,'email':'same','active':True,'payload':'c'},{'id':6,'email':'same','active':True,'payload':'f'}]
a=io.BytesIO();writer=avro.io.DatumWriter(parsed)
for row in rows:writer.write(row,avro.io.BinaryEncoder(a))
b=io.BytesIO()
for row in rows:fastavro.schemaless_writer(b,schema,row,strict=True)
assert a.getvalue()==b.getvalue()
a.seek(0);b.seek(0);reader=avro.io.DatumReader(parsed)
assert [reader.read(avro.io.BinaryDecoder(a)) for _ in rows]==rows
assert [fastavro.schemaless_reader(b,schema) for _ in rows]==rows
assert len([i for i in fixture['result']['issues'] if i['code']=='INDEX_NOT_REPRESENTED'])==3
native=json.loads(Path('fixtures/sqlserver/indexes-oracle.json').read_text())
assert all(case['filteredDuplicateRejected'] for case in native['behaviors'])
result={'avro':avro.__version__,'fastavro':fastavro.__version__,'rows':len(rows),'bytes':len(a.getvalue()),'binaryAndValuesAgree':True,'targetAcceptsNativeFilteredUniqueViolation':True,'scope':'Two independent target codecs accept the same filtered duplicate rejected by the native SQL Server oracle; source and per-index loss reports remain required'}
Path('fixtures/sqlserver/index-projection-oracle.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
