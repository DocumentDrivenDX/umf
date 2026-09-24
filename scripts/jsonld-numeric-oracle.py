import json
from pathlib import Path
from pyld import jsonld
from jsonld_oracle_support import processor_input,exact,equivalent
cases=json.loads(Path('native/jsonld/examples/numeric-cases.json').read_text());evidence=json.loads(Path('fixtures/jsonld/numeric/results.json').read_text())['results'];results=[]
for c in cases:
    options={'base':'https://example.org/source','processingMode':'json-ld-1.1','documentLoader':lambda *args: (_ for _ in ()).throw(Exception('No retrieval'))}
    try:expanded=jsonld.expand(processor_input(c['source']),options)
    except Exception:
        assert c.get('blocked'),c['id'];results.append({'id':c['id'],'native':'rejected'});continue
    assert not c.get('blocked'),c['id'];assert equivalent(expanded,exact(c['expected'])),(c['id'],'native expected')
    saved=next(r for r in evidence if r['id']==c['id'])
    for e in saved['exports']:assert equivalent(expanded,exact(Path(e['path']).read_text())),(c['id'],e['format'])
    for e in saved['edits']:
        edited=processor_input(c['source']);edited['n']=processor_input(c['edit']['text']);expected=jsonld.expand(edited,options)
        assert equivalent(expected,exact(c['editedExpected'])) and equivalent(expected,exact(Path(e['path']).read_text())),(c['id'],'edit')
    results.append({'id':c['id'],'native':'accepted','exactEqual':True,'exports':len(saved['exports']),'edits':len(saved['edits'])})
Path('fixtures/jsonld/numeric/oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','numberLoader':'Python integers and selective Decimal; exact decimal comparisons','results':results},indent=2)+'\n')
print({'cases':len(results),'exports':sum(r.get('exports',0) for r in results),'edits':sum(r.get('edits',0) for r in results)})
