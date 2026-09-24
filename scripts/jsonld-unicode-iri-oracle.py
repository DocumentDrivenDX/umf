import json,subprocess
from pathlib import Path
from pyld import jsonld
base=Path('fixtures/jsonld/to-rdf');results=[]
compare='''import json,sys,rdflib
from rdflib import Dataset,BNode
rdflib.NORMALIZE_LITERALS=False
def terms(text):
 d=Dataset();d.parse(data=text,format='nquads')
 if any(isinstance(t,BNode) for q in d.quads() for t in q):raise ValueError('Unexpected blank node in named-IRI controls')
 return set(d.quads())
a,b=json.load(sys.stdin);result={}
try:result['rawEqual']=terms(a)==terms(b)
except Exception as exc:result['rawError']=str(exc)
def escaped(s):return ''.join(((chr(92)+'u%04x')%ord(c)) if ord(c) in [0xa0,0x2003,0x2028,0x3000] else c for c in s)
result['escapedTermsEqual']=terms(escaped(a))==terms(escaped(b));print(json.dumps(result))
'''
for c in json.loads((base/'authored/results.json').read_text())['results']:
    if not c['id'].startswith('unicode-'):continue
    row={'id':c['id'],'exports':[]}
    try:
        def loader(url,options=None):raise ValueError('No supplied context '+url)
        output=jsonld.to_rdf(json.loads(c['source']),{'base':c['inputs']['baseIRI'],'processingMode':'json-ld-1.1','format':'application/n-quads','documentLoader':loader})
        path=base/('native-'+c['id']+'.nq');path.write_text(output);row.update(native='accepted',path=str(path))
        for e in c['exports']:
            result=subprocess.run(['.cache/rdf-venv/bin/python','-c',compare],input=json.dumps([output,Path(e['path']).read_text()]),text=True,capture_output=True,check=True)
            row['exports'].append({'format':e['format'],**json.loads(result.stdout)})
    except Exception as exc:row.update(native='rejected',error=str(exc))
    expected=c['roundtrip'][0];node=expected['@graph'][0];prop=next(k for k in node if k not in ['@id','urn:value']);literal=node['urn:value'][0]
    nq=f'<{node["@id"]}> <{prop}> <{node[prop][0]["@id"]}> <{expected["@id"]}> .\n<{node["@id"]}> <urn:value> "value"^^<{literal["@type"]}> <{expected["@id"]}> .\n'
    path=base/(c['id']+'.expected.nq');path.write_text(nq);row['expectedPath']=str(path);row['expectedComparisons']=[]
    for e in c['exports']:
        result=subprocess.run(['.cache/rdf-venv/bin/python','-c',compare],input=json.dumps([nq,Path(e['path']).read_text()]),text=True,capture_output=True,check=True)
        row['expectedComparisons'].append({'format':e['format'],**json.loads(result.stdout)})
    results.append(row)
(base/'unicode-iri-oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','comparison':'RDFLib 7.6.0 raw parse attempts plus equivalent Unicode-escaped N-Quads terms; no blank nodes expected; literal normalization disabled','results':results},indent=2)+'\n')
print({'cases':len(results),'nativeAccepted':sum(r['native']=='accepted' for r in results),'expectedComparisons':sum(len(r['expectedComparisons']) for r in results),'expectedEqual':all(e['escapedTermsEqual'] for r in results for e in r['expectedComparisons'])})
