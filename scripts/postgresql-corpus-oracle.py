"""Check every regenerated upstream query with a separate pinned native wrapper."""
import json, hashlib
from pathlib import Path
import pglast
from pglast.parser import parse_sql_json
base=Path('fixtures/postgresql')
manifest=json.loads((base/'upstream/manifest.json').read_text())
for f in manifest['files']:
    assert hashlib.sha256((base/'upstream'/f['file']).read_bytes()).hexdigest()==f['sha256'],f['file']
cases=json.loads((base/'upstream/deparse-cases.json').read_text())
report=json.loads((base/'corpus-results.json').read_text())
assert report['adapterSha256']==hashlib.sha256(Path('native/postgresql/runtime.ts').read_bytes()).hexdigest()
assert report['cases']==len(cases)==manifest['cases']==416
assert report['roundTrips']==416 and report['blocked']==0
results={r['id']:r for r in report['results']}
assert len(results)==len(cases)
def clean(x):
    if isinstance(x,list):return [clean(v) for v in x]
    if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['location','stmt_location','stmt_len']}
    return x
statements=0
for c in cases:
    assert results[c['id']]['status']=='round-trip'
    original=clean(json.loads(parse_sql_json(c['sql'])))
    emitted=clean(json.loads(parse_sql_json(results[c['id']]['sql'])))
    assert original==emitted,c['id']
    statements+=len(original['stmts'])
evidence={'oracle':'pglast '+pglast.__version__,'postgresqlVersion':pglast.get_postgresql_version(),'wasmPostgresqlVersion':report['postgresql'],'upstream':manifest['commit'],'cases':len(cases),'statements':statements,'nativeAstEqualExcludingOffsets':True,'scope':'Original/regenerated query AST equality within the separate native wrapper. No catalog resolution or execution; PostgreSQL 17.7 differs from WASM 17.4.'}
(base/'corpus-oracle-results.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(f'PostgreSQL corpus: {len(cases)} cases / {statements} statements agree in the separate native oracle')
