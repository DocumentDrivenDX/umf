import json,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
rows=[]
for c in json.loads(Path('fixtures/validation/relationship-parquet-corpus.json').read_text())['cases']:
 assert hashlib.sha256(Path(c['path']).read_bytes()).hexdigest()==c['sha256']
 native=pq.ParquetFile(c['path']);schema=native.schema_arrow;r=c['request'];field=schema.field(0)
 assert native.read().num_rows==0
 key=field.type.value_type if r['shape']=='array' else field.type
 assert pa.types.is_struct(key)
 assert field.nullable==(r['shape']=='nullable-one')
 for i,component in enumerate(r['components']):
  assert key[i].name==component['name'] and not key[i].nullable
  assert key[i].metadata[b'PARQUET:field_id']==str(i+2).encode()
  assert key[i].type=={'boolean':pa.bool_(),'int':pa.int32(),'long':pa.int64(),'float':pa.float32(),'double':pa.float64(),'bytes':pa.binary(),'string':pa.string()}[component['type']]
  assert native.schema.column(i).max_repetition_level==(1 if r['shape']=='array' else 0)
 values={x['name']:True if x['type']=='boolean' else b'x' if x['type']=='bytes' else 'dangling' if x['type']=='string' else 999 for x in r['components']}
 references=[[],[values,values]] if r['shape']=='array' else [None,values] if r['shape']=='nullable-one' else [values,values]
 data=[{r['fieldName']:v} for v in references]
 table=pa.Table.from_pylist(data,schema=schema);sink=pa.BufferOutputStream();pq.write_table(table,sink,version='2.6');decoded=pq.read_table(pa.BufferReader(sink.getvalue()),use_threads=False).to_pylist()
 assert decoded==data
 # Files contain duplicate/dangling key values without any target collection.
 rows.append({'name':c['name'],'schema':str(native.schema),'rows':len(decoded),'graphEnforcement':False})
Path('fixtures/validation/relationship-parquet-native.json').write_text(json.dumps({'version':pa.__version__,'scope':'16 generated nested reference schemas; duplicate/dangling values, empty lists and optional nulls do not enforce relationships','cases':rows,'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in ['fixtures/validation/relationship-parquet-corpus.json','scripts/core-ideals/relationship-parquet-native.py','scripts/core-ideals/relationship-parquet-oracle.ts','src/core-ideals/relationship-parquet-projection.ts','src/core-ideals/relationship-parquet-carrier.ts']}},indent=2)+'\n')
print('PyArrow relationship schemas:',len(rows))
