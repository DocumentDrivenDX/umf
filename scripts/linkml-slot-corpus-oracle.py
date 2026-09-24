"""Native local induction audit: explicitly detach imports on a private normalized model."""
import copy
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader
from linkml_runtime.dumpers import json_dumper
from linkml_runtime.utils.schemaview import SchemaView
fields=list(json.loads(Path('spec/extensions/linkml/slot-values-schema.json').read_text())['properties']['fields']['properties'])
paths=[c['path'] for c in json.loads(Path('fixtures/linkml/class-slots/results.json').read_text())['cases']]
cases=[]
for path in paths:
    case={'path':path,'queries':[]}
    cases.append(case)
    try:
        model=copy.deepcopy(yaml_loader.loads(Path(path).read_text(),target_class=SchemaDefinition))
    except Exception as exc:
        case.update(status='loader-rejected',error=type(exc).__name__+': '+str(exc));continue
    case['detachedImports']=[str(i) for i in model.imports]
    model.imports=[]
    view=SchemaView(model)
    def forbidden(*args,**kwargs):
        raise AssertionError('Native retrieval must not occur during local induction')
    view.load_import=forbidden
    case['status']='loaded'
    for name in model.classes:
        try:slots=view.class_slots(name,imports=False)
        except (ValueError,AttributeError) as exc:
            case['queries'].append({'className':str(name),'status':'membership-blocked','error':type(exc).__name__+': '+str(exc)});continue
        for slot in slots:
            q={'className':str(name),'slotName':str(slot)};case['queries'].append(q)
            try:
                result=json.loads(json_dumper.dumps(view.induced_slot(slot,name,imports=False)))
                q.update(status='induced',encodedFields={k:json.dumps(result[k],separators=(',',':')) for k in fields if k in result and result[k] is not None})
            except (ValueError,AttributeError,TypeError) as exc:
                q.update(status='induction-blocked',error=type(exc).__name__+': '+str(exc))
base=Path('fixtures/linkml/slot-corpus');base.mkdir(parents=True,exist_ok=True)
(base/'oracle-results.json').write_text(json.dumps({'modelVersion':'1.11.0','runtimeVersion':'1.11.0rc2','scope':'Private normalized models with imports explicitly detached; no imported induction or source rewrite','cases':cases},indent=2)+'\n')
from collections import Counter
print({'sources':len(cases),'queries':dict(Counter(q['status'] for c in cases for q in c['queries']))})
