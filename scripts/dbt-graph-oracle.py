import json,hashlib
from pathlib import Path
from dbt.contracts.graph.manifest import Manifest
for base in [Path('fixtures/dbt'),Path('fixtures/dbt/rich')]:
 source=json.loads((base/'manifest.json').read_text());m=Manifest.from_dict(source);m.build_parent_and_child_maps();macro_children=m.build_macro_child_map();report=json.loads((base/'graph-results.json').read_text())['report'];assert report['status']=='checked'
 assert m.parent_map==source['parent_map'] and m.child_map==source['child_map']
 resource_edges=sorted((dependent,dependency) for dependent,values in m.parent_map.items() for dependency in values)
 macro_edges=sorted((dependent,dependency) for dependency,values in macro_children.items() for dependent in values)
 assert resource_edges==sorted((e['dependent'],e['dependency']) for e in report['edges'] if e['kind']=='resource')
 assert macro_edges==sorted((e['dependent'],e['dependency']) for e in report['edges'] if e['kind']=='macro')
 assert all(e['resolved'] for e in report['edges'])
 (base/'graph-oracle-results.json').write_text(json.dumps({'runtime':'dbt Core 1.10.0 Manifest native map builders','sourceSha256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest(),'graphSha256':hashlib.sha256((base/'graph-results.json').read_bytes()).hexdigest(),'resourceEdges':len(resource_edges),'macroEdges':len(macro_edges),'parentChildMapsEqual':True,'limits':'No SQL/Jinja inference, cycle legality or execution checks'},indent=2)+'\n');print({'base':str(base),'resourceEdges':len(resource_edges),'macroEdges':len(macro_edges)})
