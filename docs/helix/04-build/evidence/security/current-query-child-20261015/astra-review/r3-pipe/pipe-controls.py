import copy,hashlib,json,struct,subprocess,time
from pathlib import Path
ROOT=Path('/Users/erik/.codex/worktrees/security-main-integration/umf');OUT=Path('/private/tmp/current-query-child-astra-20261015/r3-pipe')
ENTRY=Path('/private/tmp/umf-current-query-child-bundle-20261015-r3/current-query-child.mjs')
src=json.loads((ROOT/'tests/security/protection/query-value-modes-source.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
paths=['tools/security/current-query-child.ts','tools/security/current-query-child-main.ts','tests/security/protection/query-value-modes-source.json']
before={p:sha(ROOT/p) for p in paths}
def frame(v):
 b=json.dumps(v,separators=(',',':'),ensure_ascii=False).encode();return struct.pack('>I',len(b))+b
ref=lambda e:dict(documentId='domain',moduleId='m',elementId=e)
init=dict(kind='initialize',requestId='init',sources={k:src[k] for k in ['policy','catalog','closure','ontology']});init['sources'].update(associationBindings=[],extensionSelection=None)
first=frame(init);receipt=hashlib.sha256(first).hexdigest()
routes=[dict(id='predicate',use=dict(scan='s0',path='filters/0/left',type=ref('Resource'),field=ref('salary'),operator='predicate',operation='equal',required=['equality']))]
inspection=dict(kind='inspect-routes',requestId='inspect',sourceReceipt=receipt,owner=src['owner'],routes=routes)
ops=[dict(id='rules',kind='read-rules',selection=dict(type=ref('Resource'))),dict(id='cells',kind='scan',selection=dict(type=ref('Resource'),fields=[ref('salary')])),dict(id='original',kind='action',request=dict(action='query-original-salary-predicate',resources=[dict(type=ref('Resource'),key=[dict(string='r1')])],targets=[ref('Resource')],fields=[]))]
evaluation=dict(kind='evaluate',requestId='evaluate',sourceReceipt=receipt,owner=src['owner'],cut=src['logicalCut'],operations=ops,routes=routes)
def decode(b):
 out=[]
 while b:
  assert len(b)>=4,'short header'
  n=struct.unpack('>I',b[:4])[0];assert 0<n<=16777216 and len(b)>=4+n,'short/oversized response'
  out.append(json.loads(b[4:4+n].decode('utf8')));b=b[4+n:]
 return out
rows=[]
def run(name,data,check):
 t=time.monotonic();p=subprocess.run(['/opt/homebrew/bin/bun',str(ENTRY)],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20,cwd='/private/tmp');out=decode(p.stdout)
 ok=bool(check(p,out));row=dict(name=name,passed=ok,exit=p.returncode,stderr=p.stderr.decode(),responseKinds=[v.get('kind') for v in out],bytes=len(p.stdout),seconds=time.monotonic()-t);rows.append(row)
 (OUT/(name+'.result.json')).write_text(json.dumps(dict(summary=row,responses=out),indent=2)+'\n');assert ok,row
 return out
clean=lambda p,o:p.returncode==0 and p.stderr==b''
full=run('three-call',first+frame(inspection)+frame(evaluation),lambda p,o:clean(p,o) and [x['kind'] for x in o]==['initialized','routes-inspected','evaluation'] and o[-1]['batch']['status']=='completed' and o[-1]['batch']['authority'] is False)
batch=full[-1]['batch'];(OUT/'three-call-semantic-observations.json').write_text(json.dumps(batch,indent=2)+'\n')
# These expectations are contract outcomes, not copied producer output.
assert batch['operations'][1]['outcome']['rows'][0][0]['value']=={'string':'[private]'}
assert batch['operations'][2]['outcome']['rows'][0]['decision']=='permit'
for change in ['wrong-receipt','changed-owner','changed-route','duplicate-id','extra-member','too-many-operations','too-many-facts','too-many-scans','too-many-read-rules']:
 e=copy.deepcopy(evaluation)
 if change=='wrong-receipt':e['sourceReceipt']='0'*64
 elif change=='changed-owner':e['owner']['revision']='changed'
 elif change=='changed-route':e['routes'][0]['id']='changed'
 elif change=='duplicate-id':e['requestId']='inspect'
 elif change=='extra-member':e['permit']=True
 elif change=='too-many-operations':e['operations']=ops*86
 elif change=='too-many-facts':e['cut']['facts']=[{}]*10001
 elif change=='too-many-scans':e['operations']=[dict(id=str(i),kind='scan',selection=dict(type=ref('Resource'),fields=[])) for i in range(17)]
 elif change=='too-many-read-rules':e['operations']=[dict(id=str(i),kind='read-rules',selection=dict(type=ref('Resource'))) for i in range(17)]
 run(change,first+frame(inspection)+frame(e),lambda p,o:clean(p,o) and len(o)==3 and o[-1]==dict(kind='refused',requestId=e['requestId'],sourceReceipt=receipt,code='UMF_QUERY_CHILD_REFUSED'))
run('skip-inspection',first+frame(evaluation),lambda p,o:clean(p,o) and len(o)==2 and o[-1]['kind']=='refused')
run('post-evaluation',first+frame(inspection)+frame(evaluation)+frame(evaluation),lambda p,o:p.returncode==2 and p.stderr==b'UMF_QUERY_CHILD_REFUSED\n' and len(o)==3 and o[-1]['kind']=='evaluation')
run('post-refusal',first+frame(evaluation)+frame(inspection),lambda p,o:p.returncode==2 and p.stderr==b'UMF_QUERY_CHILD_REFUSED\n' and len(o)==2 and o[-1]['kind']=='refused')
for name,data in [('truncated-header',b'\x00\x00'),('truncated-body',first[:-1]),('oversized-header',struct.pack('>I',4194305)),('zero-header',b'\0'*4),('invalid-utf8',struct.pack('>I',1)+b'\xff'),('duplicate-json-key',struct.pack('>I',len(b'{"a":1,"a":2}'))+b'{"a":1,"a":2}')]:
 run(name,data,lambda p,o:p.returncode==2 and p.stderr==b'UMF_QUERY_CHILD_REFUSED\n' and o==[])
e=copy.deepcopy(evaluation);e['cut']['expectedGeneration']='stale'
run('stale-cut',first+frame(inspection)+frame(e),lambda p,o:clean(p,o) and o[-1]['kind']=='evaluation' and o[-1]['batch']==dict(status='refused',complete=False,authority=False,operations=[]) and o[-1]['routeResults'][0]['result']['status']=='refused')
# Empty metadata is a finite valid diagnostic invocation, not permission.
i=copy.deepcopy(inspection);i['routes']=[];e=copy.deepcopy(evaluation);e['routes']=[]
run('empty-routes',first+frame(i)+frame(e),lambda p,o:clean(p,o) and o[-1]['batch']['status']=='completed' and o[-1]['routeResults']==[])
# Demonstrate documented per-kind scanning limits rather than silently asserting an aggregate16.
e['operations']=[dict(id='s'+str(i),kind='scan',selection=dict(type=ref('Resource'),fields=[])) for i in range(16)]+[dict(id='r'+str(i),kind='read-rules',selection=dict(type=ref('Resource'))) for i in range(16)];e['cut']['maxFacts']=10000
out=run('mixed-32-scans-observation',first+frame(i)+frame(e),lambda p,o:clean(p,o) and o[-1]['kind']=='evaluation')
after={p:sha(ROOT/p) for p in paths};assert before==after
(OUT/'pipe-controls.json').write_text(json.dumps(dict(sourceBefore=before,sourceAfter=after,sourceUnchanged=before==after,controls=rows,mixed32BatchStatus=out[-1]['batch']['status'],nativeOrCloudCalls=False),indent=2)+'\n')
print(json.dumps(dict(passed=len(rows),mixed32BatchStatus=out[-1]['batch']['status'],sourceUnchanged=True)))
