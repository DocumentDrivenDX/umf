import json
from pathlib import Path
from pyiceberg.table.metadata import TableMetadataUtil
base=Path('fixtures/iceberg/table');results=[]
def native(text):
 try:model=TableMetadataUtil.parse_raw(text)
 except Exception as e:return {'parseAccepted':False,'exportAccepted':False,'output':None,'error':str(e)}
 try:return {'parseAccepted':True,'exportAccepted':True,'output':model.model_dump_json(by_alias=True),'error':None}
 except Exception as e:return {'parseAccepted':True,'exportAccepted':False,'output':None,'error':str(e)}
def comparable(r):return (r['parseAccepted'],r['exportAccepted'],r['output'])
for c in json.load(open(base/'results.json'))['results']:
 raw=Path(c['path']).read_text();expected=native(raw);r={'id':c['id'],'umf':c['status'],'nativeAccepted':expected['parseAccepted'],'nativeExported':expected['exportAccepted'],'nativeError':expected['error']}
 if c['status']=='roundtripped':
  for f in ['json','yaml']:
   text=(base/(c['id']+'.'+f+'.json')).read_text();assert json.loads(text)==json.loads(raw);assert comparable(native(text))==comparable(expected),c['id']
  r['formatsAgree']=2;r['nativeReemissionCompared']=expected['exportAccepted'];edited=(base/(c['id']+'.edited.json')).read_text();input=json.loads(raw);input['location']='s3://umf-fixture/relocated/'+c['id'];assert json.loads(edited)==input;actual=native(edited);assert comparable(actual)==comparable(native(json.dumps(input)));r['editNativeParsed']=actual['parseAccepted'];r['editNativeExported']=actual['exportAccepted']
 results.append(r)
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyIceberg 0.11.0','results':results},indent=2)+'\n');print({'files':len(results),'nativeParsed':sum(r['nativeAccepted'] for r in results),'nativeExported':sum(r['nativeExported'] for r in results),'roundtrips':sum(r.get('formatsAgree',0) for r in results)})
