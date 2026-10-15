"""Actual source-guard mutations with exact named assertion failures."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();test='tests/security/protection/query-properties.test.ts';query='src/extensions/security/protection/queries.ts';parameter='src/extensions/security/protection/parameters.ts'
variants=[('original',query,None,None,[]),('omit-implied-equality',query,"if(transform.determinism==='deterministic'||transform.determinism==='keyed-deterministic')impliedProperties.push('equality');",'', ['mandatory requirements implied stability and original mode remain separate']),('omit-random-token-policy',query,"transform.kind==='tokenize'&&transform.determinism==='random'&&['join','group'].includes(u.operator)",'false',['random tokens cannot disclose join or group even with an authored equality claim']),('original-mode-grants-compatibility',query,"if(mode==='original-authorized')return finish('requires-original-action');","if(mode==='original-authorized')return finish('compatible-properties');",['mandatory requirements implied stability and original mode remain separate','random tokens cannot disclose join or group even with an authored equality claim']),('separate-stage-budgets',query,'checkProtectionParametersWithinBudget(policy,catalog,closure,budget)','checkProtectionParametersWithinBudget(policy,catalog,closure,new ProtectionLiteralBudget())',['parameter and query stages share the private literal budget'])]
pinpaths=[query,parameter,'src/extensions/security/protection/literals.ts',test,'tests/security/protection/domain-fixture.ts','tools/security/protection-query-mutations.py'];pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in pinpaths};rows=[]
for name,file,needle,replacement,expected in variants:
 with tempfile.TemporaryDirectory(prefix='protection-query-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(root/tree,work/tree)
  for shared in ['native','node_modules']:(work/shared).symlink_to(root/shared,target_is_directory=True)
  for p in [test,'tests/security/protection/domain-fixture.ts']:
   dest=work/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,dest)
  if needle:
   p=work/file;s=p.read_text();assert s.count(needle)==1;s=s.replace(needle,replacement);p.write_text(s)
  r=subprocess.run(['/opt/homebrew/bin/bun','test',test],cwd=work,capture_output=True,text=True,timeout=45)
  observed=re.findall(r'^\(fail\) (.*?) \[',r.stderr,re.M)
  assert observed==expected and r.returncode==(1 if expected else 0) and 'Ran 9 tests across 1 file' in r.stderr and 'Unhandled error' not in r.stderr,(name,observed,r.stderr)
  rows.append({'id':name,'expectedFailures':expected,'observedFailures':observed,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in pinpaths}
out=root/'docs/helix/04-build/evidence/security/protection-query-20261015/query-mutations.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'status':'passed','sourceDigests':pins,'controls':rows,'scope':'Copied src/spec/tests; native/node_modules shared read-only. Exact named runtime assertion failures, not hermetic or native qualification.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'status':'passed','variants':len(rows)}))
