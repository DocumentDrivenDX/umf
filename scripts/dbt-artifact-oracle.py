import hashlib,json
from pathlib import Path
from dbt.artifacts.schemas.run import RunResultsArtifact
from dbt.artifacts.schemas.catalog.v1.catalog import CatalogArtifact
from jsonschema import Draft202012Validator
base=Path('fixtures/dbt/artifacts');cases=json.loads((base/'results.json').read_text())['results'];results=[]
for c in cases:
 source=json.loads(Path(c['path']).read_text());catalog=c['id']=='catalog';cls=CatalogArtifact if catalog else RunResultsArtifact;grammar='catalog-v1' if catalog else 'run-results-v6';validator=Draft202012Validator(json.loads(Path('native/dbt/sources/'+grammar+'.json').read_text()));assert not list(validator.iter_errors(source));native=cls.from_dict(source).to_dict()
 def change(root):
  parts=c['editPath'].split('/')[1:];node=root
  for part in parts[:-1]:node=node[int(part)] if isinstance(node,list) else node[part]
  node[int(parts[-1]) if isinstance(node,list) else parts[-1]]=c['value']
 expected=json.loads(json.dumps(source));change(expected);expected_native=json.loads(json.dumps(native));change(expected_native)
 for f in ['json','yaml']:
  raw_path=base/f"{c['id']}.{f}.json";edit_path=base/f"{c['id']}.edited.{f}.json";raw=json.loads(raw_path.read_text());edited=json.loads(edit_path.read_text());assert raw==source and edited==expected;assert not list(validator.iter_errors(raw)) and not list(validator.iter_errors(edited));assert cls.from_dict(raw).to_dict()==native and cls.from_dict(edited).to_dict()==expected_native
  results.append({'id':c['id'],'format':f,'nativeParser':cls.__name__,'onlyRequestedValueChanged':True,'schemaValid':True,'roundtripSha256':hashlib.sha256(raw_path.read_bytes()).hexdigest(),'editedSha256':hashlib.sha256(edit_path.read_bytes()).hexdigest()})
manifest=json.loads((base/'catalog-manifest.json').read_text());catalog=json.loads((base/'catalog.json').read_text());declared=manifest['nodes']['model.umf_fixture.order_totals']['columns']['total_amount']['data_type'];observed=catalog['nodes']['model.umf_fixture.order_totals']['columns']['total_amount']['type'];assert declared=='decimal(18,2)' and observed=='DOUBLE'
(base/'oracle-results.json').write_text(json.dumps({'runtime':'dbt Core 1.10.0 native artifacts; jsonschema 4.25.1 without format checking','results':results,'declaredVsObserved':{'model':'model.umf_fixture.order_totals','column':'total_amount','declared':declared,'observed':observed,'equivalenceClaimed':False}},indent=2)+'\n');print({'artifacts':len(cases),'nativeComparisons':len(results),'declared':declared,'observed':observed})
