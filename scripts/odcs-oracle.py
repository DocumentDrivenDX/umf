import json,hashlib,copy,collections
from pathlib import Path
from jsonschema.validators import validator_for
import yaml
base=Path('fixtures/odcs');cases=json.loads((base/'results.json').read_text())['results'];results=[];versions=collections.Counter()
for c in cases:
 assert 'error' not in c,c
 versions[c['apiVersion']]+=1
 schema=json.loads(Path('native/odcs/sources/schema/odcs-json-schema-v'+c['apiVersion'].removeprefix('v')+'.json').read_text());validator=validator_for(schema)(schema)
 source=json.loads((base/(c['id']+'.json.json')).read_text());expected=copy.deepcopy(source);expected[c['editPath'][1:]]=c['value'];native_yaml=yaml.safe_load(Path(c['path']).read_text());assert native_yaml==source,c['path']
 for f in ['json','yaml']:
  a=base/f"{c['id']}.{f}.json";b=base/f"{c['id']}.edited.{f}.json";obj=json.loads(a.read_text());edited=json.loads(b.read_text());assert obj==source and edited==expected
  errors=list(validator.iter_errors(obj));edit_errors=list(validator.iter_errors(edited));results.append({'id':c['id'],'format':f,'nativeValid':not errors,'candidateNativeValid':not edit_errors,'errors':[{'path':list(e.path),'message':e.message} for e in errors],'candidateErrors':[{'path':list(e.path),'message':e.message} for e in edit_errors],'roundtripSha256':hashlib.sha256(a.read_bytes()).hexdigest(),'editedSha256':hashlib.sha256(b.read_bytes()).hexdigest()})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'jsonschema 4.25.1 without format checker; PyYAML 6.0.3 safe_load agrees on this finite corpus','versions':dict(versions),'results':results,'limits':'Document shape checks, not ODCS reference resolution, constraint/SLA enforcement or physical compatibility'},indent=2)+'\n');print({'versions':dict(versions),'comparisons':len(results),'nativeValid':sum(r['nativeValid'] for r in results),'candidateValid':sum(r['candidateNativeValid'] for r in results)})
