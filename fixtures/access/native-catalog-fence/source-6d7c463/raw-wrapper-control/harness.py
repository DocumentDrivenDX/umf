import json,hashlib
from pathlib import Path
from umf_access.reviewed import ReviewedSQL, ReadBuildError
from umf_access.types import StrictModel
class Empty(StrictModel):pass
class Identifier(StrictModel):id:str
class Terms(StrictModel):terms:str
class Row(StrictModel):
 id:str
 status:str
class OriginalResponse:
 def __init__(self,response,request):self.response,self.request=response,dict(request,keyset=request.get('keyset',False))
 def compile_raw_read_json(self,submitted):
  assert json.loads(submitted)==self.request
  return self.response
HERE=Path(__file__).resolve().parent
old=json.loads((HERE/'original-0.1.json').read_text())
new=json.loads((HERE.parent/'bulk.json').read_text())['readTemplate']
results=[]
old_request=json.loads((HERE/'original-0.1-request.json').read_text())
new_request=json.loads((HERE.parent/'bulk-request.json').read_text())['selection']
for raw,request,params,result in [(old,old_request,Empty,Identifier),(new,new_request,Terms,Row)]:
 read=ReviewedSQL(request['sql'],params,result,row_cap=request['rowCap'])
 try:
  catalog=read.build(OriginalResponse(json.dumps(raw),request),target='postgresql18',binding=raw['binding'])
  wrapped=json.loads(catalog.artifact_json);digest=wrapped.pop('catalogDigest')
  assert digest==hashlib.sha256(json.dumps(wrapped,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
  assert wrapped['stageOne'] is None
  accepted=catalog.artifact()
  results.append({'version':raw['version'],'status':'accepted','catalogDigestValid':True})
 except ReadBuildError as error:
  results.append({'version':raw['version'],'status':'refused','code':str(error),'wrapperConstruction':'old ReviewedSQL.build','stageOne':None,'businessSQLCalls':0})
assert results[0]['status']=='accepted' and results[1]['code']=='unsupported catalog artifact'
receipt={'scope':'Actual original producer responses via immutable R24 ReviewedSQL.build; standalone reviewed models use valid stageOne=None. No connection or execution.','results':results}
print(json.dumps(receipt,indent=2))
