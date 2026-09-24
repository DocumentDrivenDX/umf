import json
from pathlib import Path
import rdflib
from rdflib.compare import isomorphic
from rdf_oracle_support import declared,parsed,encoded
base=Path('fixtures/rdf/turtle');results=[]
def turtle(text,base_iri):
    g=rdflib.Graph().parse(data=text,format='turtle',publicID=base_iri)
    def normalize(o):
        if not isinstance(o,rdflib.Literal):return o
        if o.language:return rdflib.Literal(str(o),lang=o.language.lower(),normalize=False)
        if o.datatype is None:return rdflib.Literal(str(o),datatype=rdflib.XSD.string,normalize=False)
        return o
    return [(s,p,normalize(o),None) for s,p,o in g]
for c in json.loads((base/'results.json').read_bytes().decode('utf-8'))['results']:
    try:native=turtle(Path(c['path']).read_bytes().decode('utf-8'),c['baseIRI'])
    except Exception as exc:
        assert not c['positive'],(c['id'],str(exc));results.append({'id':c['id'],'native':'rejected','error':type(exc).__name__});continue
    if not c['positive']:
        results.append({'id':c['id'],'native':'accepted-negative'});continue
    source_match=isomorphic(encoded(native),encoded(declared(c['terms'])))
    assert isomorphic(encoded(declared(c['terms'])),encoded(parsed(Path(c['outputPath']).read_bytes().decode('utf-8')))),(c['id'],'N-Quads export')
    if c.get('expectedPath'):assert isomorphic(encoded(declared(c['terms'])),encoded(parsed(Path(c['expectedPath']).read_bytes().decode('utf-8')))),(c['id'],'Official expected graph')
    edits=[]
    for export in c['exports']:
        expected=declared(c['terms']);s,p,o,g=expected[c['editIndex']];expected[c['editIndex']]=(s,p,rdflib.Literal('UMF reviewed literal',datatype=rdflib.XSD.string,normalize=False),g)
        assert isomorphic(encoded(expected),encoded(turtle(Path(export['path']).read_bytes().decode('utf-8'),c['baseIRI']))),(c['id'],export['format'])
        edits.append(export['format'])
    results.append({'id':c['id'],'native':'accepted','datasetIsomorphic':True,'nativeSourceIsomorphic':source_match,**({'nativeSourceTriples':sorted([[s.n3(),p.n3(),o.n3()] for s,p,o,g in native])} if not source_match else {}),'officialExpectedGraph':bool(c.get('expectedPath')),'edits':edits})
(base/'oracle-results.json').write_text(json.dumps({'rdflib':rdflib.__version__,'literalNormalization':False,'results':results},indent=2)+'\n')
from collections import Counter
print({'outcomes':dict(Counter(r['native'] for r in results)),'sourceMismatches':[r['id'] for r in results if r.get('nativeSourceIsomorphic') is False],'expectedGraphs':sum(r.get('officialExpectedGraph',False) for r in results),'edits':sum(len(r.get('edits',[])) for r in results)})
