import json
from pathlib import Path
from pyiceberg.schema import Schema
base=Path('fixtures/iceberg');m=json.load(open(base/'manifest.json'));results=[]
for c in m['cases']:
 if not c['umfValid']:continue
 raw=Path(c['path']).read_text()
 for format in ['json','yaml']:
  text=(base/(c['id']+'.'+format+'.roundtrip.json')).read_text();assert json.loads(text)==json.loads(raw),c['id']
  try:output=Schema.model_validate_json(text).model_dump_json(by_alias=True);accepted=True
  except Exception:output=None;accepted=False
  assert accepted==c['nativeAccepted'],c['id']
  if accepted:assert output==c['nativeOutput'],c['id']
 results.append({'id':c['id'],'nativeAccepted':c['nativeAccepted'],'formats':2})
a=Schema.model_validate_json((base/'nested.json').read_text());b=Schema.model_validate_json((base/'edited.json').read_text());assert b.find_field(3).name=='renamed' and a.find_field(3).name=='a.b';assert a.identifier_field_ids==b.identifier_field_ids and a.field_ids==b.field_ids
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyIceberg 0.11.0','results':results,'edit':{'fieldId':3,'identifiersAndFieldIdsPreserved':True}},indent=2)+'\n');print({'roundtrips':len(results)*2,'nativeAccepted':sum(r['nativeAccepted'] for r in results),'editVerified':True})
