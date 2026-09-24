import json,logging,warnings
from pathlib import Path
import rdflib,pyshacl
from rdflib import Graph,Namespace,RDF
rdflib.NORMALIZE_LITERALS=False
logging.getLogger('rdflib.term').setLevel(logging.CRITICAL);warnings.filterwarnings('ignore')
SH=rdflib.SH;MF=Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#')
source=json.loads(Path('fixtures/shacl/validation-results.json').read_text());results=[]
for i,c in enumerate(source['results']):
 sg=Graph().parse(c['shapes'],publicID=c['shapesBase']);dg=sg if c['shapes']==c['data'] else Graph().parse(c['data'],publicID=c['dataBase'])
 try:
  conforms,report,_=pyshacl.validate(dg,shacl_graph=sg,inference='none',advanced=False,allow_infos=False,allow_warnings=False,do_owl_imports=False)
  path=f'fixtures/shacl/validation/{i}.pyshacl.nt';report.serialize(path,format='nt')
  results.append({'id':c['id'],'status':'evaluated','conforms':conforms,'expectedEqual':conforms==c['expectedConforms'],'engineEqual':conforms==c.get('engineConforms'),'resultCount':len(list(report.objects(None,SH.result))),'reportPath':path})
 except Exception as e:results.append({'id':c['id'],'status':'blocked','error':str(e)})
Path('fixtures/shacl/validation-oracle-results.json').write_text(json.dumps({'oracle':'PySHACL','version':pyshacl.__version__,'rdflib':rdflib.__version__,'claim':'Conforms boolean only; detailed report equivalence not yet assessed','results':results},indent=2)+'\n');print({'cases':len(results),'evaluated':sum(r['status']=='evaluated' for r in results),'expectedEqual':sum(r.get('expectedEqual',False) for r in results),'differences':[r for r in results if not r.get('expectedEqual',False) or not r.get('engineEqual',False)]})

# Authored precision control, independent of the JS conversion guard.
numeric_conforms=pyshacl.validate(Graph().parse('native/shacl/numeric-data.ttl'),shacl_graph=Graph().parse('native/shacl/numeric-shapes.ttl'),inference='none')[0]
Path('fixtures/shacl/numeric-oracle.json').write_text(json.dumps({'oracle':'PySHACL','version':pyshacl.__version__,'conforms':numeric_conforms,'expectedConforms':False},indent=2)+'\n')
assert numeric_conforms is False
