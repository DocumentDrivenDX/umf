import json,avro,avro.schema
from pathlib import Path
assert avro.__version__=='1.12.0'
rows=json.loads(Path('fixtures/validation/avro-record-type-corpus.json').read_text())['rows'];accepted=0;blocked=0
for row in rows:
 names=avro.schema.Names();roots=[]
 for d in row['dependencies']:roots.append(avro.schema.make_avsc_object(json.loads(d['schema']),names))
 roots.append(avro.schema.make_avsc_object(json.loads(row['schema']),names));seen=set();fields={}
 def visit(s):
  if id(s) in seen:return
  seen.add(id(s))
  if isinstance(s,avro.schema.RecordSchema):
   for f in s.fields:fields[(s.fullname,f.name)]=f.type;visit(f.type)
  elif isinstance(s,avro.schema.UnionSchema):
   for b in s.schemas:visit(b)
  elif isinstance(s,avro.schema.ArraySchema):visit(s.items)
  elif isinstance(s,avro.schema.MapSchema):visit(s.values)
 for root in roots:visit(root)
 for field in row['fields']:
  native=fields[(field['record'],field['name'])];result=field['result'];direct=isinstance(native,avro.schema.RecordSchema)
  assert (result['status']=='classified')==direct
  if not direct:blocked+=1;continue
  accepted+=1;module=result['target']['modules'][-1];record=module['elements'][0]
  assert (module['namespace']+'.' if module['namespace'] else '')+record['name']==native.fullname
  assert [next(e['name'] for m in result['target']['modules'] if m['id']==r['module'] for e in m['elements'] if e['id']==r['element']) for r in record['references']]==[f.name for f in native.fields]
out={'runtime':'Apache Avro '+avro.__version__,'bundles':len(rows),'directRecords':accepted,'nonDirectTypes':blocked,'scope':'Qualified native record-type resolution and ordered members; no value-domain equivalence'}
Path('fixtures/validation/avro-record-type-native.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
