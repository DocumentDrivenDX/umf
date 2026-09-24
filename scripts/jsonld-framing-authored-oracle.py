import json
from pathlib import Path
from pyld import jsonld
from jsonld_oracle_support import exact,processor_input,equivalent as compare
def equivalent(a,b):return compare(a,b,literal=True)
base=Path('fixtures/jsonld/framing/authored');results=[]
for c in json.loads((base/'results.json').read_text())['results']:
    inputs=c['inputs'];contexts={r['url']:r for r in inputs.get('contexts',[])}
    def loader(url,options=None):
        if url not in contexts:raise Exception('No supplied context '+url)
        r=contexts[url];return {'contextUrl':None,'documentUrl':r.get('documentUrl',url),'document':processor_input(r['text'])}
    options={'processingMode':inputs.get('processingMode','json-ld-1.1'),'compactToRelative':c['options'].get('compactToRelative',True),'base':inputs['baseIRI'],'documentLoader':loader,'compactArrays':c['options'].get('compactArrays',True)}
    if 'expandContext' in inputs:options['expandContext']=processor_input(inputs['expandContext'])
    ctx=processor_input(c['options']['frame'])
    options.update({k:v for k,v in c['options'].items() if k not in ['frame','lossPolicy']})
    row={'id':c['id'],'umf':c['status'],'lossPolicy':c['options']['lossPolicy']}
    try:
        output=jsonld.frame(processor_input(c['source']),ctx,options)
        row.update(native='accepted',expectedEqual=equivalent(output,exact(c['expected'])) if 'expected' in c else None,exports=[{'format':e['format'],'nativeEqual':equivalent(output,exact(Path(e['path']).read_text()))} for e in c['exports']])
        if c.get('edit'):
            # Authored numeric array pointer; replace before processing using exact loader.
            source=processor_input(c['source']);source['urn:p'][0]=processor_input(c['edit']['text'])
            edited=jsonld.frame(source,ctx,options)
            row['editedEqual']=equivalent(edited,exact(c['editedExpected']))
    except Exception as exc:row.update(native='rejected',error=str(exc))
    results.append(row)
(base/'oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','numberLoader':'Exact integer/selective Decimal input; exact comparisons; no processor changes','results':results},indent=2)+'\n')
print([(r['id'],r['native'],r.get('expectedEqual'),r.get('editedEqual')) for r in results])
