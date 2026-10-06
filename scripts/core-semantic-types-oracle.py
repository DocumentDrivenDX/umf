"""Independent JSON Schema shape oracle; no publisher meaning is inferred."""
import json,sys,hashlib,importlib.metadata
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
schema_path=Path('spec/core/semantic-types-document.schema.json')
ref_path=Path('spec/core/semantic-type-reference.schema.json')
input_path=Path('fixtures/validation/core-semantic-types-oracle-inputs.json')
schema=json.loads(schema_path.read_text());ref=json.loads(ref_path.read_text())
Draft202012Validator.check_schema(schema);Draft202012Validator.check_schema(ref)
registry=Registry().with_resource(ref['$id'],Resource.from_contents(ref))
validator=Draft202012Validator(schema,registry=registry)
rows=[]
for row in json.loads(input_path.read_text())['cases']:
 valid=validator.is_valid(row['document'])
 rows.append({'id':row['id'],'pythonStructureValid':valid,'bunStructureValid':row['structureValid'],'agrees':valid==row['structureValid']})
result={'scope':'Published 0.9.0 JSON Schema shape only; neither inherited semantic rules nor external term meanings','python':sys.version.split()[0],'jsonschema':importlib.metadata.version('jsonschema'),'cases':len(rows),'agreed':sum(row['agrees'] for row in rows),'observations':rows,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [schema_path,ref_path,input_path]}}
Path('fixtures/validation/core-semantic-types-oracle.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['observations','sha256']}))
assert all(row['agrees'] for row in rows)
