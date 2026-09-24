import json,logging,warnings
from pathlib import Path
from rdflib import Graph,Namespace,RDF
logging.getLogger('rdflib.term').setLevel(logging.CRITICAL);warnings.filterwarnings('ignore')
root=Path('native/shacl/sources');manifest=json.loads((root/'manifest.json').read_text());files={f['url']:str(root/f['path']) for f in manifest['files']}
MF=Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#');SHT=Namespace('http://www.w3.org/ns/shacl-test#')
cases=[]
for f in manifest['files']:
 if '/tests/core/' not in f['path'] or not f['path'].endswith('.ttl'):continue
 g=Graph().parse(root/f['path'],publicID=f['url'])
 for case in g.subjects(RDF.type,SHT.Validate):
  action=g.value(case,MF.action);sg=str(g.value(action,SHT.shapesGraph));dg=str(g.value(action,SHT.dataGraph));expected=g.value(case,MF.result)
  cases.append({'id':str(case),'manifest':files[f['url']],'baseIRI':f['url'],'shapes':files[sg],'shapesBase':sg,'data':files[dg],'dataBase':dg,'expectedConforms':str(g.value(expected,Namespace('http://www.w3.org/ns/shacl#').conforms))=='true'})
Path('fixtures/shacl/validation-inputs.json').write_text(json.dumps({'revision':manifest['revision'],'cases':cases},indent=2)+'\n');print({'cases':len(cases)})
