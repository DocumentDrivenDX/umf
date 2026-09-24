import sys,json,copy,hashlib,importlib.metadata as metadata
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.dumpers import json_dumper
from jsonschema import Draft201909Validator
assert metadata.version('linkml-runtime')=='1.11.0rc2'
metamodel='--metamodel' in sys.argv
base=Path('fixtures/linkml/metamodel' if metamodel else 'fixtures/linkml');schema=json.loads(Path('spec/extensions/linkml/native-schema.json').read_text());check=Draft201909Validator(schema);results=[];outcomes=[]
def native(text):
 try:
  model=yaml_loader.loads(text,target_class=SchemaDefinition);return {'status':'accepted','normalized':json.loads(json_dumper.dumps(model))}
 except Exception as e:return {'status':'rejected','exception':type(e).__name__,'message':str(e)}
for c in json.loads((base/'results.json').read_text())['results']:
 assert 'error' not in c,c
 source=json.loads((base/(c['id']+'.json.json')).read_text());expected=copy.deepcopy(source);expected[c['editPath'][1:]]=c['value'];original=native(Path(c['path']).read_text());edited_expected=native(json.dumps(expected))
 normalized_errors=list(check.iter_errors(original['normalized'])) if original['status']=='accepted' else []
 assert original['status']==('rejected' if c['path'].endswith('schema_definition-native-array-1.yaml') else 'accepted'),(c['path'],original)
 assert edited_expected['status']==original['status'],(c['path'],edited_expected)
 assert bool(normalized_errors)==c['path'].endswith('schema_definition-type_mappings-1.yaml'),(c['path'],normalized_errors)
 outcomes.append({'id':c['id'],'path':c['path'],'native':original['status'],**({k:original[k] for k in ['exception','message']} if original['status']=='rejected' else {}),'normalizedSchemaErrors':[{'path':list(e.path),'message':e.message} for e in normalized_errors]})
 if metamodel and c['path'].endswith('/types.yaml'):outcomes[-1]['singletonNotes']={'source':source['types']['decimal']['notes'],'normalized':original['normalized']['types']['decimal']['notes']}
 for f in ['json','yaml']:
  a=base/f"{c['id']}.{f}.json";b=base/f"{c['id']}.edited.{f}.json";obj=json.loads(a.read_text());edited=json.loads(b.read_text());assert obj==source and edited==expected
  source_errors=list(check.iter_errors(obj));candidate_errors=list(check.iter_errors(edited));expected_valid=not (metamodel and c['path'].endswith('/types.yaml'));assert (not source_errors)==expected_valid and (not candidate_errors)==expected_valid;assert native(a.read_text())==original and native(b.read_text())==edited_expected
  results.append({'id':c['id'],'format':f,'sourceSchemaValid':not source_errors,'candidateSchemaValid':not candidate_errors,'sourceSchemaErrors':[{'path':list(e.path),'message':e.message} for e in source_errors],'nativeOutcome':original['status'],'candidateNativeOutcome':edited_expected['status'],'nativeNormalizationOrRejectionPreserved':True,'roundtripSha256':hashlib.sha256(a.read_bytes()).hexdigest(),'editedSha256':hashlib.sha256(b.read_bytes()).hexdigest()})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'Pinned linkml-model 1.11.0 classes, linkml-runtime 1.11.0rc2, jsonschema 4.25.1 without formats','outcomes':outcomes,'results':results,'limits':'Loader normalization/rejection evidence; no import resolution, induced schema, instance validation or generator execution'},indent=2)+'\n');print({'cases':len(outcomes),'comparisons':len(results),'nativeAccepted':sum(x['native']=='accepted' for x in outcomes),'normalizedSchemaMismatchCases':sum(bool(x['normalizedSchemaErrors']) for x in outcomes)})
