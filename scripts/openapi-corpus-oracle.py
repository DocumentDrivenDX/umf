"""Evaluate complete official example corpus against unmodified native schemas."""
import json,hashlib
from pathlib import Path
from importlib.metadata import version
import yaml
from jsonschema import Draft4Validator,Draft202012Validator
assert yaml.__version__=='6.0.3' and version('jsonschema')=='4.26.0'
class OpenapiLoader(yaml.SafeLoader):
 pass
# Timestamp is not a JSON-compatible core scalar; preserve its lexical string.
OpenapiLoader.add_constructor('tag:yaml.org,2002:timestamp',lambda loader,node:loader.construct_scalar(node))
base=Path('fixtures/openapi');manifest=json.loads((base/'upstream/manifest.json').read_text());results=json.loads((base/'corpus-results.json').read_text());assert results['commit']==manifest['commit']
resources=Path('spec/extensions/openapi/upstream');validators={}
for entry in json.loads((resources/'manifest.json').read_text())['resources']:
 raw=(resources/entry['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==entry['sha256']
 schema=json.loads(raw);validators[entry['file'][:3]]=(Draft4Validator if 'draft-04' in schema['$schema'] else Draft202012Validator)(schema)
assert [r['path'] for r in results['results']]==[r['path'] for r in manifest['files']]
rows=[]
for entry,result in zip(manifest['files'],results['results']):
 raw=(base/'upstream'/entry['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==entry['sha256']
 native=json.loads(raw) if entry['path'].endswith('.json') else yaml.load(raw,Loader=OpenapiLoader)
 assert native==result['native'],entry['path']
 if result['role']=='description':
  assert json.loads(result['exported'])==native
  validator=validators[result['version'][:3]]
  errors=list(validator.iter_errors(native));assert not errors,(entry['path'],[str(e) for e in errors])
 rows.append({'path':entry['path'],'role':result['role'],'nativeContentEqual':True,'validated':result['role']=='description'})
legacy=[]
for case in json.loads((base/'legacy-validation-cases.json').read_text()):
 accepted=validators[case['version'][:3]].is_valid(case['native']);assert accepted==case['accepted'],case
 legacy.append({'version':case['version'],'name':case['name'],'accepted':accepted})
assert len(rows)==46 and sum(r['validated'] for r in rows)==38
(base/'corpus-oracle-results.json').write_text(json.dumps({'commit':manifest['commit'],'versions':{'jsonschema':version('jsonschema'),'PyYAML':yaml.__version__},'files':rows,'legacyCases':legacy,'yamlProfile':'PyYAML safe loader with timestamp-tag literals retained as strings for the OpenAPI JSON-compatible profile', 'limits':['Eight referenced fragments are preserved as corpus resources but are not standalone OpenAPI documents','No referenced-file composition, HTTP runtime, parameter serialization or all-prose conformance evidence']},indent=2)+'\n')
print('OpenAPI official corpus: 46 native contents retained, 38 complete descriptions validated; 8 legacy cases agree')
