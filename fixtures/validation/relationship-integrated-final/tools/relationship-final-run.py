import hashlib,json,subprocess,os
from pathlib import Path
root=Path('fixtures/validation/relationship-integrated-refresh')
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
runs=[]
for name,command in [('relationship-conformance',['bun','scripts/core-ideals/relationship-conformance.ts']),('relationship-tests',['bun','test','tests/core-ideals/relationship-conformance.test.ts'])]:
 p=root/(name+'.log')
 if p.exists():
  old=root/(name+'-previous-'+sha(p)[:16]+'.log');old.write_bytes(p.read_bytes())
 print('START',name,flush=True)
 with p.open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,env=os.environ)
 runs.append({'command':command,'exitCode':r.returncode,'log':str(p),'logSha256':sha(p)})
 assert r.returncode==0,(name,str(p))
 print('PASS',name,flush=True)
proofs=['fixtures/validation/relationship-'+n+'.json' for n in ['admission','delivery','conformance','gate-refresh']]
a=json.loads(Path(proofs[0]).read_text());d=json.loads(Path(proofs[1]).read_text())
failed='fixtures/validation/relationship-gate/pre-timeout-fix-acceptance.txt'
record={'complete':True,'idealAdmitted':a['idealAdmitted'],'priorityDelivery':d['priorityDelivery'],'nativeEquivalence':False,'runs':runs,'sha256':{p:sha(p) for p in proofs},'failedAttempts':[{'scope':'Scoped feature-worktree pre-fix default timeout; corrected and replayed before merge','log':failed,'logSha256':sha(failed),'exitCode':1}]}
(root/'relationship-final-runs.json').write_text(json.dumps(record,indent=2)+'\n')
