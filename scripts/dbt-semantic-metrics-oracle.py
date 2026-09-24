import json,copy,hashlib
from pathlib import Path
from dbt_semantic_interfaces.implementations.semantic_manifest import PydanticSemanticManifest as M
from dbt_semantic_interfaces.validations.semantic_manifest_validator import SemanticManifestValidator
from dbt_semantic_interfaces.type_enums.metric_type import MetricType
from pydantic.v1 import ValidationError
from jsonschema import Draft202012Validator
base=Path('fixtures/dbt/semantic-metrics');source=json.loads((base/'semantic-manifest.json').read_text());cases=json.loads((base/'results.json').read_text())['results'];schema=Draft202012Validator(json.loads(Path('native/dbt/semantic-sources/serialized-schema.json').read_text()));native=M.parse_obj(source)
assert set(m.type for m in native.metrics)==set(MetricType);assert not SemanticManifestValidator().validate_semantic_manifest(native).errors
source_results=[]
for f in ['json','yaml']:
 p=base/f'source.{f}.json';obj=json.loads(p.read_text());assert obj==source and json.loads(M.parse_obj(obj).json())==source;assert not list(schema.iter_errors(obj));source_results.append({'format':f,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
results=[]
for c in cases:
 expected=copy.deepcopy(source);parts=c['editPath'].split('/')[1:];n=expected
 for p in parts[:-1]:n=n[int(p)] if isinstance(n,list) else n[p]
 n[parts[-1]]=c['value']
 for f in ['json','yaml']:
  path=base/f"{c['id']}.edited.{f}.json";obj=json.loads(path.read_text());assert obj==expected
  shape=not list(schema.iter_errors(obj));parser=True;errors=[];warnings=[]
  try:
   parsed=M.parse_obj(obj);assert json.loads(parsed.json())==expected
   checked=SemanticManifestValidator().validate_semantic_manifest(parsed);errors=[e.message for e in checked.errors];warnings=[e.message for e in checked.warnings]
  except ValidationError as e:
   parser=False;errors=[str(e)]
  valid=parser and not errors
  assert (shape,parser,valid)==(c['shapeValid'],c['parserValid'],c['semanticValid']),(c['id'],shape,parser,valid,errors)
  results.append({'id':c['id'],'format':f,'shapeValid':shape,'parserValid':parser,'semanticValid':valid,'errors':errors,'warnings':warnings,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'dbt-semantic-interfaces 0.8.5 native parser and SemanticManifestValidator; jsonschema 4.25.1','metricTypes':sorted(t.value for t in MetricType),'metricCount':len(native.metrics),'sources':source_results,'results':results,'limits':'Semantic validation of candidate artifacts only; no MetricFlow planning, SQL execution or analytic-result equivalence'},indent=2)+'\n');print({'metricTypes':len(MetricType),'metricCount':len(native.metrics),'candidateComparisons':len(results)})
