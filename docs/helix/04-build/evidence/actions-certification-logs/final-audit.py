from pathlib import Path
import json,hashlib,re,subprocess
r=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf')
f=Path('/private/tmp/umf-core-certification-11b2ed89-0906-4f42-9a20-555bff2c444c')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(n):return json.loads((r/n).read_text())
c=load('docs/helix/04-build/evidence/actions-certification.json');o='fixtures/validation/core-check-refresh/'
native=load(o+'native-browser.json');runtime=load(o+'container-runtime.json');publication=load(o+'publication.json')
assert native['complete'] and len(native['runs'])==174 and [x['command'] for x in native['runs']]==native['commands']
assert native['sourceRevision']==runtime['sourceRevision']==c['source']['replayRevision']
publisher=c['source']['finalizationPublisher'];assert publisher['path']=='scripts/publish-core-check-refresh.py'
original=subprocess.check_output(['git','show',native['sourceRevision']+':'+publisher['path']],cwd=f)
assert hashlib.sha256(original).hexdigest()==publisher['executionSourceSha256']==native['sourceInputs'][publisher['path']]
assert sha(r/publisher['path'])==publisher['finalizationSha256']==runtime['finalizationPublisher']['sha256']
assert runtime['finalizationPublisher']['path']==publisher['path']
for n,h in native['sourceInputs'].items():
 assert sha(f/n)==(publisher['finalizationSha256'] if n==publisher['path'] else h),('frozen source changed',n)
 assert sha(r/n)==(publisher['finalizationSha256'] if n==publisher['path'] else h),('delivered source changed',n)
checks=0
for mapping in [c['source']['nativeCapturedInputs'],c['source']['additionalFixtureLineage'],c['evidenceArtifacts'],c['formalAnalysis']['retainedDesignReports'],load('fixtures/actions/browser.json')['sha256']]:
 for n,h in mapping.items():assert sha(r/n)==h,('hash mismatch',n);checks+=1
for a in c['source']['governingArtifacts']:assert sha(r/a['path'])==a['sha256'];checks+=1
assert len(c['source']['governingArtifacts'])==8
assert {x['criterion'] for x in c['criteria']}=={'US-055-AC'+str(i) for i in range(1,10)}|{'US-056-AC'+str(i) for i in range(1,13)}
for a in c['criteria']:
 for w in a['witnesses']:
  n,line=w['location'].rsplit(':',1);assert sha(r/n)==w['sha256'];assert 1<=int(line)<=len((r/n).read_text().splitlines());checks+=1
for n,h in c['source']['additionalFixtureLineage'].items():assert sha(f/n)==h
aux=load(o+'auxiliary.json');regression=load(o+'regression.json');gate=load(o+'container-gates.json');integrity=load(o+'container-integrity.json')
assert len(aux['runs'])==6 and len(regression['runs'])==4
runs=native['runs']+aux['runs']+regression['runs']+[gate,integrity]
for row in runs:assert row['exitCode']==0 and sha(r/row['log'])==row['logSha256'],('execution log',row['log'])
summary=re.compile(r'\n\s*(\d+) pass\n\s*(\d+) fail\n\s*(\d+) expect\(\) calls\nRan (\d+) tests across (\d+) files\.')
files=[];counts=[0,0,0]
for row in regression['runs']+[gate]:
 assert row['command'][:2]==['bun','test'];inventory=row['command'][2:]
 ok,bad,assertions,total,size=map(int,summary.findall((r/row['log']).read_text())[-1]);assert bad==0 and ok==total and size==len(inventory)
 files+=inventory;counts=[counts[0]+ok,counts[1]+size,counts[2]+assertions]
expected={str(p.relative_to(r)) for p in (r/'tests').rglob('*.test.ts')}
assert len(files)==len(set(files)) and set(files)==expected
assert counts==[2314,429,133327],counts
assert publication['complete'] and publication['regression']=={'passed':2297,'failed':0,'assertions':133117,'files':421}
assert publication['nativeBrowserCommands']==174 and len(publication['publishedRoots'])==24
family={'field','nullability','cardinality','facets','key','relationship'}
for p in [r/integrity['log'],r/'docs/helix/04-build/evidence/actions-certification-logs/worktree-integrity.log']:
 records=[json.loads(x) for x in p.read_text().splitlines() if x.startswith('{')];assert {x['concept'] for x in records}==family and all(x['currentEvidenceVerified'] is True for x in records)
