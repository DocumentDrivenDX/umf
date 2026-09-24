import json,sys
from pathlib import Path
import rdflib
from rdflib import Graph, Literal
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS=False
def language_graph(graph):
    result=Graph()
    for s,p,o in graph:
        if isinstance(o,Literal) and o.language:
            o=Literal(str(o),lang=o.language.lower(),normalize=False)
        result.add((s,p,o))
    return result
rows=[]
for corpus in (['literals'] if '--literals' in sys.argv else ['probe','corpus']):
    for c in json.loads(Path('fixtures/rdfxml/'+corpus+'.json').read_text())['results']:
        native=Graph();error=None
        try: native.parse(data=c['input'],format='xml',publicID=c['baseIRI'])
        except Exception as e: error=str(e)
        native_accepted=error is None
        result={'corpus':corpus,'id':c['id'],'profile':c['profile'],'accepted':c['accepted'],'nativeAccepted':native_accepted,'nativeError':error,'acceptanceAgrees':c['accepted']==native_accepted}
        if c['accepted']:
            actual=Graph().parse(data=c['nquads'],format='nt')
            result['rawNativeGraphAgrees']=isomorphic(actual,native) if native_accepted else None
            result['nativeGraphAgrees']=isomorphic(language_graph(actual),language_graph(native)) if native_accepted else None
            if native_accepted and not result['rawNativeGraphAgrees']:
                result['nativeNTriples']=native.serialize(format='nt')
            if c.get('expected'):
                expected=Graph().parse(c['expected'],format='nt')
                result['officialGraphAgrees']=isomorphic(actual,expected)
                result['nativeOfficialGraphAgrees']=isomorphic(native,expected) if native_accepted else None
        rows.append(result)
summary={}
for profile in sorted(set(r['profile'] for r in rows)):
    subset=[r for r in rows if r['profile']==profile]
    summary[profile]={'cases':len(subset),'acceptanceDisagreements':sum(not r['acceptanceAgrees'] for r in subset),'nativeGraphDisagreements':sum(r.get('nativeGraphAgrees') is False for r in subset),'officialGraphDisagreements':sum(r.get('officialGraphAgrees') is False for r in subset)}
Path('fixtures/rdfxml/'+('literals-oracle' if '--literals' in sys.argv else 'oracle')+'.json').write_text(json.dumps({'oracle':'RDFLib '+rdflib.__version__,'literalNormalization':False,'comparison':'RDF language tags case-folded for term identity; raw graph results also retained; XML literal lexical forms not normalized','summary':summary,'results':rows},indent=2)+'\n')
print(json.dumps(summary,indent=2))
