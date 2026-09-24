import json
from pathlib import Path
import rdflib
from rdflib import Dataset,Graph,BNode,URIRef
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS=False
base=Path('fixtures/jsonld/to-rdf')
def dataset(path):
    d=Dataset();d.parse(path,format='nquads');g=Graph()
    for s,p,o,c in d.quads():
        q=BNode()
        for role,term in [('s',s),('p',p),('o',o),('g',URIRef('urn:umf:oracle:default') if c==d.default_graph.identifier else c)]:g.add((q,URIRef('urn:umf:oracle:'+role),term))
    return g
native={c['id']:c for c in json.loads((base/'oracle-results.json').read_text())['results']};results=[]
for c in json.loads((base/'results.json').read_text())['cases']:
    row={'id':c['id'],'exports':[]}
    for e in c['exports']:
        entry={'format':e['format']}
        for label,path in [('official',c.get('expectedPath')),('native',native[c['id']].get('nativePath'))]:
            if path:
                try:entry[label+'Equal']=isomorphic(dataset(e['path']),dataset(path))
                except Exception as exc:entry[label+'Error']=str(exc)
        row['exports'].append(entry)
    results.append(row)
(base/'rdf-oracle-results.json').write_text(json.dumps({'processor':'RDFLib '+rdflib.__version__,'comparison':'Dataset quads reified by role; graph isomorphism preserves graph names and blank-node sharing; literal normalization disabled','results':results},indent=2)+'\n')
print({k:[r['id'] for r in results if any(e.get(k) is False if k.endswith('Equal') else k in e for e in r['exports'])] for k in ['officialEqual','nativeEqual','officialError','nativeError']})
