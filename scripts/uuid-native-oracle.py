# SPDX-License-Identifier: MIT OR Apache-2.0
"""Execute generated artifacts with independent pinned native Avro/Parquet runtimes."""
import io,json,tempfile,uuid,warnings,sys
from pathlib import Path
import avro,avro.schema,avro.io,fastavro,pyarrow as pa,pyarrow.parquet as pq
assert (avro.__version__,fastavro.__version__,pa.__version__)==('1.12.0','1.12.2','21.0.0')
rows=json.loads(Path('fixtures/validation/uuid/native-artifacts.json').read_text())['cases']
cases=json.loads(Path('fixtures/validation/uuid/bit128-oracle.json').read_text())['cases']
observations=[]
for row in rows:
 if row['system'] not in ('avro','parquet') or 'candidate' not in row['report']:continue
 text=row['report']['candidate']['text'];schema=json.loads(text);kind=row['kind'];seen=[];checks=0
 with warnings.catch_warnings(record=True) as caught:
  warnings.simplefilter('always')
  if row['system']=='avro':
   apache=avro.schema.parse(text);fast=fastavro.parse_schema(schema)
   for vector,slots in zip(cases,row['values'],strict=True):
    datum={'hi':int(slots['hi']),'lo':int(slots['lo'])} if kind=='words64' else {'id':uuid.UUID(slots['id']).bytes if kind=='native-uuid' else bytes.fromhex(slots['id']) if kind=='bytes16' else slots['id']}
    for engine in ('apache','fastavro'):
     stream=io.BytesIO()
     if engine=='apache':avro.io.DatumWriter(apache).write(datum,avro.io.BinaryEncoder(stream));stream.seek(0);decoded=avro.io.DatumReader(apache).read(avro.io.BinaryDecoder(stream))
     else:fastavro.schemaless_writer(stream,fast,datum);stream.seek(0);decoded=fastavro.schemaless_reader(stream,fast)
     if kind=='words64':actual=((int(decoded['hi'])%(2**64))*(2**64)+int(decoded['lo'])%(2**64)).to_bytes(16,'big').hex()
     elif kind in ('native-uuid','bytes16'):actual=decoded['id'].hex()
     else:actual=uuid.UUID(str(decoded['id'])).hex
     assert actual==vector['hex'],(engine,kind,actual,vector)
     checks+=1
   # Both native writers must reject a one-half overflow rather than round.
   if kind=='words64':
    for engine in ('apache','fastavro'):
     try:
      if engine=='apache':avro.io.DatumWriter(apache).write({'hi':2**63,'lo':0},avro.io.BinaryEncoder(io.BytesIO()))
      else:fastavro.schemaless_writer(io.BytesIO(),fast,{'hi':2**63,'lo':0})
     except Exception:checks+=1
     else:raise AssertionError('native writer accepted out-of-range signed64')
  else:
   fields=[];columns={}
   for col in schema['columns']:
    typ=(pa.int64() if col['isSigned'] else pa.uint64()) if kind=='words64' else pa.uuid() if kind=='native-uuid' else pa.binary(16) if kind=='bytes16' else pa.string()
    fields.append(pa.field(col['name'],typ,nullable=col['nullable']))
    columns[col['name']]=[int(slots[col['name']]) if kind=='words64' else uuid.UUID(slots[col['name']]).bytes if kind=='native-uuid' else bytes.fromhex(slots[col['name']]) if kind=='bytes16' else slots[col['name']] for slots in row['values']]
   table=pa.Table.from_pydict(columns,schema=pa.schema(fields))
   with tempfile.TemporaryDirectory(prefix='umf-uuid-parquet-') as temp:
    path=Path(temp)/'values.parquet';pq.write_table(table,path);stored=pq.read_table(path);meta=pq.read_metadata(path)
    for i,v in enumerate(cases):
     value=stored.slice(i,1).to_pylist()[0]
     actual=((value['hi']%(2**64))*(2**64)+value['lo']%(2**64)).to_bytes(16,'big').hex() if kind=='words64' else value['id'].bytes.hex() if kind=='native-uuid' else value['id'].hex() if kind=='bytes16' else uuid.UUID(value['id']).hex
     assert actual==v['hex'];checks+=1
    if kind=='native-uuid':assert str(meta.schema.column(0).logical_type)=='UUID'
    assert stored.schema==table.schema
    seen.append(str(meta.schema))
  observations.append({'system':row['system'],'kind':kind,'signed':row.get('signed'),'vectors':len(cases),'checks':checks,'warnings':sorted(set(str(w.message) for w in caught)),'nativeSchema':seen})
result={'scope':'Generated required singular carrier schemas and all-bit datum recovery; no whole-model/native-equivalence, key, nullable pair or execution qualification','versions':{'python':sys.version,'avro':avro.__version__,'fastavro':fastavro.__version__,'pyarrow':pa.__version__},'observations':observations,'checks':sum(r['checks'] for r in observations)}
Path('fixtures/validation/uuid/native-oracle.json').write_text(json.dumps(result,indent=2)+'\n');print({k:v for k,v in result.items() if k not in ('observations',)})
