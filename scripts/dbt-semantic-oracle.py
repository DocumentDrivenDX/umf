import json,hashlib,copy
from pathlib import Path
from dbt_semantic_interfaces.implementations.semantic_manifest import PydanticSemanticManifest as M
from dbt_semantic_interfaces.validations.semantic_manifest_validator import SemanticManifestValidator
from jsonschema import Draft7Validator,Draft202012Validator
base=Path('fixtures/dbt/semantic');source=json.loads((base/'semantic-manifest.json').read_text());schema=json.loads(Path('native/dbt/semantic-sources/serialized-schema.json').read_text());check=Draft202012Validator(schema);assert not list(check.iter_errors(source));native=M.parse_obj(source);assert json.loads(native.json())==source
raw_errors=list(Draft7Validator(M.schema()).iter_errors(source));assert len(raw_errors)==43
validation=SemanticManifestValidator().validate_semantic_manifest(native);assert not validation.errors
results=[]
for c in json.loads((base/'results.json').read_text())['results']:
 expected=copy.deepcopy(source);parts=c['editPath'].split('/')[1:];n=expected
 for p in parts[:-1]:n=n[int(p)] if isinstance(n,list) else n[p]
 n[parts[-1]]=c['value']
 for f in ['json','yaml']:
  a=base/f"{c['id']}.{f}.json";b=base/f"{c['id']}.edited.{f}.json";roundtrip=json.loads(a.read_text());edited=json.loads(b.read_text())
  assert roundtrip==source and edited==expected
  assert not list(check.iter_errors(edited)) and json.loads(M.parse_obj(edited).json())==expected
  assert not SemanticManifestValidator().validate_semantic_manifest(M.parse_obj(edited)).errors
  results.append({'id':c['id'],'format':f,'nativeParserEqual':True,'nativeSemanticErrors':0,'onlyRequestedValueChanged':True,'roundtripSha256':hashlib.sha256(a.read_bytes()).hexdigest(),'editedSha256':hashlib.sha256(b.read_bytes()).hexdigest()})
unknown=copy.deepcopy(source);unknown['future_extension']={'meaning':'retained by UMF'};unknown['semantic_models'][0]['future_attribute']=True
normalized=json.loads(M.parse_obj(unknown).json());assert 'future_extension' not in normalized and 'future_attribute' not in normalized['semantic_models'][0]
(base/'oracle-results.json').write_text(json.dumps({'runtime':'dbt-semantic-interfaces 0.8.5; Pydantic native parser and SemanticManifestValidator; jsonschema 4.25.1 without format checker','results':results,'rawSchemaErrors':[{'path':list(e.path),'message':e.message} for e in raw_errors],'derivedSchemaValid':True,'nativeUnknownFieldsDiscarded':['/future_extension','/semantic_models/0/future_attribute'],'limits':'Public browser inspection only checks derived serialized shapes, not native semantic rules; no MetricFlow execution'},indent=2)+'\n');print({'nativeComparisons':len(results),'rawSchemaErrors':len(raw_errors),'nativeSemanticErrors':len(validation.errors)})
