import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.dumpers import json_dumper
from linkml_runtime.utils.schemaview import SchemaView
base=Path('fixtures/linkml/slot-values');fixture=json.loads((base/'results.json').read_text());model=yaml_loader.loads(Path(fixture['path']).read_text(),target_class=SchemaDefinition)
view=SchemaView(model)
schema=json.loads(Path('spec/extensions/linkml/slot-values-schema.json').read_text())
fields=list(schema['properties']['fields']['properties'])
def decode(v):
    if v['kind']=='number':return json.loads(v['value'])
    return v['value']
results=[]
for row in fixture['reports']:
    r=row['report'];slot=view.induced_slot(r['slotName'],r['className'],imports=False)
    native=json.loads(json_dumper.dumps(slot))
    selected={k:native[k] for k in fields if k in native and native[k] is not None}
    actual={k:decode(v) for k,v in r['fields'].items()}
    assert r['status']=='resolved',(r['className'],r['slotName'],r['diagnostics'])
    assert actual==selected,(r['className'],r['slotName'],actual,selected)
    results.append({'className':r['className'],'slotName':r['slotName'],'format':row['format'],'fields':selected,'encodedFields':{k:json.dumps(v,separators=(',',':')) for k,v in selected.items()}})
(base/'oracle-results.json').write_text(json.dumps({'modelVersion':'1.11.0','runtimeVersion':'1.11.0rc2','scalarFields':fields,'results':results},indent=2)+'\n')
print({'nativeComparisons':len(results),'scalarFields':len(fields)})
