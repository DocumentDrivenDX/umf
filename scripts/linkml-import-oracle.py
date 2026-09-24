"""Compare supplied graph reachability; no native URI retrieval or merge assertion."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.utils.schemaview import SchemaView
base=Path('fixtures/linkml/imports')
results=[]
for case in json.loads((base/'results.json').read_text())['cases']:
    if case['id']=='scoped':
        # SchemaView's global schema_map cannot represent importer-scoped aliases.
        results.append({'id':case['id'],'comparison':'not-comparable','reason':'Importer-scoped common aliases have different targets; no native retrieval equivalence claim'})
        continue
    models={s['key']:yaml_loader.loads(s['text'],target_class=SchemaDefinition) for s in case['sources']}
    view=SchemaView(models['root'])
    view.schema_map.update(models)
    attempts=[]
    def no_retrieval(imp,from_schema=None):
        attempts.append(str(imp))
        raise ValueError('Unsupplied native import: '+str(imp))
    view.load_import=no_retrieval
    try:
        closure=list(view.imports_closure())
        assert not attempts
        for row in case['reports']:
            assert row['report']['status']=='resolved'
            assert set(closure)==set(row['report']['nodes'])
        results.append({'id':case['id'],'comparison':'reachable-set','nativeClosure':closure,'formats':2,'retrievalAttempts':attempts})
    except ValueError:
        assert case['id']=='missing' and attempts==['missing']
        assert all(r['report']['status']=='blocked' for r in case['reports'])
        results.append({'id':case['id'],'comparison':'unresolved','formats':2,'retrievalAttempts':attempts})
(base/'oracle-results.json').write_text(json.dumps({'modelVersion':'1.11.0','runtimeVersion':'1.11.0rc2','results':results},indent=2)+'\n')
print('LinkML supplied imports: 2 native reachable sets, 1 unresolved graph, 1 explicitly non-comparable scoped alias graph')
