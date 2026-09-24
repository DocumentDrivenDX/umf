import copy
import hashlib
import json
import sys
import jsonschema
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.dumpers import json_dumper
from linkml_runtime.utils.schemaview import SchemaView
base=Path('fixtures/linkml/metamodel-merge');fixture=json.loads((base/'results.json').read_text());results=[]
collections=['prefixes','classes','slots','enums','subsets','types']
validator=jsonschema.Draft201909Validator(json.loads(Path('spec/extensions/linkml/native-schema.json').read_text()))
for case in fixture['cases']:
    models={s['key']:yaml_loader.loads(Path(s['path']).read_text(),target_class=SchemaDefinition) for s in fixture['sources']}
    view=SchemaView(models[case['entry']]);view.schema_map.update({s['literal']:models[s['key']] for s in fixture['sources']})
    def guarded(*args,**kwargs):raise AssertionError('Retrieval forbidden; every model is supplied')
    view.load_import=guarded
    aliases={s['literal']:s['key'] for s in fixture['sources']}
    closure=[aliases.get(str(key),str(key)) for key in view.imports_closure()]
    assert closure==case['closure'],(case['entry'],closure,case['closure'])
    if case['mode']=='merge-imports':view.merge_imports();expected=view.schema
    else:
        expected=copy.deepcopy(view.schema)
        for collection in collections:setattr(expected,collection,copy.deepcopy(view._get_dict(collection)))
        expected.imports=[]
    output=Path(case['outputPath']).read_text();actual=yaml_loader.loads(output,target_class=SchemaDefinition)
    native=json.loads(json_dumper.dumps(expected));normalized=json.loads(json_dumper.dumps(actual))
    assert normalized==native,(case['entry'],case['mode'],'Normalized candidate mismatch')
    raw_errors=list(validator.iter_errors(json.loads(output)))
    normalized_errors=list(validator.iter_errors(normalized))
    assert not normalized_errors,(case['entry'],case['mode'],[e.message for e in normalized_errors])
    results.append({'rawSchemaErrors':len(raw_errors),'normalizedSchemaErrors':len(normalized_errors),'rawErrorExamples':[{'path':list(e.absolute_path),'message':e.message} for e in raw_errors[:3]],'entry':case['entry'],'mode':case['mode'],'closure':closure,'outputSha256':hashlib.sha256(output.encode()).hexdigest(),'normalizedSha256':hashlib.sha256(json.dumps(native,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'definitions':{k:len(native.get(k,{})) for k in collections}})
(base/'oracle-results.json').write_text(json.dumps({'modelVersion':'1.11.0','runtimeVersion':'1.11.0rc2','results':results},indent=2)+'\n')
print({'nativeCandidates':len(results),'entrySchemas':len(fixture['sources'])})
