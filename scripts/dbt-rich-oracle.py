import json,hashlib
from pathlib import Path
from collections import Counter
from dbt.artifacts.schemas.manifest.v12.manifest import WritableManifest
from jsonschema import Draft202012Validator
base=Path('fixtures/dbt/rich');source=json.loads((base/'manifest.json').read_text());report=json.loads((base/'results.json').read_text());native=WritableManifest.from_dict(source).to_dict();validator=Draft202012Validator(json.loads(Path('native/dbt/sources/manifest-v12.json').read_text()))
assert not list(validator.iter_errors(source))
def replace(root,path,value):
 parts=[s.replace('~1','/').replace('~0','~') for s in path.split('/')[1:]];node=root
 for p in parts[:-1]:node=node[int(p)] if isinstance(node,list) else node[p]
 node[int(parts[-1]) if isinstance(node,list) else parts[-1]]=value
results=[]
for f in ['json','yaml']:
 raw=json.loads((base/f'roundtrip.{f}.json').read_text());assert raw==source and WritableManifest.from_dict(raw).to_dict()==native
 for edit in report['edits']:
  path=base/f"{edit['id']}.{f}.json";edited=json.loads(path.read_text());assert not list(validator.iter_errors(edited));expected=json.loads(json.dumps(source));replace(expected,edit['path'],edit['value']);assert edited==expected
  expected_native=json.loads(json.dumps(native));replace(expected_native,edit['path'],edit['value']);assert WritableManifest.from_dict(edited).to_dict()==expected_native
  results.append({'id':edit['id'],'format':f,'nativeSchemaValid':True,'nativeParserEqual':True,'onlyRequestedValueChanged':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
runs=json.loads((base/'build-run-results.json').read_text())['results'];statuses=dict(Counter(r['status'] for r in runs));assert len(runs)==13 and statuses=={'success':6,'pass':5,'no-op':2}
(base/'oracle-results.json').write_text(json.dumps({'runtime':'dbt Core 1.10.0 WritableManifest; jsonschema 4.25.1 without format checker','sourceSha256':report['sourceSha256'],'buildStatuses':statuses,'sourceFormats':2,'results':results,'limits':'Exposure/saved query are no-ops; semantic metric execution is not tested'},indent=2)+'\n');print({'sourceFormats':2,'nativeEdits':len(results),'buildStatuses':statuses})
