#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent additive non-ASCII regex escape admission census; no candidate."""
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1];cases=[];seen=set()
def add(pattern,family):
 key=tuple(pattern)
 if key not in seen:seen.add(key);cases.append({'id':f'hex-{len(cases):05d}','family':family,'operation':'compile','patternCodepoints':pattern})
for escape,width in [('x',2),('u',4),('U',8)]:
 base=list(map(ord,('0'*(width-2)+'41')))
 for bracketed in [False,True]:
  wrap=lambda p:([91]+p+[93]) if bracketed else p
  add(wrap([92,ord(escape)]+base),'valid-ascii-control')
  for slot in range(width):
   for digit in '0123456789abcdefABCDEF':
    for high in [0x100,0xd800,0x10000]:
     value=base.copy();value[slot]=high+ord(digit);add(wrap([92,ord(escape)]+value),'nonascii-low-byte-hex')
   for cp in [0x0660,0xff10,0x10ffff,0xd800,0xdc00,ord('g')]:
    value=base.copy();value[slot]=cp;add(wrap([92,ord(escape)]+value),'invalid-hex-boundary')
runner=r'''
import json,re,sys,unicodedata
assert sys.version_info[:2]==(3,int(sys.argv[1]))
results=[]
for case in json.load(sys.stdin):
 try:re.compile(''.join(map(chr,case['patternCodepoints'])))
 except (re.error,ValueError,OverflowError,RecursionError) as e:results.append({'status':'compile-error','errorClass':type(e).__name__,'message':str(e)})
 else:results.append({'status':'compiled'})
print(json.dumps({'version':sys.version,'executable':sys.executable,'unicodeVersion':unicodedata.unidata_version,'results':results},ensure_ascii=True))
'''
assert len(sys.argv)==3 and sys.argv[1]=='--python314','usage: generate_independent_python_re_hex.py --python314 PY314'
exe=sys.argv[2]
fixture=root/'tests/fixtures/cpython-re/independent-hex-boundaries.json'
record=json.loads(fixture.read_text(encoding='utf-8'))
if record.get('cases')!=cases or set(record.get('oracles',{}))!={'3.11','3.12','3.13'}:
 raise SystemExit('frozen 3.11–3.13 hex fixture does not match this generator preimage')
oracle=json.loads(subprocess.check_output([exe,'-c',runner,'14'],input=json.dumps(cases).encode()))
if oracle.get('unicodeVersion')!='16.0.0':raise SystemExit('CPython 3.14 oracle is not using Unicode 16.0.0')
oracle['executableSha256']=hashlib.sha256(pathlib.Path(exe).resolve().read_bytes()).hexdigest()
record['python314GeneratorSha256']=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
record['python314Scope']='CPython 3.14.8 / Unicode 16.0.0 oracle only; prior 3.11–3.13 oracle records and TSV rows are retained byte-for-byte.'
record['oracles']['3.14']=oracle
fixture.write_text(json.dumps(record,ensure_ascii=True,separators=(',',':'))+'\n')
tsv=fixture.with_name('independent-hex-outcomes.tsv')
old_rows=tsv.read_text(encoding='ascii').splitlines()
if len(old_rows)!=len(cases)*3 or any(row.split('\t',1)[0] not in {'11','12','13'} for row in old_rows):
 raise SystemExit('frozen 3.11–3.13 hex outcome rows are incomplete or unexpected')
rows=['\t'.join(['14',case['id'],'compile','E' if result['status']=='compile-error' else 'N','-','',','.join(map(str,case['patternCodepoints']))]) for case,result in zip(cases,oracle['results'])]
tsv.write_text('\n'.join(old_rows+rows)+'\n')
print(json.dumps({'cases':len(cases),'outcomes':len(old_rows)+len(rows),'fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'tsvSha256':hashlib.sha256(tsv.read_bytes()).hexdigest(),'version':oracle['version'].split()[0],'unicodeVersion':oracle['unicodeVersion']}))
