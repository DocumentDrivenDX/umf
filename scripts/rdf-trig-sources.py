import hashlib,json,shutil,subprocess,sys
from pathlib import Path
from urllib.parse import urljoin
import rdflib
commit='369a90d1a60c021b746df2e411da0ff36258a758';root=Path('.cache/rdf-tests');folder='rdf/rdf11/rdf-trig';dest=Path('native/rdf/trig-sources')
if not root.exists():subprocess.run([sys.executable,'scripts/rdf-sources.py'],check=True)
assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==commit
if not (root/folder).exists():subprocess.run(['git','-C',str(root),'sparse-checkout','add',folder],check=True)
paths=[Path('LICENSE.md'),*sorted(p.relative_to(root) for p in (root/folder).iterdir() if p.suffix in ['.ttl','.nq','.trig'] or p.name=='README')];files=[]
for relative in paths:
    target=dest/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/relative,target);files.append({'path':str(target),'upstreamPath':str(relative),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
manifest=dest/folder/'manifest.ttl';g=rdflib.Graph().parse(manifest,format='turtle');mf=rdflib.Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#');cases=[]
assumed=str(next(g.objects(None,mf.assumedTestBase)))
for head in g.objects(None,mf.entries):
    for case in g.items(head):
        kind=str(g.value(case,rdflib.RDF.type));action=g.value(case,mf.action);result=g.value(case,mf.result);filename=str(action).split('/')[-1]
        cases.append({'id':str(case).split('#')[-1],'positive':'Negative' not in kind,'type':kind,'path':str(manifest.parent/filename),'baseIRI':urljoin(assumed,filename),**({'expectedPath':str(manifest.parent/str(result).split('/')[-1])} if result else {})})
(dest/'manifest.json').write_text(json.dumps({'repository':'w3c/rdf-tests','commit':commit,'files':files,'cases':cases},indent=2)+'\n')
from collections import Counter
print({'files':len(files),'cases':len(cases),'types':dict(Counter(c['type'].split('#')[-1] for c in cases))})
