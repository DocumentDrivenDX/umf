import hashlib,io,json
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
import avro,avro.schema,avro.io,fastavro
assert (pa.__version__,avro.__version__,fastavro.__version__)==('21.0.0','1.12.0','1.12.2')
base=Path('fixtures/parquet/arrow-schema');fixture=base/'avro-losses.json';cases=[];encodings={}
for case in json.loads(fixture.read_text())['cases']:
 table=pq.read_table(base/case['file']);schema_text=case['result']['nativeSchema'];rows=table.to_pylist()
 for i,row in enumerate(rows):
  original_duration=type(row['elapsed']).__name__
  # Explicit oracle-only duration-to-integer binding; the library does not encode rows.
  row['elapsed']=table.column('elapsed').cast(pa.int64())[i].as_py()
  for engine in ['apache','fastavro']:
   schema=avro.schema.parse(schema_text) if engine=='apache' else fastavro.parse_schema(json.loads(schema_text));out=io.BytesIO()
   if engine=='apache':avro.io.DatumWriter(schema).write(row,avro.io.BinaryEncoder(out))
   else:fastavro.schemaless_writer(out,schema,row,strict=True)
   binary=out.getvalue();decoded=avro.io.DatumReader(schema).read(avro.io.BinaryDecoder(io.BytesIO(binary))) if engine=='apache' else fastavro.schemaless_reader(io.BytesIO(binary),schema)
   assert decoded==row
   if i in encodings:assert encodings[i]==binary
   else:encodings[i]=binary
   assert decoded['created'].utcoffset().total_seconds()==0
   cases.append({'file':case['file'],'row':i,'engine':engine,'bytes':len(binary),'sourceDurationValueType':original_duration,'targetDurationValueType':type(decoded['elapsed']).__name__,'sourceTimezone':table.schema.field('created').type.tz,'targetTimestamp':decoded['created'].isoformat(),'sameInstant':True,'sourceListType':str(table.schema.field('events').type)})
output={'pyarrow':pa.__version__,'avro':avro.__version__,'fastavro':fastavro.__version__,'sourceSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'cases':cases,'scope':'Authored duration carrier binding gives identical target bytes while source duration/list/timezone meanings differ. Native Avro recovers the instant in UTC, not the original named timezone. No general row converter or embedded/physical equivalence claim.'}
(base/'avro-losses-oracle.json').write_text(json.dumps(output,indent=2)+'\n');print({'nativeComparisons':len(cases),'identicalTargetBytesAcrossSources':True})
