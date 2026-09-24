import json
from pathlib import Path
import rdflib
rdflib.NORMALIZE_LITERALS=False
O=rdflib.OWL;E=rdflib.Namespace('https://example.org/')
rows=json.loads(Path('fixtures/owl/annotation-case-results.json').read_text());out=[]
for case in sorted(set(r['id'] for r in rows)):
 g=rdflib.Graph().parse('native/owl/annotation-cases/'+case+'.ttl',format='turtle');main=next(g.triples((None,E.p,None)));roots=0;malformed=0
 for n in set(g.subjects(rdflib.RDF.type,O.Axiom))|set(g.subjects(rdflib.RDF.type,O.Annotation)):
  kinds=set(g.objects(n,rdflib.RDF.type))&{O.Axiom,O.Annotation}
  ss=list(g.objects(n,O.annotatedSource));ps=list(g.objects(n,O.annotatedProperty));os=list(g.objects(n,O.annotatedTarget))
  if len(kinds)!=1 or len(ss)!=1 or len(ps)!=1 or len(os)!=1 or isinstance(ss[0],rdflib.Literal) or not isinstance(ps[0],rdflib.URIRef):malformed+=1;continue
  if O.Axiom in kinds and (ss[0],ps[0],os[0])==main:roots+=1
 for row in [r for r in rows if r['id']==case]:assert (roots,malformed)==(row['roots'],row['malformed'])
 out.append({'id':case,'roots':roots,'malformed':malformed,'equal':True})
Path('fixtures/owl/annotation-case-oracle.json').write_text(json.dumps({'oracle':'RDFLib','version':rdflib.__version__,'scope':'Exact RDF term matching and malformed reification classification; duplicate occurrence counts are outside RDF graph-set comparison','results':out},indent=2)+'\n');print({'cases':len(out),'equal':len(out)})
