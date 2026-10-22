"""Exact named failures under real source mutations; no hermetic/native claim."""
import hashlib,json,os,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();file='src/extensions/security/protection/domains.ts';tests='tests/security/protection/domains.test.ts';files=[file,tests,'tests/security/protection/domain-fixture.ts','spec/extensions/security-protection/domain-resolution.schema.json','tools/security/protection-domain-mutations.py','src/extensions/security/protection/core-fields.ts'];pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files};rows=[]
variants=[('original',None,None,[]),('omit-revision-check','pins.get(entry.document.id)!==entry.revision','false',['pin closure refuses stale duplicate missing extra and unknown metadata without partial coordinates']),('admit-non-field',"if(field.kind==='field')",'if(true)',['foreign missing and non-Field domains refuse including unused transforms and all declaration sites']),('keep-partial-coordinates',"if(status==='refused')domains.length=0;",'',['foreign missing and non-Field domains refuse including unused transforms and all declaration sites']),('omit-source-unknown-guard',"diagnostics.some(d=>d.code==='PROTECTION_UNKNOWN'||d.code==='SECURITY_V2_UNKNOWN')",'false',['unknown core policy and catalog meaning remains source but cannot qualify domains']),('omit-text-bound','if(units>4_000_000)','if(false)',['domain closure is bounded before document validation and never executes getters'])]
for name,needle,replacement,expected in variants:
 with tempfile.TemporaryDirectory(prefix='protection-domain-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec']:shutil.copytree(root/tree,work/tree)
  for shared in ['native','node_modules']:(work/shared).symlink_to(root/shared,target_is_directory=True)
  for source in [tests,'tests/security/protection/domain-fixture.ts']:
   dest=work/source;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/source,dest)
  if needle:
   p=work/('src/extensions/security/protection/core-fields.ts' if name=='admit-non-field' else file);s=p.read_text();assert needle in s;s=s.replace(needle,replacement);p.write_text(s)
  result=subprocess.run(['/opt/homebrew/bin/bun','test',tests],cwd=work,capture_output=True,text=True,timeout=45)
  observed=re.findall(r'^\(fail\) (.*?) \[',result.stderr,re.M)
  assert observed==expected and result.returncode==(1 if expected else 0) and 'Ran 6 tests across 1 file' in result.stderr and 'Unhandled error' not in result.stderr,(name,result.stderr)
  rows.append({'id':name,'expectedFailures':expected,'observedFailures':observed,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
out=root/os.environ.get('UMF_PROTECTION_MUTATION_OUTPUT','docs/helix/04-build/evidence/security/protection-domains-20261015/mutations.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'status':'passed','controls':rows,'sourceDigests':pins,'scope':'src/spec isolated; native/node_modules shared read-only. Actual guard mutation discrimination, not formal/native qualification.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'status':'passed','variants':len(rows)}))
