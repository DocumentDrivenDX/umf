"""Record official JSON Schema limits separately from specification-derived runtime checks."""
import json,hashlib
from pathlib import Path
from jsonschema import Draft201909Validator
base=Path('fixtures/odcs/relationships');schema=Path('spec/extensions/odcs/native-3.2.0.json');validator=Draft201909Validator(json.loads(schema.read_text()));results=[]
expected={'upstream':True,'paired':True,'arity':True,'property-from':False,'mixed-shapes':False,'duplicate-id':True,'property-array':True,'unknown-type':False,'external':True}
for c in json.loads((base/'results.json').read_text())['results']:
 p=base/(c['id']+'.json');obj=json.loads(p.read_text());errors=list(validator.iter_errors(obj));assert (not errors)==expected[c['id']],(c['id'],[e.message for e in errors]);results.append({'id':c['id'],'nativeShapeValid':not errors,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'errors':[{'path':list(e.path),'message':e.message} for e in errors]})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'jsonschema 4.25.1 Draft201909Validator without format checks','schemaSha256':hashlib.sha256(schema.read_bytes()).hexdigest(),'results':results,'limits':'Official JSON Schema does not resolve targets, check duplicate relationship IDs or equal composite lengths; property-array lookup remains explicitly unsupported, not declared invalid by its grammar'},indent=2)+'\n');print({'cases':len(results),'nativeShapeValid':sum(r['nativeShapeValid'] for r in results)})
