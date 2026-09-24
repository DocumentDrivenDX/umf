import json
from pathlib import Path
from pyld import jsonld
from jsonld_oracle_support import exact,equivalent
base=Path('fixtures/jsonld/from-rdf/authored');results=[]
for c in json.loads((base/'results.json').read_text())['results']:
    options={k:v for k,v in c['options'].items() if k in ['processingMode','useNativeTypes','useRdfType','rdfDirection']}
    row={'id':c['id'],'umf':c['status'],'oracleInput':'explicit nonempty N-Quads subset' if 'oracleInput' in c else 'original N-Quads source'}
    try:
        output=jsonld.from_rdf(c.get('oracleInput',c['source']),options)
        row.update(native='accepted',expectedEqual=equivalent(output,exact(c['expected'])) if 'expected' in c else None,exports=[{'format':e['format'],'nativeEqual':equivalent(output,exact(Path(e['path']).read_text()))} for e in c['exports']])
    except Exception as exc:row.update(native='rejected',error=str(exc))
    results.append(row)
(base/'oracle-results.json').write_text(json.dumps({'processor':'PyLD 2.0.4','comparison':'Unmodified native RDF conversion, exact output comparison; empty graph inventory cannot be supplied via N-Quads','results':results},indent=2)+'\n')
print([(r['id'],r['native'],r.get('expectedEqual')) for r in results])
