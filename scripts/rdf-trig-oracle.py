import json
from pathlib import Path
import rdflib
from rdflib.compare import isomorphic
from rdf_oracle_support import declared,term,parsed,encoded
base=Path('fixtures/rdf/trig');results=[]
from rdf_trig_oracle_support import trig,text
for c in json.loads((base/'results.json').read_text())['results']:
    try:native,names=trig(text(c['path']),c['baseIRI'])
    except Exception as exc:
        assert not c['positive'],(c['id'],str(exc));results.append({'id':c['id'],'native':'rejected'});continue
    if not c['positive']:results.append({'id':c['id'],'native':'accepted-negative'});continue
    model=declared(c['terms']);model_names=[term(g) for g in c['namedGraphs']]
    source_match=isomorphic(encoded(native,names),encoded(model,model_names))
    if c.get('nquadsPath'):assert isomorphic(encoded(model),encoded(parsed(text(c['nquadsPath'])))),(c['id'],'N-Quads')
    if c.get('expectedPath'):assert isomorphic(encoded(model),encoded(parsed(text(c['expectedPath'])))),(c['id'],'Official quads')
    # Inventory names are independently checked even when native literal/base behavior differs.
    assert isomorphic(encoded([],names),encoded([],model_names)),(c['id'],'Graph inventory')
    edits=[]
    for export in c['exports']:
        expected=declared(c['terms']);s,p,o,g=expected[c['editIndex']];expected[c['editIndex']]=(s,p,rdflib.Literal('UMF reviewed literal',datatype=rdflib.XSD.string,normalize=False),g)
        actual,graphs=trig(text(export['path']),c['baseIRI']);assert isomorphic(encoded(expected,model_names),encoded(actual,graphs)),(c['id'],export['format']);edits.append(export['format'])
    for rename in c.get('renames',[]):
        actual,graphs=trig(text(rename['path']),c['baseIRI']);renamed_names=[rdflib.URIRef('urn:example:renamed') if g==rdflib.URIRef('urn:example:empty') else g for g in model_names]
        assert isomorphic(encoded(model,renamed_names),encoded(actual,graphs)),(c['id'],'Empty graph rename')
    results.append({'renames':len(c.get('renames',[])),'id':c['id'],'native':'accepted','nativeSourceIsomorphic':source_match,'graphInventoryIsomorphic':True,'officialExpectedQuads':bool(c.get('expectedPath')),'namedGraphs':len(set(model_names)),'edits':edits})
(base/'oracle-results.json').write_text(json.dumps({'rdflib':rdflib.__version__,'literalNormalization':False,'graphObserver':'RDFSink.newGraph','results':results},indent=2)+'\n')
from collections import Counter
print({'outcomes':dict(Counter(r['native'] for r in results)),'sourceMismatches':[r['id'] for r in results if r.get('nativeSourceIsomorphic') is False],'expectedQuads':sum(r.get('officialExpectedQuads',False) for r in results),'edits':sum(len(r.get('edits',[])) for r in results)})
