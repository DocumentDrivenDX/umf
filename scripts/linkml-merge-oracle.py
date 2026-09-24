import copy
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.dumpers import json_dumper
from linkml_runtime.utils.schemaview import SchemaView
collections=['prefixes','classes','slots','enums','subsets','types']
base=Path('fixtures/linkml/merge');results=[]
for c in json.loads((base/'results.json').read_text())['cases']:
    if c['id']=='scoped':
        results.append({'id':c['id'],'comparison':'not-comparable','reason':'Global native preload keys cannot express importer-specific common aliases'});continue
    for row in c['reports']:
        models={s['key']:yaml_loader.loads(s['text'],target_class=SchemaDefinition) for s in c['sources']}
        view=SchemaView(models['root']);view.schema_map.update(models)
        attempts=[]
        def guarded(imp,*args,**kwargs):
            attempts.append(str(imp));raise ValueError('Unsupplied import: '+str(imp))
        view.load_import=guarded
        try:closure=list(view.imports_closure())
        except ValueError:
            assert c['id']=='missing' and attempts==['missing'] and row['report']['status']=='blocked'
            results.append({'id':c['id'],'mode':row['mode'],'format':row['format'],'comparison':'unresolved','retrievalAttempts':attempts});continue
        assert not attempts
        assert closure==row['report']['closure'],(c['id'],closure,row['report']['closure'])
        if row['mode']=='merge-imports':
            view.merge_imports();expected=view.schema
        else:
            expected=copy.deepcopy(view.schema)
            for collection in collections:setattr(expected,collection,copy.deepcopy(view._get_dict(collection)))
            expected.imports=[]
        candidate=yaml_loader.loads(row['output'],target_class=SchemaDefinition)
        actual=json.loads(json_dumper.dumps(candidate));native=json.loads(json_dumper.dumps(expected))
        assert actual==native,(c['id'],row['mode'],actual,native)
        results.append({'id':c['id'],'mode':row['mode'],'format':row['format'],'comparison':'normalized-candidate','closure':closure,'normalized':native})
(base/'oracle-results.json').write_text(json.dumps({'modelVersion':'1.11.0','runtimeVersion':'1.11.0rc2','results':results},indent=2)+'\n')
print({'nativeCandidates':sum(r['comparison']=='normalized-candidate' for r in results),'unresolved':sum(r['comparison']=='unresolved' for r in results),'nonComparableContexts':sum(r['comparison']=='not-comparable' for r in results)})
