"""Unmodified official OpenAPI schemas, independently evaluated by Python jsonschema."""
import json,hashlib
from pathlib import Path
from importlib.metadata import version
import yaml
from jsonschema import Draft202012Validator,Draft4Validator
assert version('jsonschema')=='4.26.0' and yaml.__version__=='6.0.3'
root=Path('spec/extensions/openapi/upstream');manifest=json.loads((root/'manifest.json').read_text());validators={}
for entry in manifest['resources']:
 data=(root/entry['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==entry['sha256']
 parsed=json.loads(data)
 validators[entry['file'][:3]]=(Draft4Validator if 'draft-04' in parsed['$schema'] else Draft202012Validator)(parsed)
original=yaml.safe_load(Path('fixtures/openapi/orders.yaml').read_text());returned=json.loads(Path('fixtures/openapi/orders-round-trip.json').read_text());assert original==returned
assert validators['3.1'].is_valid(original) and validators['3.1'].is_valid(returned)
latest=json.loads(Path('fixtures/openapi/orders-3.2.json').read_text());assert validators['3.2'].is_valid(latest)
rows=[]
for case in json.loads(Path('fixtures/openapi/object-validation-cases.json').read_text()):
 errors=list(validators[case['version'][:3]].iter_errors(case['native']));accepted=not errors
 assert accepted==case.get('objectExpected',case['expected']),(case['version'],case['name'],[str(e) for e in errors])
 rows.append({'version':case['version'],'name':case['name'],'accepted':accepted})
Path('fixtures/openapi/oracle-results.json').write_text(json.dumps({'versions':{'jsonschema':version('jsonschema'),'PyYAML':yaml.__version__},'nativeContentEqual':True,'cases':rows,'schemaResources':manifest['resources'],'limits':['Unmodified official object schemas intentionally do not validate embedded Schema Object dialects','No native instance, reference resolution, HTTP serialization, security execution or all-prose conformance claim']},indent=2)+'\n')
print('OpenAPI: native JSON/YAML equality and 12 unmodified-official-schema comparisons passed')
