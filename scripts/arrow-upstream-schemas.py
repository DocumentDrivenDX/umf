"""Extract schema portions; retain original compressed integration inputs separately."""
import gzip,json
from pathlib import Path
base=Path('fixtures/arrow/upstream');out=base/'schemas';out.mkdir(exist_ok=True);results=[]
def unique(pairs):
 result={}
 for key,value in pairs:
  if key in result:raise ValueError('Duplicate JSON object key '+key)
  result[key]=value
 return result
def exact_schema(value):
 if isinstance(value,float):raise ValueError('Unexpected schema float requires exact-token extraction')
 if isinstance(value,list):
  for child in value:exact_schema(child)
 if isinstance(value,dict):
  for child in value.values():exact_schema(child)
for case in json.loads((base/'manifest.json').read_text())['files']:
 if case['path'].endswith('.json.gz'):
  value=json.loads(gzip.decompress((base/case['path']).read_bytes()),object_pairs_hook=unique);exact_schema(value['schema'])
  schema=json.dumps(value['schema'],ensure_ascii=False,separators=(',',':'));file=out/(case['path']+'.schema.json');file.parent.mkdir(parents=True,exist_ok=True);file.write_text(schema+'\n');results.append({'source':case['path'],'schema':str(file.relative_to(base))})
(base/'schema-manifest.json').write_text(json.dumps({'cases':results},indent=2)+'\n');print({'schemaJSON':len(results)})
