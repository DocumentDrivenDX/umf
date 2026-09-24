import json
from pathlib import Path
import rdflib
rdflib.NORMALIZE_LITERALS=False
O=rdflib.OWL;g=rdflib.Graph().parse('native/owl/annotations.ttl',format='turtle');v=json.loads(Path('fixtures/owl/annotations.json').read_text());E=rdflib.Namespace('https://example.org/')
def matches(s,p,o,kind):
 return [n for n in g.subjects(rdflib.RDF.type,kind) if list(g.objects(n,O.annotatedSource))==[s] and list(g.objects(n,O.annotatedProperty))==[p] and list(g.objects(n,O.annotatedTarget))==[o]]
roots=matches(E.A,rdflib.RDFS.subClassOf,E.B,O.Axiom);todo=roots[:];seen=set();records=[]
while todo:
 n=todo.pop(0)
 if n in seen:continue
 seen.add(n);children=[]
 for p,o in g.predicate_objects(n):
  if p in [O.annotatedSource,O.annotatedProperty,O.annotatedTarget] or p==rdflib.RDF.type and o in [O.Axiom,O.Annotation]:continue
  children+=matches(n,p,o,O.Annotation)
 records.append({'node':str(n),'nested':sorted(set(map(str,children)))});todo+=children
actual=[{'node':r['node']['value'],'nested':sorted(n['value'] for n in r['nested'])} for r in v['records']]
assert sorted(records,key=lambda r:r['node'])==sorted(actual,key=lambda r:r['node'])
assert sorted(map(str,roots))==sorted(n['value'] for n in v['roots'])
Path('fixtures/owl/annotations-oracle.json').write_text(json.dumps({'oracle':'RDFLib','version':rdflib.__version__,'scope':'Exact RDF reification matching and nested links, not OWL axiom validity','roots':len(roots),'records':len(records),'equal':True},indent=2)+'\n');print({'roots':len(roots),'records':len(records),'equal':True})
