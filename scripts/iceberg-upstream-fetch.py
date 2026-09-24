import json,hashlib,urllib.request
from pathlib import Path
commit='6976e020b894f6a6777704df2b8c4458cb291ae9';base=Path('fixtures/iceberg/upstream');base.mkdir(parents=True,exist_ok=True)
tree=json.load(urllib.request.urlopen(f'https://api.github.com/repos/apache/iceberg/git/trees/{commit}?recursive=1'))
paths=[x['path'] for x in tree['tree'] if x['path'].startswith('core/src/test/resources/') and x['path'].endswith('.json')]+['LICENSE','NOTICE'];files=[];schemas=[]
for path in paths:
 url=f'https://raw.githubusercontent.com/apache/iceberg/{commit}/{path}';raw=urllib.request.urlopen(url).read();target=base/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);files.append({'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'source':url})
 if path.endswith('.json'):
  v=json.loads(raw)
  if isinstance(v.get('schema'),dict):schemas.append({'id':'schema-'+str(len(schemas)),'path':path,'pointer':'/schema'})
  if isinstance(v.get('schemas'),list):
   for i,s in enumerate(v['schemas']):schemas.append({'id':'schema-'+str(len(schemas)),'path':path,'pointer':'/schemas/'+str(i)})
for c in schemas:
 value=json.loads((base/c['path']).read_bytes())
 for key in c['pointer'].strip('/').split('/'):value=value[int(key)] if isinstance(value,list) else value[key]
 c['canonicalSchemaSha256']=hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
(base/'manifest.json').write_text(json.dumps({'system':'Apache Iceberg','version':'1.11.0','commit':commit,'files':files,'schemas':schemas,'distinctSchemaCount':len({c['canonicalSchemaSha256'] for c in schemas})},indent=2)+'\n');print({'files':len(files),'schemas':len(schemas)})
