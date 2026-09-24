import json,copy
from pathlib import Path
from pyiceberg.schema import Schema
base=Path('fixtures/iceberg/upstream');results=[]
for c in json.load(open(base/'results.json'))['results']:
 original=json.load(open(base/c['path']))
 for token in c['pointer'].strip('/').split('/'):
  original=original[int(token)] if isinstance(original,list) else original[token.replace('~1','/').replace('~0','~')]
 assert json.load(open(base/'extracted'/(c['id']+'.json')))==original
 try:expected=Schema.model_validate(original).model_dump_json(by_alias=True);accepted=True;error=None
 except Exception as e:expected=None;accepted=False;error=str(e)
 r={'id':c['id'],'status':c['status'],'nativeAccepted':accepted,'nativeError':error}
 if c['status']=='roundtripped':
  for format in ['json','yaml']:
   text=(base/'roundtrip'/(c['id']+'.'+format+'.json')).read_text();assert json.loads(text)==original,c['id']
   try:actual=Schema.model_validate_json(text).model_dump_json(by_alias=True);outputAccepted=True
   except Exception:actual=None;outputAccepted=False
   assert outputAccepted==accepted and actual==expected,c['id']
  r['formatsAgree']=2
  if c.get('edit'):
   edited=json.load(open(base/'edited'/(c['id']+'.json')));expectedEdit=copy.deepcopy(original);expectedEdit['fields'][0]['name']=c['edit']['to'];assert edited==expectedEdit
   model=Schema.model_validate(edited);before=Schema.model_validate(original);assert model.find_field(c['edit']['fieldId']).name==c['edit']['to'] and before.field_ids==model.field_ids and before.identifier_field_ids==model.identifier_field_ids;r['editVerified']=True
 results.append(r)
report={'runtime':'PyIceberg 0.11.0','schemaFragmentsOnly':True,'results':results};(base/'oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print({'schemas':len(results),'nativeAccepted':sum(r['nativeAccepted'] for r in results),'roundtrips':sum(r.get('formatsAgree',0) for r in results),'rejections':[(r['id'],r['nativeAccepted']) for r in results if r['status']=='rejected']})
