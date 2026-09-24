import json,struct,hashlib,importlib.util,copy
from pathlib import Path
import pyarrow.parquet as pq
spec=importlib.util.spec_from_file_location('footer_oracle','scripts/parquet-footer-oracle.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
base=Path('fixtures/parquet/rename');manifest=json.loads((base/'results.json').read_text());results=[]
def wire(raw):
 length=int.from_bytes(raw[-8:-4],'little');return module.read(module.TCompactProtocol(module.TMemoryBuffer(raw[-8-length:-8])),module.T.STRUCT)
def field(v,id):return next(f['value'] for f in v['fields'] if f['id']==id)
def without_names(v):
 if isinstance(v,dict):return [without_names(x) for x in v.values()]
 if isinstance(v,(list,tuple)):return [without_names(x) for x in v]
 return v
for c in manifest['results']:
 if c['status']!='transformed':continue
 original=Path(c['path']).read_bytes();output=(base/'exports'/(c['id']+'.parquet')).read_bytes();assert hashlib.sha256(output).hexdigest()==c['sha256'];assert original[:c['unchangedPrefixBytes']]==output[:c['unchangedPrefixBytes']]
 old=wire(original);new=wire(output);expected=copy.deepcopy(old);schema=field(expected,2)['items'];field(schema[c['index']],4)['hex']=c['name'].encode().hex()
 # Derive complete component paths independently from the native preorder schema.
 ordinal=0;cursor=0;paths=[]
 def walk(path):
  global cursor
  n=schema[cursor];cursor+=1;fields={f['id']:f['value'] for f in n['fields']};name=bytes.fromhex(fields[4]['hex']).decode();path=path+([name] if cursor>1 else [])
  if 1 in fields:paths.append(path)
  else:
   for _ in range(int(fields[5]['value'])):walk(path)
 walk([])
 for group in field(expected,4)['items']:
  for ordinal,column in enumerate(field(group,1)['items']):field(field(column,3),3)['items']=[{'kind':'binary','hex':s.encode().hex()} for s in paths[ordinal]]
 restored=(base/'restored'/(c['id']+'.parquet')).read_bytes();assert hashlib.sha256(restored).hexdigest()==c['roundtripSha256'];assert wire(restored)==old
 assert expected==new # No changes to field IDs, annotations, statistics, offsets, indexes or other metadata.
 before=pq.ParquetFile(c['path'],page_checksum_verification=True);after=pq.ParquetFile(base/'exports'/(c['id']+'.parquet'),page_checksum_verification=True)
 assert before.read().equals(pq.ParquetFile(base/'restored'/(c['id']+'.parquet'),page_checksum_verification=True).read(),check_metadata=True)
 assert without_names(before.read().to_pylist())==without_names(after.read().to_pylist())
 assert before.schema.names==after.schema.names or any(c['index']==i for i,e in enumerate(schema) if any(f['id']==1 for f in e['fields']))
 for i,path in enumerate(paths):
  a=before.schema.column(i);b=after.schema.column(i);assert b.path=='.'.join(path)
  for key in ['physical_type','max_definition_level','max_repetition_level','length','precision','scale']:assert getattr(a,key)==getattr(b,key)
  assert str(a.logical_type)==str(b.logical_type)
 results.append({'id':c['id'],'rows':after.metadata.num_rows,'rowGroups':after.metadata.num_row_groups,'wireChangesExact':True,'inverseSchemaAndValuesEqual':True,'valuesEqualIgnoringRenamedKeys':True,'pageChecksumsVerified':True})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 + Apache Thrift 0.22.0','transformed':len(results),'rows':sum(r['rows'] for r in results),'results':results},indent=2)+'\n');print({'transformed':len(results),'rows':sum(r['rows'] for r in results)})
