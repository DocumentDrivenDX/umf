import json
from pathlib import Path
import rdflib
from rdflib import Graph,URIRef,Literal
rdflib.NORMALIZE_LITERALS=False
source=json.loads(Path('fixtures/shacl/target-results.json').read_text())
SH=rdflib.SH
ns={'rdf':rdflib.RDF,'rdfs':rdflib.RDFS}
def term(n):
 if isinstance(n,URIRef):return {'kind':'iri','value':str(n)}
 if isinstance(n,Literal):return {'kind':'literal','value':str(n),'datatype':str(n.datatype or (rdflib.RDF.langString if n.language else rdflib.XSD.string)),**({'language':n.language} if n.language else {})}
 raise ValueError('This matrix requires a scoped blank-node comparison for blank targets')
def canonical(v):return json.dumps(v,sort_keys=True)
results=[]
for case in source['cases']:
 sg=Graph().parse(case['shapes'],publicID=case['baseIRI']);dg=Graph().parse(case['data'],publicID=case['baseIRI'])
 for selection in case['results']:
  shape=URIRef(selection['shape']['value']);nodes=set(sg.objects(shape,SH.targetNode));classes=set(sg.objects(shape,SH.targetClass))
  def instance(g,node,cls):
   return bool(g.query('ASK { ?node rdf:type/rdfs:subClassOf* ?cls }',initNs=ns,initBindings={'node':node,'cls':cls}))
  if (instance(sg,shape,SH.NodeShape) or instance(sg,shape,SH.PropertyShape)) and instance(sg,shape,rdflib.RDFS.Class):classes.add(shape)
  for cls in classes:
   nodes.update(row[0] for row in dg.query('SELECT DISTINCT ?node WHERE { ?node rdf:type/rdfs:subClassOf* ?cls }',initNs=ns,initBindings={'cls':cls}))
  for p in sg.objects(shape,SH.targetSubjectsOf):nodes.update(dg.subjects(p,None))
  for p in sg.objects(shape,SH.targetObjectsOf):nodes.update(dg.objects(None,p))
  native=[term(n) for n in nodes];equal=set(map(canonical,native))==set(map(canonical,selection['values']))
  results.append({'source':case['shapes'],'shape':str(shape),'native':native,'equal':equal})
out={'oracle':'RDFLib SPARQL 1.1 property paths and graph queries','version':rdflib.__version__,'claim':'Independent target sets, not official validation reports','results':results}
Path('fixtures/shacl/target-oracle-results.json').write_text(json.dumps(out,indent=2)+'\n');assert all(r['equal'] for r in results);print({'selections':len(results),'equal':True})
