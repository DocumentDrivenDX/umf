#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Reviewer-owned additive CPython INFO-prefix census; never executes candidate."""
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
output=root/'tests/fixtures/cpython-re/independent-info-boundaries.json'
slash=chr(92)
atoms=[slash+c for c in 'wWdDsS']+[f'[{slash}Wz]',f'[{slash}Dz]',f'[{slash}Sz]',f'[^{slash}W]',f'[^{slash}D]',f'[^{slash}S]',f'[{slash}W{slash}d]',f'[{slash}D{slash}w]',f'[^{slash}Wz]',f'[{slash}Wa-z]',f'[{slash}Wé]',f'[a{slash}W]']
texts=['a','z','0',' ','é','٢','\u00a0','\n','aé','a٢','a\u00a0','éz','٢z','\u00a0z']
forms=[('global-ascii',lambda a:'(?a)'+a),('scoped-ascii',lambda a:'(?a:'+a+')'),('global-ascii-scoped-unicode',lambda a:'(?a)(?u:'+a+')'),('global-unicode-scoped-ascii',lambda a:'(?u)(?a:'+a+')'),('global-ascii-ignorecase',lambda a:'(?ai)'+a),('scoped-ascii-ignorecase',lambda a:'(?ai:'+a+')')]
wrappers=[('bare',lambda a:a),('capture',lambda a:'('+a+')'),('noncapture',lambda a:'(?:'+a+')'),('begin-anchor',lambda a:'^'+a),('absolute-anchor',lambda a:slash+'A'+a),('look-prefix',lambda a:'(?=.)'+a),('suffix-dot',lambda a:a+'.'),('alternative',lambda a:a+'|z'),('optional',lambda a:a+'?'),('literal-prefix',lambda a:'a'+a)]
cases=[];seen=set()
for mode,form in forms:
 for atom in atoms:
  for wrapper,wrap in wrappers:
   # Put global flag declarations outside wrappers; scoped mode remains lexical.
   term=form(atom)
   if term.startswith('(?a)') or term.startswith('(?u)'):
    prefix,term=term[:4],term[4:]
   elif term.startswith('(?ai)'):
    prefix,term=term[:5],term[5:]
   else:prefix=''
   pattern=prefix+wrap(term)
   for text in texts:
    if (pattern,text) in seen:continue
    seen.add((pattern,text));cases.append({'id':f'info-{len(cases):05d}','family':mode+'/'+wrapper,'operation':'search','patternCodepoints':list(map(ord,pattern)),'textCodepoints':list(map(ord,text))})
runner=r'''
import json,re,sys,unicodedata
assert sys.version_info[:2]==(3,int(sys.argv[1]))
out=[]
for case in json.load(sys.stdin):
 try:r=re.compile(''.join(map(chr,case['patternCodepoints'])))
 except (re.error,ValueError,OverflowError,RecursionError) as e:out.append({'status':'compile-error','errorClass':type(e).__name__,'message':str(e)});continue
 m=r.search(''.join(map(chr,case['textCodepoints'])))
 out.append({'status':'compiled','span':list(m.span()) if m else None})
print(json.dumps({'version':sys.version,'executable':sys.executable,'unicodeVersion':unicodedata.unidata_version,'results':out},ensure_ascii=True))
'''
assert len(sys.argv)==3 and sys.argv[1]=='--python314','usage: generate_independent_python_re_info.py --python314 PY314'
exe=sys.argv[2]
record=json.loads(output.read_text(encoding='utf-8'))
if record.get('cases')!=cases or set(record.get('oracles',{}))!={'3.11','3.12','3.13'}:
 raise SystemExit('frozen 3.11–3.13 INFO fixture does not match this generator preimage')
oracle=json.loads(subprocess.check_output([exe,'-c',runner,'14'],input=json.dumps(cases).encode()))
if oracle.get('unicodeVersion')!='16.0.0':raise SystemExit('CPython 3.14 oracle is not using Unicode 16.0.0')
oracle['executableSha256']=hashlib.sha256(pathlib.Path(exe).resolve().read_bytes()).hexdigest()
record['python314GeneratorSha256']=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
record['python314Scope']='CPython 3.14.8 / Unicode 16.0.0 oracle only; prior 3.11–3.13 oracle records and TSV rows are retained byte-for-byte.'
record['oracles']['3.14']=oracle
output.write_text(json.dumps(record,ensure_ascii=True,separators=(',',':'))+'\n')
tsv=output.with_name('independent-info-outcomes.tsv')
old_rows=tsv.read_text(encoding='ascii').splitlines()
if len(old_rows)!=len(cases)*3 or any(row.split('\t',1)[0] not in {'11','12','13'} for row in old_rows):
 raise SystemExit('frozen 3.11–3.13 INFO outcome rows are incomplete or unexpected')
rows=[]
for case,result in zip(cases,oracle['results']):
 span=result.get('span');status='E' if result['status']=='compile-error' else 'N' if span is None else 'M'
 rows.append('\t'.join(['14',case['id'],'search',status,'-' if span is None else ','.join(map(str,span)),','.join(map(str,case['textCodepoints'])),','.join(map(str,case['patternCodepoints']))]))
tsv.write_text('\n'.join(old_rows+rows)+'\n')
print(json.dumps({'cases':len(cases),'outcomes':len(old_rows)+len(rows),'fixtureSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'tsvSha256':hashlib.sha256(tsv.read_bytes()).hexdigest(),'version':oracle['version'].split()[0],'unicodeVersion':oracle['unicodeVersion']}))
