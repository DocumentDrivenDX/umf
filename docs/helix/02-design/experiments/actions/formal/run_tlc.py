"""Run finite TLA+ safety models; assumptions and mutations are explicit."""
import hashlib,json,subprocess,re
from pathlib import Path
BASE=Path(__file__).parent.resolve();results=[]
variants=['good','namespace','split','earlyack','auth','lostupdate','gapvisible','lagwatermark']
for variant in variants:
 for same in ([True,False] if variant=='good' else [variant not in ('lostupdate','gapvisible','lagwatermark')]):
  name=variant+('-same' if same else '-distinct')
  cfg='CONSTANTS SameKey = '+str(same).upper()+'\nVariant = "'+variant+'"\nSPECIFICATION Spec\nCHECK_DEADLOCK FALSE\nINVARIANTS AtMostOnce Conservation AtomicEvidence AckDurable NoProtectedDisclosure VisiblePrefix WatermarkComplete\n'
  BASE.joinpath(name+'.cfg').write_text(cfg)
  cmd=['docker','run','--rm','--network','none','-v',str(BASE)+':/work','-v','/private/tmp/umf-actions-formal-tools:/tools:ro','-w','/work','--entrypoint','java','umf-core-replay:latest','-Xmx1g','-cp','/tools/tla2tools.jar','tlc2.TLC','-workers','1','-config',name+'.cfg','-metadir','/tmp/tlc-'+name,'Commands.tla']
  p=subprocess.run(cmd,text=True,capture_output=True,timeout=120)
  log=p.stdout+p.stderr;BASE.joinpath(name+'.log').write_text(log)
  complete='Model checking completed. No error has been found.' in log
  violation=re.search(r'Invariant (\w+) is violated',log)
  if variant=='good':assert complete,(name,log[-3000:])
  else:assert violation,(name,log[-3000:])
  counts=re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found',log)
  results.append({'name':name,'exit':p.returncode,'complete':complete,'invariantViolation':violation.group(1) if violation else None,'stateCounts':counts[-1] if counts else None})
  print(json.dumps(results[-1]),flush=True)
for prop in ['NoSuccessReachable','NoAcknowledgementReachable','NoRecoveredReplayReachable']:
 name='witness-'+prop
 BASE.joinpath(name+'.cfg').write_text('CONSTANTS SameKey = TRUE\nVariant = "good"\nSPECIFICATION Spec\nCHECK_DEADLOCK FALSE\nINVARIANT '+prop+'\n')
 cmd=['docker','run','--rm','--network','none','-v',str(BASE)+':/work','-v','/private/tmp/umf-actions-formal-tools:/tools:ro','-w','/work','--entrypoint','java','umf-core-replay:latest','-Xmx1g','-cp','/tools/tla2tools.jar','tlc2.TLC','-workers','1','-config',name+'.cfg','-metadir','/tmp/tlc-'+name,'Commands.tla']
 p=subprocess.run(cmd,text=True,capture_output=True,timeout=120)
 log=p.stdout+p.stderr;BASE.joinpath(name+'.log').write_text(log)
 assert 'Invariant '+prop+' is violated' in log,(name,log[-1000:])
 results.append({'name':name,'positiveReachabilityWitness':True,'exit':p.returncode})
 print(json.dumps(results[-1]),flush=True)
name='progress-stable-environment'
BASE.joinpath(name+'.cfg').write_text('CONSTANTS SameKey = FALSE\nVariant = "good"\nSPECIFICATION ProgressSpec\nCHECK_DEADLOCK FALSE\nPROPERTIES EventuallyDone EventuallyProjected\nINVARIANTS AtMostOnce Conservation AtomicEvidence AckDurable NoProtectedDisclosure VisiblePrefix WatermarkComplete\n')
cmd=['docker','run','--rm','--network','none','-v',str(BASE)+':/work','-v','/private/tmp/umf-actions-formal-tools:/tools:ro','-w','/work','--entrypoint','java','umf-core-replay:latest','-Xmx1g','-cp','/tools/tla2tools.jar','tlc2.TLC','-workers','1','-config',name+'.cfg','-metadir','/tmp/tlc-'+name,'Commands.tla']
p=subprocess.run(cmd,text=True,capture_output=True,timeout=120)
log=p.stdout+p.stderr;BASE.joinpath(name+'.log').write_text(log)
assert 'Model checking completed. No error has been found.' in log,log[-2000:]
results.append({'name':name,'finiteFairProgress':True,'assumptions':'No crashes/deployment/revocation; weak fairness per client step and pending event application; stable authorized storage environment','exit':p.returncode})
print(json.dumps(results[-1]),flush=True)
out={'tool'  :'TLC pinned official 1.7.4; Java21 isolated existing UMF replay image','assumptions':['Atomic qualified business+outcome+outbox commit except split mutant','Transaction authorization lock couples revoke and commit','Synthetic single product stock2, 2 clients, 2 stable tokens or same token, revisions1/2, one crash/retry per client','Safety configurations have no fairness; separate finite progress configuration assumes weak fairness and no environment faults; no core/native implementation proof','Inventory decrement protocol abstraction; order creation is checked separately by command semantics/history oracle'], 'results':results,'sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [BASE/'Commands.tla',Path(__file__)]}}
BASE.joinpath('tlc-results.json').write_text(json.dumps(out,indent=2)+'\n')
