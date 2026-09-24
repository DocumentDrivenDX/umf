import hashlib,json,shutil,subprocess
from pathlib import Path
import rdflib
commit='369a90d1a60c021b746df2e411da0ff36258a758'
root=Path('.cache/rdf-tests')
if not root.exists():
    subprocess.run(['git','clone','--depth','1','--filter=blob:none','--sparse','https://github.com/w3c/rdf-tests.git',str(root)],check=True)
    subprocess.run(['git','-C',str(root),'fetch','--depth','1','origin',commit],check=True)
    subprocess.run(['git','-C',str(root),'checkout','--detach',commit],check=True)
    subprocess.run(['git','-C',str(root),'sparse-checkout','set','rdf/rdf11/rdf-n-quads'],check=True)
assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==commit
folder='rdf/rdf11/rdf-n-quads';dest=Path('native/rdf/sources');dest.mkdir(parents=True,exist_ok=True)
paths=[Path('LICENSE.md'),*sorted(p.relative_to(root) for p in (root/folder).iterdir() if p.suffix in ['.ttl','.nq'] or p.name=='README')]
files=[]
for relative in paths:
    target=dest/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/relative,target);files.append({'path':str(target),'upstreamPath':str(relative),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
manifest=dest/folder/'manifest.ttl';g=rdflib.Graph().parse(manifest,format='turtle');mf=rdflib.Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#');rdf=rdflib.RDF
cases=[]
for head in g.objects(None,mf.entries):
    for case in g.items(head):
        kind=str(g.value(case,rdf.type));action=g.value(case,mf.action);name=str(g.value(case,mf.name));cases.append({'id':name,'positive':kind.endswith('PositiveSyntax'),'type':kind,'path':str(manifest.parent/str(action).split('/')[-1])})
(dest/'manifest.json').write_text(json.dumps({'repository':'w3c/rdf-tests','commit':commit,'files':files,'cases':cases},indent=2)+'\n')
print({'files':len(files),'cases':len(cases),'positive':sum(c['positive'] for c in cases)})
