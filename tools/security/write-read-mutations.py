"""Actual source controls for the admitted legacy writer correction."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
r=pathlib.Path.cwd();w='src/extensions/security/write.ts';e='src/extensions/security/evaluate.ts';test='tests/security/write-read-protection.test.ts'
variants=[('original',w,None,None),
 ('skip-read-gates',w,"const needsRead=changed.filter(field=>blind.get(blindActions.get(field)??'')!=='permit');","const needsRead:string[]=[];"),
 ('binding-is-permission',w,"[action,evaluateSecurityAccess(policy,resolution,cut,{action,output:[]},state.resource).decision]","[action,'permit']"),
 ('only-first-state-read-gate',w,"const needsRead=changed.filter(field=>blind.get(blindActions.get(field)??'')!=='permit');","const needsRead=state===states[0]?changed.filter(field=>blind.get(blindActions.get(field)??'')!=='permit'):[];"),
 ('omit-version',w,"readProtection.version!=='umf.security.write-read/0.1.0'||",''),
 ('omit-field-scope',w,'!actions.has(key)||blindActions.has(key)','blindActions.has(key)'),
 ('omit-blind-alias-check',w,'||ordinaryActions.has(entry.action)',''),
 ('original-absence-is-not-original',e,"if(d.kind==='original')captureOriginal?.(r);","if(d.kind==='original'&&value(resource,r)!==undefined)captureOriginal?.(r);"),
 ('read-permit-is-enough',w,"read.decision==='permit'&&read.originalFields.some(ref=>id(ref)===field)","read.decision==='permit'"),
 ('leak-partial-originals',e,"error.message==='SECURITY_MASK_CONFLICT'?'conflict':'indeterminate',originalFields:[]","error.message==='SECURITY_MASK_CONFLICT'?'conflict':'indeterminate',originalFields"),
 ('withheld-is-original',e,"if(d.kind==='original')captureOriginal?.(r);","if(d.kind==='original'||d.kind==='withheld')captureOriginal?.(r);"),
 ('omit-duplicate-blind-binding',w,'||blindActions.has(key)','')]
variants.append(('omit-strict-original-budget',w,'if(!Number.isSafeInteger(state.cut.maxSteps)||state.cut.maxSteps<1||state.cut.maxSteps>1000000)fail();',''))
expected_failures={'original': [], 'skip-read-gates': ['withheld and transformed reads cannot write even a value equal to the mask', 'blind write is exact Field-bound explicit permission, independent of field mutation grant', 'update requires original or blind permission in both original and proposed states', 'create checks proposed, delete original, and unchanged masked fields need no invented mutation'], 'binding-is-permission': ['blind write is exact Field-bound explicit permission, independent of field mutation grant', 'update requires original or blind permission in both original and proposed states'], 'only-first-state-read-gate': ['update requires original or blind permission in both original and proposed states'], 'omit-version': ['missing or unknown read protection never keeps legacy write permission'], 'omit-field-scope': ['blind bindings refuse duplicated foreign malformed or ordinary-action aliases'], 'omit-blind-alias-check': ['blind bindings refuse duplicated foreign malformed or ordinary-action aliases'], 'original-absence-is-not-original': ['original null and canonical absence keep original meaning before cell transport'], 'read-permit-is-enough': ['withheld and transformed reads cannot write even a value equal to the mask', 'blind write is exact Field-bound explicit permission, independent of field mutation grant', 'update requires original or blind permission in both original and proposed states', 'create checks proposed, delete original, and unchanged masked fields need no invented mutation'], 'leak-partial-originals': ['internal original captures clear on later conflict, projection failure or denied read'], 'withheld-is-original': ['withheld and transformed reads cannot write even a value equal to the mask', 'blind write is exact Field-bound explicit permission, independent of field mutation grant', 'update requires original or blind permission in both original and proposed states', 'create checks proposed, delete original, and unchanged masked fields need no invented mutation'], 'omit-duplicate-blind-binding': ['blind bindings refuse duplicated foreign malformed or ordinary-action aliases'], 'omit-strict-original-budget': ['unknown facts, generation, source and exhausted budgets cannot issue write permission']}
paths=[w,e,test,'tests/security/write-fixture.ts','tests/security/evaluation-fixture.ts','tests/security/fixture.ts','tools/security/write-read-mutations.py'];pins={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths};rows=[]
for name,file,needle,replacement in variants:
 with tempfile.TemporaryDirectory(prefix='write-read-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(r/tree,work/tree)
  for tree in ['native','node_modules']:(work/tree).symlink_to(r/tree,target_is_directory=True)
  for p in paths[2:6]:
   dest=work/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(r/p,dest)
  if needle:
   dest=work/file;s=dest.read_text();assert s.count(needle)==1,(name,s.count(needle));dest.write_text(s.replace(needle,replacement))
  c=subprocess.run(['/opt/homebrew/bin/bun','test',test],cwd=work,text=True,capture_output=True,timeout=45);failures=re.findall(r'^\(fail\) (.*?) \[',c.stderr,re.M)
  assert failures==expected_failures[name] and c.returncode==(0 if name=='original' else 1),(name,failures,c.stderr)
  assert 'Ran 10 tests across 1 file' in c.stderr and 'Unhandled error' not in c.stderr,(name,c.stderr)
  rows.append({'id':name,'observedFailures':failures,'exit':c.returncode,'stdout':c.stdout,'stderr':c.stderr})
assert pins=={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths}
out=r/'docs/helix/04-build/evidence/security/write-protection-20261015';out.mkdir(parents=True,exist_ok=True);(out/'mutations.json').write_text(json.dumps({'status':'passed','sourceDigests':pins,'controls':rows,'scope':'Actual source mutations in copied src/spec/tests with shared read-only native/node_modules. Finite guard/capture sensitivity, not native/executable refinement proof.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'controls':len(rows),'failures':{x['id']:x['observedFailures'] for x in rows}}))
