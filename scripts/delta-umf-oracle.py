import json,copy
from pathlib import Path
from deltalake import Schema
base=Path('fixtures/delta');cases=json.loads((base/'cases.json').read_text());baseline={r['id']:r for r in json.loads((base/'capability-results.json').read_text())['results']};results=[]
for c in cases:
 if c['id'] in ['missing-field-defaults','array-missing-nullability']:continue
 text=(base/'umf'/(c['id']+'.json')).read_text();assert json.loads(text)==c['input']
 try:output=json.loads(Schema.from_json(text).to_json());status='accepted'
 except Exception:output=None;status='rejected'
 expected=baseline[c['id']];assert status==expected['status']
 if status=='accepted':assert output==expected['output']
 results.append({'id':c['id'],'status':status})
text=(base/'umf/edited.json').read_text();expected=copy.deepcopy(next(c['input'] for c in cases if c['id']=='nested'));expected['fields'][0]['type']['fields'][0]['type']='long';assert json.loads(text)==expected;assert json.loads(Schema.from_json(text).to_json())==expected
assert len(results)==37
(base/'umf-oracle-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4','nativeComparisons':37,'nativeEditComparisons':1,'results':results},indent=2)+'\n');print({'nativeComparisons':37,'nativeEditComparisons':1})
