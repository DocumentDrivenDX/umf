import json,avro,avro.schema
from pathlib import Path
assert avro.__version__=='1.12.0'
rows=json.loads(Path('fixtures/validation/field-avro-corpus.json').read_text())['rows'];checks=[]
for row in rows:
 names=avro.schema.Names();roots=[]
 for d in row['dependencies']:roots.append(avro.schema.make_avsc_object(json.loads(d['schema']),names))
 roots.append(avro.schema.make_avsc_object(json.loads(row['schema']),names));seen=set();fields=[];records=[]
 def visit(s):
  if id(s) in seen:return
  seen.add(id(s))
  if isinstance(s,avro.schema.RecordSchema):
   records.append([s.fullname,[f.name for f in s.fields]])
   for f in s.fields:fields.append([s.fullname,f.name]);visit(f.type)
  elif isinstance(s,avro.schema.UnionSchema):
   for b in s.schemas:visit(b)
  elif isinstance(s,avro.schema.ArraySchema):visit(s.items)
  elif isinstance(s,avro.schema.MapSchema):visit(s.values)
 for root in roots:visit(root)
 assert fields==[[f['record'],f['name']] for f in row['fields']],(row['id'],fields)
 assert records==[[r['fullname'],[next(e['name'] for m in r['result']['target']['modules'] if m['id']==ref['module'] for e in m['elements'] if e['id']==ref['element']) for ref in r['result']['target']['modules'][-1]['elements'][0]['references']]] for r in row['records']]
 checks.append({'id':row['id'],'fields':fields,'records':records})
Path('fixtures/validation/field-avro-native.json').write_text(json.dumps({'version':avro.__version__,'scope':'Independent Apache Avro declared field membership; unknown logical meanings remain uninterpreted','checks':checks},indent=2)+'\n')
print(json.dumps({'schemas':len(checks),'fields':sum(len(c['fields']) for c in checks),'records':sum(len(c['records']) for c in checks)}))
