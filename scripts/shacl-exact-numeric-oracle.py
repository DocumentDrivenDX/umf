import json,logging,warnings
from pathlib import Path
import rdflib,pyshacl
rdflib.NORMALIZE_LITERALS=False
logging.getLogger('rdflib.term').setLevel(logging.CRITICAL);warnings.filterwarnings('ignore')
rows=[]
for c in json.loads(Path('fixtures/shacl/exact-numeric-results.json').read_text())['cases']:
 try:
  conforms,report,_=pyshacl.validate(rdflib.Graph().parse(c['dataPath']),shacl_graph=rdflib.Graph().parse(c['shapesPath']),inference='none',do_owl_imports=False)
  rows.append({'id':c['id'],'conforms':conforms,'expected':c['expected'],'equal':conforms==c['expected'],'resultCount':len(list(report.objects(None,rdflib.SH.result)))})
 except Exception as e:rows.append({'id':c['id'],'error':str(e),'equal':False})
Path('fixtures/shacl/exact-numeric-oracle.json').write_text(json.dumps({'oracle':'PySHACL','version':pyshacl.__version__,'rdflib':rdflib.__version__,'results':rows},indent=2)+'\n');print({'cases':len(rows),'equal':sum(r['equal'] for r in rows),'differences':[r for r in rows if not r['equal']]})
