import json
from pathlib import Path
import rdflib
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS=False
results=[]
for name in ['primer-corrected','authored']:
 original=rdflib.Graph().parse('native/owl/'+name+'.ttl',format='turtle',publicID='https://example.org/')
 for fmt in ['json','yaml']:
  restored=rdflib.Graph().parse('fixtures/owl/'+name+'.'+fmt+'.ttl',format='turtle',publicID='https://example.org/')
  equal=isomorphic(original,restored)
  results.append({'file':name,'format':fmt,'originalTriples':len(original),'restoredTriples':len(restored),'isomorphic':equal})
  assert equal
Path('fixtures/owl/oracle-results.json').write_text(json.dumps({'oracle':'RDFLib','version':rdflib.__version__,'scope':'RDF graph isomorphism only, no OWL reasoning or validity claim','results':results},indent=2)+'\n');print(results)
