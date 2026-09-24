import json,hashlib
from pathlib import Path
from dbt.artifacts.schemas.freshness.v3.freshness import FreshnessExecutionResultArtifact
from jsonschema import Draft202012Validator
base=Path('fixtures/dbt/freshness');cases=json.loads((base/'results.json').read_text())['results'];validator=Draft202012Validator(json.loads(Path('native/dbt/sources/sources-v3.json').read_text()));results=[]
for c in cases:
 source=json.loads((base/(c['id']+'.json')).read_text());assert not list(validator.iter_errors(source));native=FreshnessExecutionResultArtifact.from_dict(source).to_dict()
 def change(v):
  parts=c['path'].split('/')[1:];node=v
  for p in parts[:-1]:node=node[int(p)] if isinstance(node,list) else node[p]
  node[parts[-1]]=c['value']
 expected=json.loads(json.dumps(source));change(expected);expected_native=json.loads(json.dumps(native));change(expected_native)
 for f in ['json','yaml']:
  raw_path=base/f"{c['id']}.{f}.json";edit_path=base/f"{c['id']}.edited.{f}.json";raw=json.loads(raw_path.read_text());edited=json.loads(edit_path.read_text());assert raw==source and edited==expected;assert not list(validator.iter_errors(raw)) and not list(validator.iter_errors(edited));assert FreshnessExecutionResultArtifact.from_dict(raw).to_dict()==native and FreshnessExecutionResultArtifact.from_dict(edited).to_dict()==expected_native
  results.append({'id':c['id'],'format':f,'schemaValid':True,'nativeParserEqual':True,'onlyDiagnosticChanged':True,'roundtripSha256':hashlib.sha256(raw_path.read_bytes()).hexdigest(),'editedSha256':hashlib.sha256(edit_path.read_bytes()).hexdigest()})
p=json.loads((base/'provenance.json').read_text());assert len(p['runnerStatuses'])==4 and len(p['emittedStatuses'])==3
(base/'oracle-results.json').write_text(json.dumps({'runtime':'dbt Core 1.10.0 FreshnessExecutionResultArtifact; jsonschema 4.25.1 without format checker','results':results,'nativeEmitterOmission':p['omittedByNativeEmitter'],'limits':'Runtime reconstruction is not the emitted sources.json; no automatic freshness classification in UMF'},indent=2)+'\n');print({'nativeComparisons':len(results),'emittedRows':3,'runnerRows':4})
