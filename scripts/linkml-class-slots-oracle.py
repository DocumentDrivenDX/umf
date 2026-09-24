"""Local class membership, native SchemaView imports=False; source loader failures stay explicit."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.utils.schemaview import SchemaView
base=Path('fixtures/linkml/class-slots')
results=[]
for case in json.loads((base/'results.json').read_text())['cases']:
    try:
        model=yaml_loader.loads(Path(case['path']).read_text(),target_class=SchemaDefinition)
    except Exception as exc:
        results.append({'path':case['path'],'comparison':'loader-rejected','error':type(exc).__name__+': '+str(exc)})
        continue
    view=SchemaView(model)
    rows=[]
    for row in case['reports']:
        r=row['report']
        try:
            ancestors=list(view.class_ancestors(r['className'],imports=False))
            slots=list(view.class_slots(r['className'],imports=False))
        except (ValueError,AttributeError) as exc:
            assert r['status']=='blocked',(case['path'],r['className'],str(exc))
            rows.append({'className':r['className'],'format':row['format'],'comparison':'blocked','error':type(exc).__name__+': '+str(exc)})
            continue
        assert r['status']=='resolved',(case['path'],r['className'],r['diagnostics'])
        assert r['ancestors']==ancestors,(case['path'],r['className'],ancestors,r['ancestors'])
        assert [s['name'] for s in r['slots']]==slots,(case['path'],r['className'],slots)
        rows.append({'className':r['className'],'format':row['format'],'comparison':'ordered-membership','ancestors':ancestors,'slots':slots})
    results.append({'path':case['path'],'comparison':'native','results':rows})
(base/'oracle-results.json').write_text(json.dumps({'modelVersion':'1.11.0','runtimeVersion':'1.11.0rc2','results':results},indent=2)+'\n')
print({'sources':len(results),'nativeReports':sum(len(r.get('results',[])) for r in results),'loaderRejected':sum(r['comparison']=='loader-rejected' for r in results)})