browser=load('fixtures/actions/browser.json');assert len(browser['result']['cases'])==44 and browser['bunParity'] is True and browser['externalRequests']==[]
foundation=load('fixtures/actions/reference-foundation.json');assert foundation['sourceHeldStable'] and (foundation['pass'],foundation['fail'],foundation['assertions'])==(119,0,1945)
assert foundation['sha256']==c['source']['nativeCapturedInputs'] and len(foundation['sha256'])==825
assert load('fixtures/json-schema-audit.json')['passed']==351
records={}
for line in (r/(o+'regression-4.log')).read_text().splitlines():
 if line.startswith('{'):
  try:x=json.loads(line)
  except ValueError:continue
  for k in ['nativeRefinement','nativeMutation','nativeInvariantMutation','nativeCompositeKey','nativeUnsupportedRelationships']:
   if k in x:assert k not in records;records[k]=x[k]
assert records==load('docs/helix/04-build/evidence/actions-certification-logs/implementation-records.json')
assert (records['nativeRefinement']['traces'],records['nativeRefinement']['transitions'],records['nativeRefinement']['mismatches'])==(216,648,0)
defs=[('skip-replay','executor.ts','if(request.key){const replay=','if(false&&request.key){const replay=',1),('ignore-role-membership','policy.ts','if(rows.length===1)return;','return;',2),('omit-terminal-audit','executor.ts','   await tx`insert into action_audit(','   if(false)await tx`insert into action_audit(',1),('per-key-canonical-identity','state.ts',"canonical:entity?'entity:'+entity.id:","canonical:entity?'key:'+referenceAliasIdentity(identity.entity,identity.tupleHex):",1),('skip-missing-projection-prefix','projection.ts','const next=prefix+1n,id=','const next=applied===0?BigInt(request.sequence):prefix+1n,id=',1)]
w=records['nativeMutation']['witnesses']+records['nativeInvariantMutation']['witnesses'];assert len(w)==5
for ident,name,old,new,count in defs:
 source=(r/'scripts/actions-reference'/name).read_text();assert source.count(old)==count;row=next(z for z in w if z['id']==ident);assert hashlib.sha256(source.encode()).hexdigest()==row['sourceSha256'];assert hashlib.sha256(source.replace(old,new).encode()).hexdigest()==row['mutantSha256']
assert records['nativeMutation']['killed']==records['nativeMutation']['total']==3 and records['nativeInvariantMutation']['killed']==records['nativeInvariantMutation']['total']==2
assert records['nativeCompositeKey']['restartedReplay']=='exact'
ref=records['nativeUnsupportedRelationships'];assert ref['businessAccesses']==ref['transactionalWrites']==0 and ref['allActionTablesGuarded']==20 and ref['allActionRowsUnchanged']
for a in c['delivery']['proofReferencedBuildArtifactsTransferred']:assert sha(r/a['path'])==a['sha256']
for a in publisher['retainedArtifacts']:assert sha(r/a['path'])==a['sha256']
report={'profile':'umf.actions.final-certification-audit/1','pass':True,'sourceInputs':len(native['sourceInputs']),'exactExecutionSourceInputs':len(native['sourceInputs'])-1,'declaredPublicationOnlySourceChange':publisher['path'],'nativeActionCapturedInputs':825,'governingArtifacts':8,'criteria':21,'certificateWitnessAndArtifactHashesVerified':checks,'executedLogHashesVerified':len(runs),'nativeBrowserCommands':174,'auxiliaryCommands':6,'distinctTests':counts[0],'distinctFiles':counts[1],'assertions':counts[2],'failures':0,'browserCases':44,'nativeRefinementHistories':216,'nativeRefinementTransitions':648,'actualImplementationMutantHashesVerified':5,'replayAndManagedWorktreeIntegrityFamilies':sorted(family),'scope':'Exact recorded action/reference profile and core regression prerequisites; no universal completeness or production/downstream adoption claim'}
print(json.dumps(report))
Path('/private/tmp/umf-actions-final-certificate-audit.json').write_text(json.dumps(report,indent=2)+'\n')
