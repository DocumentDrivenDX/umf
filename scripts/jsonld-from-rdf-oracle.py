import json
from pathlib import Path
from pyld import jsonld
from jsonld_oracle_support import exact,equivalent
base=Path('fixtures/jsonld/from-rdf');results=[]
for c in json.loads((base/'results.json').read_text())['cases']:
    options={k:c['options'][k] for k in ['processingMode','useNativeTypes','useRdfType','rdfDirection']}
    try:output=jsonld.from_rdf(Path(c['path']).read_text(),options)
    except Exception as exc:results.append({'id':c['id'],'native':'rejected','umf':c['status'],'error':str(exc)});continue
    results.append({'id':c['id'],'native':'accepted','umf':c['status'],'officialExpected':equivalent(output,exact(Path(c['expectedPath']).read_text())) if c.get('expectedPath') else None,'exports':[{'format':e['format'],'nativeEqual':equivalent(output,exact(Path(e['path']).read_text())),'officialEqual':equivalent(exact(Path(e['path']).read_text()),exact(Path(c['expectedPath']).read_text()))} for e in c['exports']]})
(base/'oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','comparison':'Exact JSON numeric comparison; RDF input remains lexical strings; PyLD JSON-literal parsing remains unmodified','results':results},indent=2)+'\n')
print({'nativeAccepted':sum(r['native']=='accepted' for r in results),'acceptanceDifferences':[r['id'] for r in results if (r['native']=='accepted')!=(r['umf']=='candidate')],'outputDifferences':[r['id'] for r in results if any(not e['nativeEqual'] for e in r.get('exports',[]))]})
