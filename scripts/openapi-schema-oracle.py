"""Independent official dialect meta-schema checks for fully known authored cases."""
import json,hashlib
from pathlib import Path
from jsonschema import Draft202012Validator
from jsonschema.validators import SPECIFICATIONS
from referencing import Resource
root=Path('spec/extensions/openapi/upstream');manifest=json.loads((root/'dialect-manifest.json').read_text());registry=SPECIFICATIONS;resources={}
for entry in manifest['resources']:
 raw=(root/entry['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==entry['sha256']
 resource=json.loads(raw);resources[entry['file']]=resource;registry=registry.with_resource(resource['$id'],Resource.from_contents(resource))
validator=Draft202012Validator(resources['3.1-dialect.json'],registry=registry)
rows=[];excluded=[]
for case in json.loads(Path('fixtures/openapi/embedded-schema-cases.json').read_text()):
 if case['name'] in ['nested-custom','custom-default','dependency-custom','data-extensions']:
  excluded.append({'name':case['name'],'reason':'Opaque dialect boundary or literal non-schema extension; not evaluated under a known dialect'});continue
 schema=case['native']['components']['schemas']['Value']
 check=Draft202012Validator(Draft202012Validator.META_SCHEMA) if case['name']=='explicit-standard' else validator
 errors=list(check.iter_errors(schema));accepted=not errors;assert accepted==case['accepted'],(case['name'],errors)
 rows.append({'name':case['name'],'accepted':accepted})
# Native 3.2 vocabulary differs from the 3.1 vocabulary; keep its own oracle.
modern=Draft202012Validator(resources['3.2-dialect.json'],registry=registry)
assert modern.is_valid({'type':'string','xml':{'nodeType':'text'}})
assert not modern.is_valid({'type':'string','xml':{'nodeType':7}})
Path('fixtures/openapi/embedded-schema-oracle-results.json').write_text(json.dumps({'resources':manifest['resources'],'knownDialectCases':rows,'excluded':excluded,'oas32XmlChecks':2,'limits':['Meta-schema validation is not instance or reference evaluation','Unknown dialects are not substituted with known dialect rules']},indent=2)+'\n')
print('OpenAPI embedded schemas: 9 known-dialect cases and 2 OpenAPI 3.2 vocabulary checks passed')
