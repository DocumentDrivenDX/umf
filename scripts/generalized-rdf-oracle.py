import json,re,subprocess
from pathlib import Path
from pyld import jsonld
base=Path('fixtures/generalized-rdf');results=[]
compare='''import json,sys,rdflib
from rdflib import Graph,BNode,URIRef,Literal
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS=False
def graph(quads):
 g=Graph()
 def term(t):
  if t['termType']=='NamedNode':return URIRef(t['value'])
  if t['termType']=='BlankNode':return BNode('node-'+t['value'])
  if t['termType']=='DefaultGraph':return Literal('default graph')
  return Literal(t['value'],lang=t.get('language') or None,datatype=None if t.get('language') else URIRef(t['datatype']['value']),normalize=False)
 for i,q in enumerate({json.dumps(q,sort_keys=True):q for q in quads}.values()):
  for role,t in q.items():g.add((BNode('quad-'+str(i)),URIRef('urn:umf:role:'+role),term(t)))
 return g
a,b=json.load(sys.stdin);print(json.dumps(isomorphic(graph(a),graph(b))))
'''
def equivalent(a,b):return json.loads(subprocess.run(['.cache/rdf-venv/bin/python','-c',compare],input=json.dumps([a,b]),text=True,capture_output=True,check=True).stdout)
def convert(dataset):
 def term(t):
  if t['type']=='IRI':return {'termType':'NamedNode','value':t['value']}
  if t['type']=='blank node':return {'termType':'BlankNode','value':t['value'][2:]}
  return {'termType':'Literal','value':t['value'],'datatype':{'termType':'NamedNode','value':t['datatype']},**({'language':t['language']} if 'language' in t else {})}
 return [{**{k:term(q[k]) for k in ['subject','predicate','object']},'graph':{'termType':'DefaultGraph','value':''} if name=='@default' else term({'type':'blank node' if name.startswith('_:') else 'IRI','value':name})} for name,qs in dataset.items() for q in qs]
for c in json.loads((base/'results.json').read_text())['cases']:
 raw=Path(c['expectedPath']).read_text();prefix='urn:umf:predicate-placeholder:'
 if prefix in raw:raise ValueError('Placeholder collision')
 aliases={}
 def substitute(m):
  iri=prefix+str(len(aliases));aliases[iri]=m[2];return m[1]+' <'+iri+'>'
 parsed=jsonld.JsonLdProcessor.parse_nquads(re.sub(r'^(<[^>]*>|_:\S+)\s+(_:\S+)(?=\s)',substitute,raw,flags=re.M))
 for qs in parsed.values():
  for q in qs:
   if q['predicate']['value'] in aliases:q['predicate']={'type':'blank node','value':aliases[q['predicate']['value']]}
 expected=convert(parsed);contexts={x['url']:x for x in c['inputs']['contexts']}
 def loader(url,options=None):
  x=contexts[url];return {'contextUrl':None,'documentUrl':x.get('documentUrl',url),'document':json.loads(x['text'])}
 native=convert(jsonld.to_rdf(json.loads(Path(c['path']).read_text()),{'base':c['inputs']['baseIRI'],'processingMode':c['inputs']['processingMode'],'produceGeneralizedRdf':True,'documentLoader':loader}))
 candidate=json.loads(Path(c['exports'][0]['path']).read_text());again=json.loads(Path(c['againPath']).read_text())
 nativePath=base/(c['id']+'.native.json');expectedPath=base/(c['id']+'.expected.json');nativePath.write_text(json.dumps(native,indent=2)+'\n');expectedPath.write_text(json.dumps(expected,indent=2)+'\n')
 row={'id':c['id'],'nativePath':str(nativePath),'expectedPath':str(expectedPath),'nativeQuadCount':len(native),'expectedQuadCount':len(expected),'expectedEqual':equivalent(candidate,expected),'nativeEqual':equivalent(candidate,native),'reverseEqual':equivalent(candidate,again),'formatsEqual':all(equivalent(candidate,json.loads(Path(e['path']).read_text())) for e in c['exports'])};results.append(row)
(base/'oracle-results.json').write_text(json.dumps({'native':'PyLD 2.0.4 generalized dataset API; RDFLib 7.6.0 role reification/isomorphism','expectedParser':'Only blank predicate tokens are temporarily replaced with collision-checked IRIs for the standard N-Quads parser, then restored before comparison; no standard generalized-N-Quads support is claimed','results':results},indent=2)+'\n');print(results)
