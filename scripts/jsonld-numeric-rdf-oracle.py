import json
from pathlib import Path
from pyld import jsonld
base=Path('fixtures/jsonld/to-rdf');results=[]
for c in json.loads((base/'authored/results.json').read_text())['results']:
    if 'numericPolicy' not in c['options'] and 'expectedValues' not in c:continue
    row={'id':c['id'],'umf':c['status'],'numericPolicy':c['options'].get('numericPolicy','strict'),'lossPolicy':c['options']['lossPolicy']}
    try:
        output=jsonld.to_rdf(json.loads(c['source']),{'base':c['inputs']['baseIRI'],'processingMode':'json-ld-1.1','format':'application/n-quads'})
        path=base/('native-'+c['id']+'.nq');path.write_text(output);quads=jsonld.JsonLdProcessor.parse_nquads(output);values=sorted(q['object']['value'] for graph in quads.values() for q in graph)
        row.update(native='accepted',path=str(path),values=values,expectedValuesEqual=values==sorted(c['expectedValues']) if 'expectedValues' in c else None)
    except Exception as exc:row.update(native='rejected',error=str(exc))
    results.append(row)
(base/'numeric-oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','loader':'Unmodified Python JSON integer/float parsing; comparisons retain literal lexical strings; UMF policy rejection is distinguished from native syntax rejection','results':results},indent=2)+'\n')
print({'cases':len(results),'nativeRejected':[r['id'] for r in results if r['native']=='rejected'],'literalDifferences':[r['id'] for r in results if r.get('expectedValuesEqual') is False]})
