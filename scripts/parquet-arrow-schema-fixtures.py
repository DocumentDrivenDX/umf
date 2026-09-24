import base64,json
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
base=Path('fixtures/parquet/arrow-schema');base.mkdir(parents=True,exist_ok=True)
schema=pa.schema([pa.field('events',pa.large_list(pa.int32())),pa.field('elapsed',pa.duration('us')),pa.field('created',pa.timestamp('us',tz='America/New_York')),pa.field('label',pa.string(),metadata={b'future.field':b'preserve'})],metadata={b'future.schema':b'preserve'})
table=pa.Table.from_arrays([pa.array([[1,2],None],type=schema[0].type),pa.array([1234,None],type=schema[1].type),pa.array([0,1234567],type=schema[2].type),pa.array(['a','b'])],schema=schema)
cases=[]
for stored in [True,False]:
 path=base/('stored.parquet' if stored else 'physical-only.parquet');pq.write_table(table,path,store_schema=stored,compression='NONE')
 metadata=pq.read_metadata(path).metadata or {};encoded=metadata.get(b'ARROW:schema');native=pq.read_schema(path)
 if stored:
  decoded=pa.ipc.read_schema(pa.BufferReader(base64.b64decode(encoded)));assert decoded.equals(schema,check_metadata=True)
 cases.append({'path':str(path),'stored':stored,'ipcHex':base64.b64decode(encoded).hex() if encoded else None,'fields':[{'name':f.name,'type':str(f.type)} for f in native]})
assert cases[0]['fields']!=cases[1]['fields']
(base/'native.json').write_text(json.dumps({'pyarrow':pa.__version__,'cases':cases,'scope':'Stored Arrow schema recovers large-list, duration and named timezone distinctions; physical-only reading differs.'},indent=2)+'\n')
print({'cases':len(cases),'differentNativeTypes':True})
