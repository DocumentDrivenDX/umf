"""Independent structural oracle; this is not native Delta transaction validation."""
import hashlib,json
from pathlib import Path
from jsonschema import Draft202012Validator,FormatChecker
base=Path('fixtures/delta/upstream')
schema=json.loads(Path('spec/extensions/delta-log/action-schema.json').read_text())
formats=FormatChecker()
@formats.checks('int64')
def int64(value):
    return isinstance(value,int) and not isinstance(value,bool) and -(1<<63)<=value<(1<<63)
validator=Draft202012Validator(schema,format_checker=formats)
expected=json.loads((base/'action-results.json').read_text())
manifest=json.loads((base/'manifest.json').read_text())
hashes={f['path']:f['sha256'] for f in manifest['files']}
results=[]
for case in expected['results']:
    raw=(base/case['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==hashes[case['path']]
    errors=[]
    for line,text in enumerate(raw.decode('utf-8').splitlines(),1):
        if text.strip():
            for error in validator.iter_errors(json.loads(text)):
                errors.append({'line':line,'path':list(error.absolute_path),'validator':error.validator})
    valid=not errors
    assert valid==case['valid'],(case['path'],errors,case)
    results.append({'path':case['path'],'valid':valid,'errors':errors})
report={'files':len(results),'valid':sum(r['valid'] for r in results),'invalid':sum(not r['valid'] for r in results),'scope':'Independent JSON Schema checks; no Delta runtime or transaction validation','results':results}
(base/'action-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print({k:v for k,v in report.items() if k!='results'})
