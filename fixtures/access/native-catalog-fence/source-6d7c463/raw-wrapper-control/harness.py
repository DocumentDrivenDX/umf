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
 def __init__(self,response):self.response=response
 def compile_raw_read_json(self,submitted):return self.response
old=json.loads(Path('/private/tmp/weft-combined-sdk-local-r19/source-exact-drift.json').read_text())
new=json.loads(Path('/private/tmp/weft-native-fence-source-packets/bulk.json').read_text())['readTemplate']
results=[]
old_request=json.loads(Path('/private/tmp/weft-sdk-prefix-20261016/tests/raw-read/postgresql-source-exact-drift-request.json').read_text())
new_request=json.loads(Path('/private/tmp/weft-native-fence-source-packets/bulk-request.json').read_text())['selection']
for raw,request,params,result in [(old,old_request,Empty,Identifier),(new,new_request,Terms,Row)]:
 read=ReviewedSQL(request['sql'],params,result,row_cap=request['rowCap'])
 try:
  catalog=read.build(OriginalResponse(json.dumps(raw)),target='postgresql18',binding=raw['binding'])
  accepted=catalog.artifact()
  results.append({'version':raw['version'],'status':'accepted','catalogDigestValid':True})
 except ReadBuildError as error:
  results.append({'version':raw['version'],'status':'refused','code':str(error),'wrapperConstruction':'old ReviewedSQL.build','stageOne':None,'businessSQLCalls':0})
assert results[0]['status']=='accepted' and results[1]['code']=='unsupported catalog artifact'
receipt={'scope':'Actual original producer responses via immutable R24 ReviewedSQL.build; standalone reviewed models use valid stageOne=None. No connection or execution.','results':results}
Path('/private/tmp/sdk-old-r24-raw-fence-wrapper-control.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
