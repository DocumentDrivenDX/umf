import copy,hashlib,json,runpy,tempfile
from pathlib import Path
import tablespec.models.umf as models
captured=Path('native/tablespec/sources/src/tablespec/models/umf.py');assert Path(models.__file__).read_bytes()==captured.read_bytes()
loader=Path('native/tablespec/sources/src/tablespec/umf_loader.py');Loader=runpy.run_path(str(loader))['UMFLoader']
fixture=Path('fixtures/tablespec/table-edits.json')
def load(value):
 if 'text' in value:result=models.UMF.model_validate(json.loads(value['text'])).model_dump(mode='json')
 else:
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   for name,text in value['files'].items():
    path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
   result=Loader()._load_column_centric(root).model_dump(mode='json')
 result.pop('mtime',None);return result
cases=[];rejections=[];opaque=[]
for case in json.loads(fixture.read_text())['cases']:
 try:original=load(case['input'])
 except Exception as error:
  assert 'Extra inputs are not permitted' in str(error)
  for output in case['exports']:
   rejected=None
   try:load(output)
   except Exception as changed_error:rejected=str(changed_error)
   assert rejected and 'Extra inputs are not permitted' in rejected
   opaque.append({'mode':case['mode'],'format':output['format'],'accepted':False,'reason':'Unknown native table field retained; pinned model rejects extra input.'})
  continue
 expected=copy.deepcopy(original)
 expected['table_name']='renamed_orders';expected['description']="Edited customer's orders — 注文";expected['primary_key']=['order_id'];expected['context_column']='tenant';expected['columns'][0]['name']='order_id';expected['columns'][1]['name']='tenant'
 rejected=None
 try:load(case['unrepaired'])
 except Exception as error:rejected=str(error)
 assert rejected and "Primary key column 'id' not found" in rejected
 for output in case['exports']:
  actual=load(output);assert actual==expected
  cases.append({'mode':case['mode'],'format':output['format'],'nativeModelMatchesExplicitEdits':True,'columns':[c['name'] for c in actual['columns']],'primaryKey':actual['primary_key'],'contextColumn':actual['context_column']})
 rejections.append({'mode':case['mode'],'error':rejected})
assert len(cases)==4 and len(rejections)==2 and len(opaque)==4
report={'sourceSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'modelSha256':hashlib.sha256(captured.read_bytes()).hexdigest(),'loaderSha256':hashlib.sha256(loader.read_bytes()).hexdigest(),'cases':cases,'unrepairedCandidatesRejected':2,'rejections':rejections,'opaqueFieldRejections':opaque,'scope':'Pinned native model/loader validates explicit table and column edits. Unknown table fields are preserved by UMF and still rejected natively; native normalization is not used as recovered source.'}
Path('fixtures/tablespec/table-edits-oracle.json').write_text(json.dumps(report,indent=2)+'\n');print({'nativeComparisons':len(cases),'unrepairedCandidatesRejected':2})
