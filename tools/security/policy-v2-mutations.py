"""Actual mutation discrimination; source copies share original read-only native assets."""
import hashlib,json,pathlib,shutil,subprocess,tempfile,re
root=pathlib.Path.cwd();rows=[]
files=['src/extensions/security/policy-representation-v2.ts','src/extensions/security/policy-v2-legacy-access.ts','src/extensions/security/protection/references.ts','tests/security/protection/policy-v2.test.ts','tools/security/policy-v2-mutations.py']
pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
variants=[
 ('original',None,None,None,[]),
 ('omit-classification-guard',files[0],'if(before.has(path)!==after.has(path))','if(false)',['unknown old members cannot be silently promoted into recognized new meaning']),
 ('omit-text-ledger',files[0],'if(units>4_000_000)return false','if(false)return false',['new revision, source shape and source/target text budgets are enforced']),
 ('omit-semantic-embedding',files[1],"const view=copyJson({...source,version:'0.1.0'})","const view=copyJson({...source,version:'0.2.0'})",['forward0.2 legacy embedding evaluates the original revision and refuses unsupported meaning']),
]
for name,file,needle,replacement,failures in variants:
 with tempfile.TemporaryDirectory(prefix='security-v2-mutation-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(root/tree,work/tree)
  target=work/'tests/security/protection';target.mkdir(parents=True)
  for source in ['tests/security/fixture.ts','tests/security/evaluation-fixture.ts','tests/security/protection/policy-v2.test.ts']:
   dest=work/source;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/source,dest)
  for shared in ['native','node_modules']:(work/shared).symlink_to(root/shared,target_is_directory=True)
  if file:
   path=work/file;text=path.read_text();assert needle in text;text=text.replace(needle,replacement);path.write_text(text)
  run=subprocess.run(['/opt/homebrew/bin/bun','test','tests/security/protection/policy-v2.test.ts'],cwd=work,capture_output=True,text=True,timeout=45)
  actual=re.findall(r'^\(fail\) (.*?) \[',run.stderr,re.M)
  assert actual==failures,(name,actual,run.stderr)
  assert run.returncode==(1 if failures else 0) and 'Ran 8 tests across 1 file' in run.stderr and 'Unhandled error' not in run.stderr,(name,run.stderr)
  rows.append({'id':name,'expectedFailures':failures,'observedFailures':actual,'exit':run.returncode,'stdout':run.stdout,'stderr':run.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
receipt={'status':'passed','controls':rows,'sourceDigests':pins,'scope':'Exact intended test failures under source mutations; src/spec isolated, node_modules/native shared read-only. Not a hermetic closure, formal refinement, native enforcement or acceptance promotion.','acceptanceCasesPromoted':[]}
(root/'docs/helix/04-build/evidence/security/policy-v2-20261015/mutations.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','controls':len(rows)}))
