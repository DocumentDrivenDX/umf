"""Native metadata-only loading is evidence, not proof of mapping validity or data read support."""
import json,tempfile,copy,sys
from pathlib import Path
from deltalake import DeltaTable
base=Path('fixtures/delta/mapping');base.mkdir(exist_ok=True)
protocol=Path('native/delta/sources/PROTOCOL.md').read_text();section=protocol.split('# Column Mapping\n')[1];field=json.loads(section.split('```json')[1].split('```')[0]);schema={'type':'struct','fields':[field]}
metadata={'id':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','format':{'provider':'parquet','options':{}},'schemaString':json.dumps(schema),'partitionColumns':[],'configuration':{'delta.columnMapping.mode':'name','delta.columnMapping.maxColumnId':'5'}}
cases=[]
for mode in ['name','id']:
 for features in [False,True]:
  m=copy.deepcopy(metadata);m['configuration']['delta.columnMapping.mode']=mode;p={'minReaderVersion':3,'minWriterVersion':7,'readerFeatures':['columnMapping'],'writerFeatures':['columnMapping']} if features else {'minReaderVersion':2,'minWriterVersion':5}
  cases.append({'id':mode+('-features' if features else '-legacy'),'input':{'protocol':p,'metaData':m}})
for name in ['duplicate-id','missing-physical','max-below','unsupported-protocol']:
 c=copy.deepcopy(cases[0]);c['id']=name
 if name=='max-below':c['input']['metaData']['configuration']['delta.columnMapping.maxColumnId']='3'
 elif name=='unsupported-protocol':c['input']['protocol']={'minReaderVersion':1,'minWriterVersion':2}
 else:
  s=json.loads(c['input']['metaData']['schemaString']);nested=s['fields'][0]['type']['elementType']['fields'][0]['metadata']
  if name=='duplicate-id':nested['delta.columnMapping.id']=4
  else:del nested['delta.columnMapping.physicalName']
  c['input']['metaData']['schemaString']=json.dumps(s)
 cases.append(c)
rows=[]
with tempfile.TemporaryDirectory(prefix='umf-mapping-') as tmp:
 for c in cases:
  value=c['input']
  if '--verify' in sys.argv:
   value=json.loads((base/(c['id']+'.exported.json')).read_text());assert value==c['input']
  text=json.dumps(c['input'],separators=(',',':'));(base/(c['id']+'.json')).write_text(text);log=Path(tmp)/c['id']/'_delta_log';log.mkdir(parents=True);(log/'00000000000000000000.json').write_text(json.dumps({'protocol':value['protocol']})+'\n'+json.dumps({'metaData':value['metaData']})+'\n');row={'id':c['id']}
  try:
   table=DeltaTable(log.parent);row.update(status='accepted',schema=json.loads(table.schema().to_json()))
  except Exception as e:row.update(status='rejected',errorType=type(e).__name__,message=str(e))
  rows.append(row)
assert [r['id'] for r in rows if r['status']=='rejected']==['duplicate-id','missing-physical']
(base/'cases.json').write_text(json.dumps(cases,indent=2)+'\n');(base/'native-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4','results':rows},indent=2)+'\n');print([(r['id'],r['status']) for r in rows])

if '--verify' in sys.argv:(base/'oracle-results.json').write_text(json.dumps({'contexts':8,'accepted':6,'rejected':2,'runtime':'deltalake 1.6.4'},indent=2)+'\n')
