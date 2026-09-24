import json
from pathlib import Path
from pyld import jsonld
base=Path('fixtures/jsonld/to-rdf');results=[]
def normalized(text):
    return jsonld.normalize(text,{'inputFormat':'application/n-quads','format':'application/n-quads','algorithm':'URDNA2015'})
for c in json.loads((base/'results.json').read_text())['cases']:
    inputs=c['inputs'];contexts={r['url']:r for r in inputs['contexts']}
    def loader(url,options=None):
        if url not in contexts:raise Exception('No supplied context '+url)
        r=contexts[url];return {'contextUrl':None,'documentUrl':r.get('documentUrl',url),'document':json.loads(r['text'])}
    options={'base':inputs['baseIRI'],'processingMode':inputs['processingMode'],'documentLoader':loader,'format':'application/n-quads','rdfDirection':c['options']['rdfDirection'],'produceGeneralizedRdf':c['nativeOptions'].get('produceGeneralizedRdf',False)}
    if 'expandContext' in inputs:options['expandContext']=json.loads(inputs['expandContext'])
    row={'id':c['id'],'umf':c['status'],'exports':[]}
    try:output=jsonld.to_rdf(json.loads(Path(c['path']).read_text()),options);row['native']='accepted'
    except Exception as exc:output=None;row.update(native='rejected',error=str(exc))
    if output is not None:
        native_path=base/('native-'+c['id']+'.nq');native_path.write_text(output);row['nativePath']=str(native_path)
    expected=Path(c['expectedPath']).read_text() if c.get('expectedPath') else None
    for e in c['exports']:
        actual=Path(e['path']).read_text();entry={'format':e['format']}
        try:
            entry.update(nativeEqual=normalized(actual)==normalized(output) if output is not None else None,officialEqual=normalized(actual)==normalized(expected) if expected is not None else None)
        except Exception as exc:entry['comparisonError']=str(exc)
        row['exports'].append(entry)
    results.append(row)
(base/'oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','comparison':'URDNA2015 dataset normalization; unmodified native JSON numeric parsing; generalized RDF may be non-comparable','results':results},indent=2)+'\n')
print({'cases':len(results),'nativeAccepted':sum(r['native']=='accepted' for r in results),'acceptanceDifferences':[r['id'] for r in results if (r['native']=='accepted')!=(r['umf']=='candidate')],'officialMismatches':[r['id'] for r in results if any(e.get('officialEqual') is False for e in r['exports'])],'nativeMismatches':[r['id'] for r in results if any(e.get('nativeEqual') is False for e in r['exports'])],'comparisonErrors':[r['id'] for r in results if any('comparisonError' in e for e in r['exports'])]})
