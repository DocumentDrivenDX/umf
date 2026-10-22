"""Discriminating actual pure-function guard/arithmetic source mutations."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();file='src/extensions/security/protection/functions.ts';test='tests/security/protection/functions.test.ts'
variants=[('omit-selected-domain-binding',"if(!sameRef(selectedDisclosure.field,transform.inputDomain)||!sameRef(disposition.field,transform.outputDomain))",'if(false)',['selected policy Fields cannot be substituted for the declared transform domains']),('original',None,None,[]),('omit-original-input-check','checkedValue(from,input,budget,isDate);','',['constant changes output family but always checks original input and output domain','null-out and constant null are transformed values and never bypass invalid inputs']),('omit-closed-signature',"if(args.size!==expected.length||expected.some(name=>!args.has(name)))",'if(false)',['closed signatures scalar domains exact source scope and immutable results refuse substitutions']),('truncate-negative-instead-of-floor','if(delta%width<0n)q-=1n;','',['numeric buckets floor negative values and retain exact large integers','decimal bucket coefficients preserve scale and original spelling without rounding']),('overlap-retained-suffix','Math.min(suffix,Math.max(0,scalars.length-prefix))','Math.min(suffix,scalars.length)',['partial uses Unicode scalars without overlap and exposes short inputs explicitly']),('omit-output-check',"checkedValue(to,value,budget,isDate);return finish('transformed');","return finish('transformed');",['fixed redaction and prefix use explicit units zero counts and output refinements']),('omit-explicit-calendar-profile',"if(text('calendar')!==GREGORIAN_DATE_PROFILE)",'if(false)',['explicit Gregorian profile owns date truncation and refuses calendar/refinement substitution'])]
files=[file,'src/extensions/security/protection/literals.ts','src/adapters/gregorian-date.ts',test,'tests/security/protection/domain-fixture.ts','tools/security/protection-function-mutations.py'];pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files};rows=[]
for name,needle,replacement,expected in variants:
 with tempfile.TemporaryDirectory(prefix='protection-function-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(root/tree,work/tree)
  for shared in ['native','node_modules']:(work/shared).symlink_to(root/shared,target_is_directory=True)
  for p in [test,'tests/security/protection/domain-fixture.ts']:
   dest=work/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,dest)
  if needle:
   p=work/file;s=p.read_text();assert s.count(needle)==1;s=s.replace(needle,replacement);p.write_text(s)
  result=subprocess.run(['/opt/homebrew/bin/bun','test',test],cwd=work,capture_output=True,text=True,timeout=45)
  failures=re.findall(r'^\(fail\) (.*?) \[',result.stderr,re.M)
  assert failures==expected and result.returncode==(1 if expected else 0) and 'Ran 10 tests across 1 file' in result.stderr and 'Unhandled error' not in result.stderr,(name,failures,result.stderr)
  rows.append({'id':name,'expectedFailures':expected,'observedFailures':failures,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
out=root/'docs/helix/04-build/evidence/security/protection-functions-20261015';out.mkdir(parents=True,exist_ok=True);(out/'mutations.json').write_text(json.dumps({'status':'passed','sourceDigests':pins,'controls':rows,'scope':'Copied src/spec/tests; shared read-only native/node_modules. Exact named actual source-mutation failures, not hermetic/native qualification.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'status':'passed','variants':len(rows)}))
