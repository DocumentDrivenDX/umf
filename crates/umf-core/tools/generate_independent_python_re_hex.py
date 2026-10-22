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
assert len(sys.argv)==4,'pass exact CPython3.11/3.12/3.13 interpreter paths'
oracles={}
for minor,exe in zip((11,12,13),sys.argv[1:]):
 item=json.loads(subprocess.check_output([exe,'-c',runner,str(minor)],input=json.dumps(cases).encode()));item['executableSha256']=hashlib.sha256(pathlib.Path(exe).resolve().read_bytes()).hexdigest();oracles[f'3.{minor}']=item
fixture=root/'tests/fixtures/cpython-re/independent-hex-boundaries.json';fixture.write_text(json.dumps({'profile':'umf.independent-python-re-hex/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'scope':'Additive reviewer-owned compile-only escape admission boundaries, exact u32 inputs, all three profiles; original frozen fixtures unchanged.','cases':cases,'oracles':oracles},ensure_ascii=True,separators=(',',':'))+'\n')
rows=[]
for minor,oracle in oracles.items():
 for case,result in zip(cases,oracle['results']):rows.append('\t'.join([minor[2:],case['id'],'compile','E' if result['status']=='compile-error' else 'N','-','',','.join(map(str,case['patternCodepoints']))]))
tsv=fixture.with_name('independent-hex-outcomes.tsv');tsv.write_text('\n'.join(rows)+'\n')
print(json.dumps({'cases':len(cases),'outcomes':len(rows),'fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'tsvSha256':hashlib.sha256(tsv.read_bytes()).hexdigest()}))
