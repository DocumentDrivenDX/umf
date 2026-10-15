"""Exact-failure mutation controls for proposed wire validation, not admission."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();rows=[]
files=['src/extensions/security/protection/catalog.ts','spec/extensions/security-protection/package.json','tests/security/protection/wire.test.ts','tools/security/protection-wire-controls.py']
pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
parameter='typed literal carriers and parameter names are bounded without truncating source'
properties='parameterized disclosure properties have explicit wire shapes and typed bucket bounds'
custody='custody, reversal and hash salt have explicit unverified shapes'
for name,expected_failures in [('original',[]),('omit-parameter-identity',[parameter]),('omit-literal-bound',[parameter,properties]),('omit-history-declaration',[custody]),('omit-text-ledger',['known wire shape never qualifies function/domain/query or native custody'])]:
 with tempfile.TemporaryDirectory(prefix='protection-wire-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(root/tree,work/tree)
  target=work/'tests/security/protection';target.mkdir(parents=True);shutil.copy2(root/'tests/security/protection/wire.test.ts',target/'wire.test.ts');(work/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
  path=work/'src/extensions/security/protection/catalog.ts';text=path.read_text()
  for selected,needle in [('omit-parameter-identity','if(new Set(values).size!==values.length)'),('omit-literal-bound','if(canonicalSchemaJson(value.value).length>4096)'),('omit-text-ledger','if(!textBound)')]:
   if name==selected:
    assert text.count(needle)==1;text=text.replace(needle,'if(false)')
  path.write_text(text)
  if name=='omit-history-declaration':
   path=work/'spec/extensions/security-protection/package.json';data=json.loads(path.read_text());data['schema']['$defs']['propagation']['required'].remove('history');path.write_text(json.dumps(data))
  result=subprocess.run(['/opt/homebrew/bin/bun','test','tests/security/protection/wire.test.ts'],cwd=work,capture_output=True,text=True,timeout=30)
  failures=re.findall(r'^\(fail\) (.*?) \[',result.stderr,re.M);expected=1 if expected_failures else 0
  if result.returncode!=expected or failures!=expected_failures or 'Unhandled error' in result.stderr or 'Ran 5 tests across 1 file' not in result.stderr:raise AssertionError((name,failures,result.stdout,result.stderr))
  rows.append({'id':name,'expectedExit':expected,'observedExit':result.returncode,'expectedFailedTests':expected_failures,'observedFailedTests':failures,'stdout':result.stdout,'stderr':result.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
out=root/'docs/helix/04-build/evidence/security/protection-wire-20261015/controls.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'status':'passed','controls':rows,'sourceDigests':pins,'scope':'Isolated wire validation mutation discrimination only; not domain/query/function interpretation, native proof or S13-S25 acceptance.'},indent=2)+'\n')
print(json.dumps({'status':'passed','controls':len(rows)}))
