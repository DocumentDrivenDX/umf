"""Discriminate weakened scaffold implementations in isolated source copies."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();observations=[]
files=['src/extensions/security/protection/catalog.ts','spec/extensions/security-protection/package.json','tests/security/protection/catalog.test.ts','tools/security/protection-catalog-controls.py']
pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
for name in ['original','omit-duplicate-check','omit-transform-bound','allow-unimplemented']:
 with tempfile.TemporaryDirectory(prefix='protection-catalog-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:
   shutil.copytree(root/tree,work/tree)
  target=work/'tests/security/protection';target.mkdir(parents=True)
  shutil.copy2(root/'tests/security/protection/catalog.test.ts',target/'catalog.test.ts')
  (work/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
  path=work/'src/extensions/security/protection/catalog.ts';text=path.read_text()
  if name=='omit-duplicate-check':
   assert text.count('if(identities.has(identity))')==1;text=text.replace('if(identities.has(identity))','if(false)')
  if name=='allow-unimplemented':
   needle='throw new UmfError(failure.code,failure.message,failure.path);';assert text.count(needle)==1;text=text.replace(needle,'return undefined as never;')
  path.write_text(text)
  if name=='omit-transform-bound':
   path=work/'spec/extensions/security-protection/package.json';data=json.loads(path.read_text());data['schema']['properties']['transforms'].pop('maxItems');path.write_text(json.dumps(data))
  run=subprocess.run(['/opt/homebrew/bin/bun','test','tests/security/protection/catalog.test.ts','tools/security/protection-catalog-controls.py'],cwd=work,capture_output=True,text=True,timeout=30)
  expected=0 if name=='original' else 1
  expected_failures={'original':[], 'omit-duplicate-check':['exact pair identities reject duplicates without separator collisions or normalization'], 'omit-transform-bound':['malformed envelopes and structural bounds refuse without truncation'], 'allow-unimplemented':['envelope inspection preserves uninterpreted payload and never grants interpretation','malformed envelopes and structural bounds refuse without truncation']}[name]
  actual_failures=re.findall(r'^\(fail\) (.*?) \[',run.stderr,re.M)
  if actual_failures!=expected_failures or 'Unhandled error' in run.stderr or 'Ran 4 tests across 1 file' not in run.stderr:raise AssertionError((name,actual_failures,run.stderr))
  if run.returncode!=expected:raise AssertionError((name,run.returncode,run.stdout,run.stderr))
  observations.append({'id':name,'expectedExit':expected,'observedExit':run.returncode,'stdout':run.stdout,'stderr':run.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
receipt={'status':'passed','controls':observations,'sourceDigests':pins,'scope':'Isolated source mutation discrimination for envelope scaffold only; not formal proof, native evidence or S13-S25 qualification.'}
out=root/'docs/helix/04-build/evidence/security/protection-wire-20261015/envelope-controls.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','controls':len(observations)}))
