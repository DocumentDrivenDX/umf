import hashlib,json,shutil,subprocess
from pathlib import Path
from rdflib import Graph, Namespace, RDF, URIRef
repo=Path('.cache/rdf-tests')
commit=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
assert commit=='369a90d1a60c021b746df2e411da0ff36258a758'
root=repo/'rdf/rdf11/rdf-xml'
target=Path('native/rdfxml/sources')
base='https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-xml/'
MF=Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#')
graph=Graph().parse(root/'manifest.ttl',format='turtle',publicID=base+'manifest.ttl')
manifest=URIRef(base+'manifest.ttl')
cases=[]
paths={'manifest.ttl'}
for entry in graph.items(graph.value(manifest,MF.entries)):
    action=str(graph.value(entry,MF.action));result=graph.value(entry,MF.result)
    assert action.startswith(base)
    path=action[len(base):];paths.add(path)
    expected=str(result)[len(base):] if result else None
    if expected: paths.add(expected)
    kind=str(graph.value(entry,RDF.type)).split('#')[-1]
    assert kind in ['TestXMLEval','TestXMLNegativeSyntax']
    cases.append({'id':str(graph.value(entry,MF.name)),'path':str(target/path),'baseIRI':action,'positive':kind=='TestXMLEval','expected':str(target/expected) if expected else None})
files=[]
for path in sorted(paths):
    dst=target/path;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/path,dst)
    files.append({'path':str(dst),'upstreamPath':'rdf/rdf11/rdf-xml/'+path,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
shutil.copyfile(repo/'LICENSE.md',target/'LICENSE.md')
files.append({'path':str(target/'LICENSE.md'),'upstreamPath':'LICENSE.md','sha256':hashlib.sha256((target/'LICENSE.md').read_bytes()).hexdigest()})
(target/'sources.json').write_text(json.dumps({'repository':'w3c/rdf-tests','commit':commit,'files':files,'cases':cases},indent=2)+'\n')
print({'cases':len(cases),'files':len(files)})
