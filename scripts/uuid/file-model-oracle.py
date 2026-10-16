"""Independent native multi-field file recovery; no collection constraint equivalence."""
import io,json,tempfile,uuid,warnings,sys,hashlib
from pathlib import Path
import avro,avro.schema,avro.io,fastavro,pyarrow as pa,pyarrow.parquet as pq
assert (avro.__version__,fastavro.__version__,pa.__version__)==('1.12.0','1.12.2','21.0.0')
archive=Path('fixtures/validation/uuid/model-files');archive.mkdir(exist_ok=True)
vectors=json.loads(Path('fixtures/validation/uuid/bit128-oracle.json').read_text())['cases']
source=Path('fixtures/validation/uuid/file-model-artifacts.json');cases=json.loads(source.read_text())['cases'];observations=[];returned=[]
for case in cases:
 if case['system']=='tablespec':continue
 system,kind=case['system'],case['kind'];suffix='-unsigned' if case.get('signed') is False else '';same_case={'system':system,'domain':case['domain'],'kind':kind,'signed':case.get('signed')};bundle=json.loads(case['report']['candidate']['text']);schema=bundle['records'][1]
 def to_native(row):
  return {k:None if v is None else {n:int(w) for n,w in v.items()} if isinstance(v,dict) else uuid.UUID(v).bytes if kind=='native-uuid' else bytes.fromhex(v) if kind=='bytes16' else v for k,v in row.items()}
 def to_tokens(row):
  return {k:None if v is None else {n:str(w) for n,w in v.items()} if isinstance(v,dict) else v.bytes.hex() if isinstance(v,uuid.UUID) else v.hex() if isinstance(v,bytes) else str(v) for k,v in row.items()}
 def raw_bits(v):
  if v is None:return None
  if isinstance(v,dict):
   high=next(value for name,value in v.items() if name.endswith('_hi'));low=next(value for name,value in v.items() if name.endswith('_lo'));return ((int(high)%(2**64))*(2**64)+int(low)%(2**64)).to_bytes(16,'big').hex()
  if isinstance(v,uuid.UUID):return v.hex
  if isinstance(v,bytes):return v.hex()
  return uuid.UUID(str(v)).hex if case['domain']=='uuid' else str(v)
 def independent_check(value,index):
  id_name='id_hi__pair' if kind=='words64' else 'id';parent_name='parent_hi__pair' if kind=='words64' else 'parent'
  assert raw_bits(value[id_name])==vectors[index%len(vectors)]['hex']
  assert raw_bits(value[parent_name])==(None if index==len(vectors) else vectors[(index+1)%len(vectors)]['hex'])
 native_rows=list(map(to_native,case['rows']));checks=0
 with warnings.catch_warnings(record=True) as caught:
  warnings.simplefilter('always')
  if system=='avro':
   text=json.dumps(schema);(archive/(system+'-'+case['domain']+'-'+kind+suffix+'.avsc')).write_text(text+'\n');apache=avro.schema.parse(text);fast=fastavro.parse_schema(schema)
   # Every Record in the bundle, including empty parent populations, parses independently.
   for record in bundle['records']:avro.schema.parse(json.dumps(record));fastavro.parse_schema(record)
   for engine in ['apache','fastavro']:
    decoded=[]
    for row in native_rows:
     stream=io.BytesIO()
     if engine=='apache':avro.io.DatumWriter(apache).write(row,avro.io.BinaryEncoder(stream));stream.seek(0);value=avro.io.DatumReader(apache).read(avro.io.BinaryDecoder(stream))
     else:fastavro.schemaless_writer(stream,fast,row);stream.seek(0);value=fastavro.schemaless_reader(stream,fast)
     independent_check(value,len(decoded));tokens=to_tokens(value)
     # native UUID tokens use hex on fixed16, then driver boundary restores canonical text.
     if kind in ('native-uuid','uuid-text'):tokens={k:None if v is None else str(uuid.UUID(hex=v)) for k,v in tokens.items()}
     assert tokens==case['rows'][len(decoded)],(system,kind,engine,tokens)
     decoded.append(tokens);checks+=1
    if kind=='words64':
     bad={**native_rows[-1], 'parent_hi__pair':{'parent_hi':0,'parent_lo':None}}
     try:
      if engine=='apache':avro.io.DatumWriter(apache).write(bad,avro.io.BinaryEncoder(io.BytesIO()))
      else:fastavro.schemaless_writer(io.BytesIO(),fast,bad)
     except Exception:checks+=1
     else:raise AssertionError('partial pair accepted by native writer')
    returned.append({**same_case,'engine':engine,'rows':decoded})
   native_schema=str(apache)
  else:
   def arrow_field(col):
    if 'children' in col:typ=pa.struct([arrow_field(c) for c in col['children']])
    elif col['physicalType']=='INT64':typ=pa.int64() if col['isSigned'] else pa.uint64()
    elif col['logicalType']=='UUID':typ=pa.uuid()
    elif col['physicalType']=='FIXED_LEN_BYTE_ARRAY':typ=pa.binary(col['length'])
    else:typ=pa.string()
    return pa.field(col['name'],typ,nullable=col['nullable'])
   arrow_schema=pa.schema([arrow_field(c) for c in schema['columns']]);table=pa.Table.from_pylist(native_rows,schema=arrow_schema)
   with tempfile.TemporaryDirectory(prefix='umf128-model-') as temp:
    path=Path(temp)/'values.parquet';pq.write_table(table,path);stored=pq.read_table(path);meta=pq.read_metadata(path)
    assert stored.schema==arrow_schema
    decoded=[]
    for value in stored.to_pylist():
     independent_check(value,len(decoded));tokens=to_tokens(value)
     if kind in ('native-uuid','uuid-text'):tokens={k:None if v is None else str(uuid.UUID(hex=v)) for k,v in tokens.items()}
     assert tokens==case['rows'][len(decoded)],(kind,tokens)
     decoded.append(tokens);checks+=1
    native_schema=str(meta.schema)
    (archive/(system+'-'+case['domain']+'-'+kind+suffix+'.parquet')).write_bytes(path.read_bytes())
    if kind=='words64':
     assert 'optional group' in native_schema and 'required int64' in native_schema
     bad={**native_rows[-1], 'parent_hi__pair':{'parent_hi':0,'parent_lo':None}}
     try:pq.write_table(pa.Table.from_pylist([bad],schema=arrow_schema),Path(temp)/'bad.parquet')
     except Exception:checks+=1
     else:raise AssertionError('native Parquet writer accepted null required half')
   returned.append({**same_case,'engine':'pyarrow','rows':decoded})
  observations.append({**same_case,'checks':checks,'independentOracleFields':True,'nativeSchema':native_schema,'warnings':sorted(set(str(w.message) for w in caught))})
result={'scope':'uuid-model1 actual multi-field native Avro/Parquet data, nullable pair group and malformed pair refusal; file formats do not enforce Keys/FK/indexes','versions':{'avro':avro.__version__,'fastavro':fastavro.__version__,'pyarrow':pa.__version__,'python':sys.version},'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'observations':observations}
Path('fixtures/validation/uuid/file-model-native.json').write_text(json.dumps(result,indent=2)+'\n')
Path('fixtures/validation/uuid/file-model-returned.json').write_text(json.dumps({'cases':returned})+'\n')
print({'cases':len(observations),'checks':sum(o['checks'] for o in observations)})
