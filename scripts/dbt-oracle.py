import hashlib,json
from pathlib import Path
from jsonschema import Draft202012Validator
from dbt.artifacts.schemas.manifest.v12.manifest import WritableManifest
base=Path('fixtures/dbt');source=json.loads((base/'manifest.json').read_text());report=json.loads((base/'results.json').read_text());grammar=json.loads(Path('native/dbt/sources/manifest-v12.json').read_text());validator=Draft202012Validator(grammar)
assert not list(validator.iter_errors(source));native=WritableManifest.from_dict(source).to_dict()
results=[]
for f in ['json','yaml']:
 raw=json.loads((base/f'roundtrip.{f}.json').read_text());edited=json.loads((base/f'edited.{f}.json').read_text());assert raw==source
 assert not list(validator.iter_errors(raw));assert not list(validator.iter_errors(edited));assert WritableManifest.from_dict(raw).to_dict()==native
 expected=json.loads(json.dumps(source));expected['nodes']['model.umf_fixture.order_totals']['description']=report['newDescription'];assert edited==expected
 expected_native=json.loads(json.dumps(native));expected_native['nodes']['model.umf_fixture.order_totals']['description']=report['newDescription'];assert WritableManifest.from_dict(edited).to_dict()==expected_native
 results.append({'format':f,'sourceEqual':True,'nativeSchemaValid':True,'nativeParserEqual':True,'descriptionOnlyEdit':True,'roundtripSha256':hashlib.sha256((base/f'roundtrip.{f}.json').read_bytes()).hexdigest(),'editedSha256':hashlib.sha256((base/f'edited.{f}.json').read_bytes()).hexdigest()})
runs=json.loads((base/'build-run-results.json').read_text());assert len(runs['results'])==6 and all(r['status'] in ['success','pass'] for r in runs['results'])
(base/'oracle-results.json').write_text(json.dumps({'runtime':'dbt Core 1.10.0 WritableManifest; jsonschema 4.25.1 without format checker','sourceSha256':report['sourceSha256'],'buildResults':6,'nodes':len(source['nodes']),'macros':len(source['macros']),'results':results},indent=2)+'\n');print({'formats':2,'nativeDescriptionEdits':2,'buildResults':6})
