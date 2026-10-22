"""Actual source mutations exercise transport guards; no native authority theorem."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();file='src/extensions/security/protection/disclosure.ts';test='tests/security/protection/disclosure.test.ts'
malformed='whole batch rejects malformed distinctions, substituted domains and hidden data'
stored='original stored token uses actual canonical output Field without reverse or implicit plaintext'
metadata='all metadata is validated in empty/withheld batches and explicit dates do not imply temporal semantics'
bounds='bounds and shared literal work refuse atomically, with no input accessor execution'
variants=[('original',None,None,[]),
 ('omit-envelope-pins','if(pin.id!==expected.id||pin.revision!==expected.revision)','if(false)',[malformed]),
 ('omit-unknown-members',"Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k))",'false',[malformed]),
 ('omit-selected-input-binding','||!sameRef(column.field,selected.field)||!sameRef(column.field,t.inputDomain)','',[malformed]),
 ('omit-stored-carrier-domain','||!sameRef(column.field,t.outputDomain)','',[stored]),
 ('hide-null-on-withheld',"if(cell.disposition==='withheld'){members(cell,['disposition']);continue;}","if(cell.disposition==='withheld'){members(cell,['disposition'],['value']);continue;}",[malformed]),
 ('omit-output-literal-check','profile(to,cell.valueProfile);value(to,cell.value,cell.valueProfile,budget);','profile(to,cell.valueProfile);',[malformed]),
 ('reset-literal-budget-per-cell','value(from,cell.value,column.valueProfile,budget);','value(from,cell.value,column.valueProfile,new ProtectionLiteralBudget());',[bounds]),
 ('release-refused-batch','batch:success?source as unknown as SecurityDisclosureBatchV2:null','batch:source as unknown as SecurityDisclosureBatchV2',[malformed,stored,metadata,bounds]),
 ('skip-empty-column-metadata','for(const column of b.columns){','for(const column of (b.rows.length?b.columns:[])){',[stored,metadata]),
]
paths=[file,test,'tests/security/protection/domain-fixture.ts','tools/security/protection-disclosure-mutations.py'];pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths};rows=[]
for name,needle,replacement,expected in variants:
 with tempfile.TemporaryDirectory(prefix='protection-disclosure-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(root/tree,work/tree)
  for shared in ['native','node_modules']:(work/shared).symlink_to(root/shared,target_is_directory=True)
  for p in [test,'tests/security/protection/domain-fixture.ts']:
   dest=work/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,dest)
  if needle:
   dest=work/file;source=dest.read_text();assert source.count(needle)==1,(name,source.count(needle));dest.write_text(source.replace(needle,replacement))
  result=subprocess.run(['/opt/homebrew/bin/bun','test',test],cwd=work,capture_output=True,text=True,timeout=45)
  failures=re.findall(r'^\(fail\) (.*?) \[',result.stderr,re.M)
  assert failures==expected and result.returncode==(1 if expected else 0) and 'Ran 5 tests across 1 file' in result.stderr and 'Unhandled error' not in result.stderr,(name,failures,result.stderr)
  rows.append({'id':name,'expectedFailures':expected,'observedFailures':failures,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
out=root/'docs/helix/04-build/evidence/security/protection-disclosure-20261015';out.mkdir(parents=True,exist_ok=True)
(out/'mutations.json').write_text(json.dumps({'status':'passed','sourceDigests':pins,'controls':rows,'scope':'Copied source/spec/test source mutations with exact expected named failures; shared read-only native/node_modules, not hermetic/native qualification.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'status':'passed','variants':len(rows)}))
