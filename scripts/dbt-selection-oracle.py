import hashlib,json
from pathlib import Path
import networkx as nx
from dbt.contracts.graph.manifest import Manifest
base=Path('fixtures/dbt/rich');source=json.loads((base/'manifest.json').read_text());m=Manifest.from_dict(source);m.build_parent_and_child_maps();macro_map=m.build_macro_child_map();cases=json.loads((base/'selection-results.json').read_text());results=[]
resources=[(child,parent) for child,parents in m.parent_map.items() for parent in parents];macros=[(child,parent) for parent,children in macro_map.items() for child in children]
for c in cases['results']:
 o=c['options'];s=c['selection'];graph=nx.DiGraph();graph.add_nodes_from(m.parent_map);graph.add_edges_from(resources)
 if o.get('includeMacros',False):graph.add_nodes_from(macro_map);graph.add_edges_from(macros)
 depths={}
 for root in o['roots']:
  for node,depth in nx.single_source_shortest_path_length(graph,root,cutoff=o.get('maxDepth',16)).items():depths[node]=min(depths.get(node,depth),depth)
 selected={n['id']:n['depth'] for n in s['nodes']};bounded=len(depths)>o.get('maxNodes',256)
 if not bounded:assert selected==depths,(c['id'],selected,depths)
 else:assert c['id']=='node-bound' and selected=={o['roots'][0]:0}
 allowed=set(graph.edges);assert all((e['dependent'],e['dependency']) in allowed for e in s['edges'])
 assert {(e['dependent'],e['dependency']) for e in s['edges']}=={(a,b) for a,b in allowed if a in selected and b in selected}
 for b in s['boundary']:
  e=b['edge'];assert e['dependent'] in selected
  if b['reason']=='macro-excluded':assert (e['dependent'],e['dependency']) in macros and not o.get('includeMacros',False)
  else:assert (e['dependent'],e['dependency']) in allowed and e['dependency'] not in selected
 results.append({'id':c['id'],'nodes':len(selected),'minimumDepthsAgree':True,'inducedEdgesAgree':True,'nativeReachabilityWithinDepthCompared':not bounded,'nodeBoundRootOnly':bounded})
(base/'selection-oracle-results.json').write_text(json.dumps({'runtime':'dbt Core 1.10.0 map builders + NetworkX '+nx.__version__,'sourceSha256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest(),'selectionSha256':hashlib.sha256((base/'selection-results.json').read_bytes()).hexdigest(),'results':results,'limits':'UMF node-budget policy is not dbt CLI selection syntax; native comparison uses explicit reference reachability'},indent=2)+'\n');print(results)
