import json
from pathlib import Path
import rdflib
rdflib.NORMALIZE_LITERALS=False
O=rdflib.OWL
results=[]
for row in json.loads(Path('fixtures/owl/expression-results.json').read_text()):
 g=rdflib.Graph().parse('native/owl/'+row['file']+'.ttl',format='turtle')
 ps=['intersectionOf','unionOf','oneOf','complementOf','datatypeComplementOf','inverseOf','onDatatype','onProperty','onProperties']
 nodes=set(s for p in ps for s in g.subjects(O[p],None));summary=[]
 for s in nodes:
  constructors=[p for p in ps[:7] if list(g.objects(s,O[p]))]
  if constructors:
   p=constructors[0];kind='datatypeRestriction' if p=='onDatatype' else p
   size=len(list(g.items(g.value(s,O.withRestrictions if p=='onDatatype' else O[p])))) if p in ['intersectionOf','unionOf','oneOf','onDatatype'] else 1
  else:
   kind='restriction';size=sum(bool(list(g.objects(s,O[p]))) for p in ['someValuesFrom','allValuesFrom','hasValue','hasSelf','minCardinality','maxCardinality','cardinality','minQualifiedCardinality','maxQualifiedCardinality','qualifiedCardinality','onClass','onDataRange'])
  summary.append({'kind':kind,'size':size})
 equal=sorted(summary,key=lambda x:(x['kind'],x['size']))==sorted(row['summary'],key=lambda x:(x['kind'],x['size']))
 assert equal
 results.append({'file':row['file'],'expressions':len(summary),'equal':equal})
Path('fixtures/owl/expression-oracle.json').write_text(json.dumps({'oracle':'RDFLib','version':rdflib.__version__,'scope':'Constructor counts and list/facet lengths; not recursive OWL parsing or reasoning','results':results},indent=2)+'\n');print(results)
