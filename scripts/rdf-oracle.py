import json
from pathlib import Path
import rdflib
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS=False
base=Path('fixtures/rdf/nquads');fixture=json.loads((base/'results.json').read_text());results=[]
from rdf_oracle_support import declared,parsed,encoded
for c in fixture['results']:
    raw=Path(c['path']).read_text()
    try:native=parsed(raw)
    except Exception as exc:
        assert not c['positive'],(c['id'],str(exc));results.append({'id':c['id'],'native':'rejected','error':type(exc).__name__});continue
    if not c['positive']:
        results.append({'id':c['id'],'native':'accepted-negative','note':'Official negative expectation takes precedence over this parser acceptance'});continue
    assert isomorphic(encoded(native),encoded(declared(c['terms']))),c['id']
    edited=[]
    for export in c['exports']:
        expected=list(declared(c['terms']));s,p,o,g=expected[c['editIndex']];expected[c['editIndex']]=(s,p,rdflib.Literal('UMF reviewed literal',datatype=rdflib.XSD.string,normalize=False),g)
        assert isomorphic(encoded(expected),encoded(parsed(Path(export['path']).read_text()))),(c['id'],export['format'])
        edited.append(export['format'])
    results.append({'id':c['id'],'native':'accepted','datasetIsomorphic':True,'edits':edited})
(base/'oracle-results.json').write_text(json.dumps({'rdflib':rdflib.__version__,'literalNormalization':False,'results':results},indent=2)+'\n')
from collections import Counter
print({'outcomes':dict(Counter(r['native'] for r in results)),'edits':sum(len(r.get('edits',[])) for r in results)})
