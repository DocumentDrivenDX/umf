import json
from pathlib import Path
import rdflib
from rdflib.compare import isomorphic
from rdf_oracle_support import encoded
from rdf_trig_oracle_support import trig,text
base=Path('fixtures/rdf/merge');results=[]
anchor=trig(text(base/'anchor.trig'),'urn:umf:merge:')
for c in json.loads((base/'results.json').read_text())['cases']:
    inputs=[trig(text(c['sourcePath']),'urn:umf:merge:'),anchor];expected=[];names=set()
    for index,(quads,graphs) in enumerate(inputs):
        labels={}
        def apart(t):
            if not isinstance(t,rdflib.BNode):return t
            if t not in labels:labels[t]=rdflib.BNode()
            return labels[t]
        expected.extend(tuple(apart(t) for t in q) for q in quads)
        names.update(apart(g) for g in graphs)
    for e in c['exports']:
        actual,graphs=trig(text(e['path']),'urn:umf:merge:')
        assert isomorphic(encoded(expected,names),encoded(actual,graphs)),(c['id'],e['format'])
        results.append({'id':c['id'],'format':e['format'],'isomorphic':True,'distinctQuads':len(set(actual)),'namedGraphs':len(graphs)})
(base/'oracle-results.json').write_text(json.dumps({'rdflib':rdflib.__version__,'inputs':'exported source datasets; source parser differences remain recorded in baseline corpora','results':results},indent=2)+'\n')
print({'nativeMergeComparisons':len(results)})
