import hashlib,json,pathlib,subprocess
r=pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf');e=r/'docs/helix/04-build/evidence/security/candidate-domain-closure-20261015'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=[p for p in (r/'src/extensions/security').rglob('*.ts')]+[r/p for p in ['tests/security/candidate-domains.test.ts','tests/security/compact-conditions.test.ts','tests/security/shared-source.test.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/technical-designs/TD-079-security-semantics.md','docs/helix/03-test/test-plans/STP-079-security-semantics.md','docs/helix/03-test/security/cases.json']]
a=json.loads((e/'acceptance.json').read_text());v=json.loads((e/'validation.json').read_text());f=json.loads((e/'formal.json').read_text())
assert a['requiredCases']==158 and a['allocatedAcceptanceCriteria']==34 and sum(x['accepted'] for x in a['execution'])==37 and len(a['errors'])==121
for run in a['execution']:
 assert run['accepted']
 for path,digest in run['fingerprints'].items():assert h(pathlib.Path(path) if pathlib.Path(path).is_absolute() else r/path)==digest,(run['id'],path)
old=json.loads(subprocess.check_output(['git','show','HEAD:docs/helix/03-test/security/cases.json'],cwd=r));new=json.loads((r/'docs/helix/03-test/security/cases.json').read_text())
for d in [old,new]:
 for c in d['cases']:c.pop('implementationSources')
assert old==new
receipt={'status':'qualified-source-type-and-compact-IR-prerequisites','baseline':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'acceptanceCriteria':['US-079-AC3'],'securityAndDateTests':{'passed':221,'assertions':3063,'runtime':'Bun1.4.2'},'independentReview':{'selectedPins':39,'BunChromiumObservations':128,'parity':True,'killedSingleGuardMutants':7,'killedPairedKeyMutant':1,'redundantSingleKeySurvivorRetained':True,'remainingPrerequisiteBlockers':[]},'typecheck':'passed','browserBuild':'passed','formal':{'queries':len(f['queries']),'unsat':sum(x['result']=='unsat' for x in f['queries']),'sat':sum(x['result']=='sat' for x in f['queries']),'scope':f['scope']},'acceptance':{'required':158,'criteria':34,'acceptedBoundCases':37,'missingRequiredBindings':121,'changedAssertionsOrCommands':False,'casesPromoted':[]},'complete':False,'authority':False,'remaining':['Full catalog-aware source-closed program and Record/graph fact runtime','Actual owner profiles and graph-aware before/after write comparisons','Full S24/S25 original-read/blind/vault-write behavior','Native current authority, guarded ABI, lifecycle and remaining backend tests'],'sourceDigests':{str(p.relative_to(r)):h(p) for p in sources},'artifactDigests':{str(p.relative_to(e)):h(p) for p in e.rglob('*') if p.is_file() and p.name!='receipt.json'}}
(e/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:receipt[k] for k in ['status','acceptance','formal']}))
