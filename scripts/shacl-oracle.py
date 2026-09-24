"""Independent RDFLib paths, authored expressions; never translates UMF path AST."""
import json
from pathlib import Path
import rdflib
from rdflib import Graph, Namespace, URIRef, Literal
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS=False
E=Namespace('https://example.org/')
p,q=E.p,E.q
paths={'predicate':p,'inverse':~p,'sequence':p/q,'alternative':p|q,'star':p*'*','plus':p*'+','optional':p*'?', 'inverseSequence':~(p/q),'nested':(p*'+')/(q|~q),'doubleInverse':~(~p),'inverseStar':~(p*'*'),'nullablePlus':(E.absent*'?')*'+','sequenceWithAnnotation':p/q}
def term(n):
 if isinstance(n,URIRef):return {'kind':'iri','value':str(n)}
 if isinstance(n,Literal):return {'kind':'literal','value':str(n),'datatype':str(n.datatype or (rdflib.RDF.langString if n.language else rdflib.XSD.string)),**({'language':n.language} if n.language else {})}
 raise ValueError('Authored data comparison expects named/literal results')
def canon(v):return json.dumps(v,sort_keys=True)
g=Graph().parse('native/shacl/data.ttl');shapes=Graph().parse('native/shacl/paths.ttl')
rows=[]
for case in json.loads(Path('fixtures/shacl/results.json').read_text())['results']:
 native=[term(v) for v in set(g.objects(E[case['focus']],paths[case['name']]))]
 rows.append({'name':case['name'],'focus':case['focus'],'equal':set(map(canon,native))==set(map(canon,case['values'])),'native':native})
formats={fmt:isomorphic(shapes,Graph().parse(f'fixtures/shacl/{fmt}.ttl')) for fmt in ['json','yaml']}
expected=Graph().parse('native/shacl/paths.ttl');expected.set((E.predicate,rdflib.SH.minCount,Literal('2',datatype=rdflib.XSD.integer)))
edit=isomorphic(expected,Graph().parse('fixtures/shacl/edited.ttl'))
out={'oracle':'RDFLib','version':rdflib.__version__,'normalization':False,'results':rows,'roundTrips':formats,'edit':edit}
Path('fixtures/shacl/oracle-results.json').write_text(json.dumps(out,indent=2)+'\n')
assert all(r['equal'] for r in rows) and all(formats.values()) and edit,out
print({'cases':len(rows),'equal':True,'roundTrips':formats,'edit':edit})
