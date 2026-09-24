import copy,json,hashlib
from pathlib import Path
from jsonschema import Draft201909Validator
base=Path('fixtures/odcs/rename');source=json.loads((base/'source.json').read_text());cases=json.loads((base/'results.json').read_text())['results'];check=Draft201909Validator(json.loads(Path('spec/extensions/odcs/native-3.2.0.json').read_text()));assert not list(check.iter_errors(source));results=[]
def access(obj,path):
 parts=path.split('/')[1:];n=obj
 for p in parts[:-1]:n=n[int(p)] if isinstance(n,list) else n[p]
 return n,int(parts[-1]) if isinstance(n,list) else parts[-1]
for c in cases:
 expected=copy.deepcopy(source)
 for change in c['changes']:
  n,key=access(expected,change['path']);assert n[key]==change['before'];n[key]=change['after']
 for f in ['json','yaml']:
  p=base/f"{c['id']}.{f}.json";actual=json.loads(p.read_text());assert actual==expected;assert not list(check.iter_errors(actual));assert actual['customProperties']==source['customProperties'];assert actual['schema'][2]['properties'][1]['relationships'][1]['to']=='schema/customers_obj/properties/customer_id_prop'
  results.append({'id':c['id'],'format':f,'nativeShapeValid':True,'onlyReportedPathsChanged':True,'stableIdReferenceUnchanged':True,'uninterpretedMetadataUnchanged':True,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'jsonschema 4.25.1 pinned ODCS v3.2.0 schema without format checking','results':results,'limits':'Native shape and whole-value checks; not external consumer, expression or data-enforcement equivalence'},indent=2)+'\n');print({'candidateComparisons':len(results)})
