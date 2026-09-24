import json,math
from decimal import Decimal
from pathlib import Path
from pyld import jsonld
base=Path('fixtures/jsonld/framing');results=[]
from jsonld_oracle_support import exact,processor_input,equivalent as compare
def equivalent(a,b):return compare(a,b,literal=True)
for c in json.loads((base/'results.json').read_text())['cases']:
    inputs=c['inputs'];contexts={r['url']:r for r in inputs['contexts']};used=[]
    def loader(url,options=None):
        if url not in contexts:raise Exception('No supplied context '+url)
        used.append(url);r=contexts[url];return {'contextUrl':None,'documentUrl':r.get('documentUrl',url),'document':processor_input(r['text'])}
    options={'base':inputs['baseIRI'],'processingMode':inputs['processingMode'],'documentLoader':loader}
    if 'expandContext' in inputs:options['expandContext']=processor_input(inputs['expandContext'])
    options.update({k:v for k,v in c['options'].items() if k not in ['frame','lossPolicy']})
    try:expanded=jsonld.frame(processor_input(Path(c['path']).read_text()),processor_input(c['options']['frame']),options)
    except Exception as exc:
        results.append({'id':c['id'],'native':'rejected','error':str(exc),'umf':c['status']});continue
    row={'id':c['id'],'native':'accepted','umf':c['status'],'officialExpected':equivalent(expanded,exact(Path(c['expectedPath']).read_text())) if c.get('expectedPath') else None,'exports':[]}
    for e in c['exports']:
        output=exact(Path(e['path']).read_text());row['exports'].append({'format':e['format'],'nativeEqual':equivalent(expanded,output),'officialEqual':equivalent(output,exact(Path(c['expectedPath']).read_text())) if c.get('expectedPath') else None})
    results.append(row)
(base/'oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','numberLoader':'Python integers and Decimal for values not preserved by float JSON serialization; comparison uses Decimal','results':results},indent=2)+'\n')
from collections import Counter
print({'outcomes':dict(Counter(r['native'] for r in results)),'disagreements':[r['id'] for r in results if (r['native']=='accepted')!=(r['umf']=='candidate')],'nativeOutputDifferences':[r['id'] for r in results if any(e['nativeEqual'] is False for e in r.get('exports',[]))]})
