import base64,copy,hashlib,importlib.util,json,sys
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
spec=importlib.util.spec_from_file_location('footer_oracle','scripts/parquet-footer-oracle.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=Path(sys.argv[1] if len(sys.argv)>1 else 'fixtures/parquet/arrow-rename');fixture=base/'results.json';results=[]
def wire(raw):
 length=int.from_bytes(raw[-8:-4],'little');return m.read(m.TCompactProtocol(m.TMemoryBuffer(raw[-8-length:-8])),m.T.STRUCT)
def field(node,index):return next(f['value'] for f in node['fields'] if f['id']==index)
def arrow_value(node):return field(next(k for k in field(node,5)['items'] if bytes.fromhex(field(k,1)['hex'])==b'ARROW:schema'),2)
def normalize(v):
 if isinstance(v,list):return [normalize(x) for x in v]
 if isinstance(v,dict):return {k:normalize(sorted(x,key=lambda f:f['id']) if k=='fields' and v.get('kind')=='struct' else x) for k,x in v.items()}
 return v
def schema_signature(schema):
 def f(field):
  typ=field.type;children=[f(typ.field(i)) for i in range(typ.num_fields)]
  return {'name':field.name,'nullable':field.nullable,'metadata':field.metadata,'type':typ.id,'scalar':str(typ) if not children else None,'keysSorted':typ.keys_sorted if pa.types.is_map(typ) else None,'listSize':typ.list_size if pa.types.is_fixed_size_list(typ) else None,'children':children}
 return {'metadata':schema.metadata,'fields':[f(field) for field in schema]}
def renamed_signature(schema,path,name):
 result=schema_signature(schema);fields=result['fields']
 for index in path:field=fields[index];fields=field['children']
 field['name']=name
 return result
def values(v):
 if isinstance(v,dict):return [values(x) for x in v.values()]
 if isinstance(v,(list,tuple)):return [values(x) for x in v]
 return v
for case in json.loads(fixture.read_text())['cases']:
 old=Path(case['path']).read_bytes();new=Path(case['outputPath']).read_bytes();restored=Path(case['restoredPath']).read_bytes();policy=case['policy'];offset=case['result']['unchangedPrefixBytes']
 assert hashlib.sha256(new).hexdigest()==case['sha256'];assert hashlib.sha256(restored).hexdigest()==case['restoredSha256'];assert old[:offset]==new[:offset]==restored[:offset]
 expected=wire(old);actual=wire(new);schema=field(expected,2)['items'];field(schema[policy['parquetIndex']],4)['hex']=policy.get('parquetName',policy['name']).encode().hex()
 cursor=0;paths=[]
 def walk(path):
  global cursor
  n=schema[cursor];cursor+=1;fields={f['id']:f['value'] for f in n['fields']};path=path+([bytes.fromhex(fields[4]['hex']).decode()] if cursor>1 else [])
  if 1 in fields:paths.append(path)
  else:
   for _ in range(int(fields[5]['value'])):walk(path)
 walk([])
 for group in field(expected,4)['items']:
  for i,column in enumerate(field(group,1)['items']):field(field(column,3),3)['items']=[{'kind':'binary','hex':p.encode().hex()} for p in paths[i]]
 arrow_value(expected)['hex']=arrow_value(actual)['hex'];assert normalize(expected)==normalize(actual)
 expected_back=wire(old);actual_back=wire(restored);arrow_value(expected_back)['hex']=arrow_value(actual_back)['hex'];assert normalize(expected_back)==normalize(actual_back)
 before=pq.ParquetFile(case['path'],page_checksum_verification=True);after=pq.ParquetFile(case['outputPath'],page_checksum_verification=True);back=pq.ParquetFile(case['restoredPath'],page_checksum_verification=True)
 assert schema_signature(after.schema_arrow)==renamed_signature(before.schema_arrow,policy['arrowFieldPath'],policy.get('parquetName',policy['name'])), case['id']
 assert values(before.read().to_pylist())==values(after.read().to_pylist());assert before.read().equals(back.read(),check_metadata=True)
 embedded=lambda f:pa.ipc.read_schema(pa.BufferReader(base64.b64decode(f.metadata.metadata[b'ARROW:schema'])))
 assert schema_signature(embedded(after))==renamed_signature(embedded(before),policy['arrowFieldPath'],policy['name']), case['id']
 assert embedded(back).equals(embedded(before),check_metadata=True)
 results.append({'id':case['id'],'rows':after.metadata.num_rows,'rowGroups':after.metadata.num_row_groups,'wireChangesExact':True,'schemaAndMetadataEqual':True,'valuesEqualIgnoringRenamedKeys':True,'inverseSchemaAndValuesEqual':True,'pageChecksumsVerified':True})
output={'runtime':'PyArrow 21.0.0 + Apache Thrift 0.22.0','sourceSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'results':results,'scope':'Explicit structural field edits; uninterpreted metadata references preserved, not rewritten. No general type-equivalence claim.'}
(base/'oracle.json').write_text(json.dumps(output,indent=2)+'\n');print({'transformed':len(results),'rows':sum(r['rows'] for r in results)})
