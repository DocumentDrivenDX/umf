"""Actual source mutations for declared obligations; no native authority theorem."""
import hashlib,json,pathlib,re,shutil,subprocess,tempfile
root=pathlib.Path.cwd();action='src/extensions/security/action-purpose-declarations.ts';ob='src/extensions/security/protection/obligations.ts'
tests=['tests/security/action-purposes.test.ts','tests/security/protection/obligations.test.ts']
variants=[('original',ob,None,None),
 ('omit-purpose-coverage',action,'if(universe.size)fail();return entries;','return entries;'),
 ('omit-exclusive-purpose',action,"if(values.some((v:any)=>['reverse','vault-write','other'].includes(v))&&values.length!==1)fail();",''),
 ('omit-ontology-pin',ob,"if(p.ontology.documentId!==o.documentId||p.ontology.revision!==o.revision)",'if(false)'),
 ('omit-separate-reverse-action',ob,"role(t.reverseAction,'reverse');",''),
 ('omit-separate-vault-write-action',ob,"role(t.custody.vaultWriteAction,'vault-write');",''),
 ('omit-effective-equality',ob,"if(!['deterministic','keyed-deterministic'].includes(t.determinism)&&!t.disclosureProfile.includes('equality'))",'if(false)'),
 ('omit-warning',ob,"add('dictionary-attack-warning',{code:'UNSALTED_HASH_DICTIONARY_ATTACK',warning:'Unsalted hashes expose equality and need assessment for dictionary attacks; no algorithm or custody enforcement is verified.'});",''),
 ('omit-unused-transform',ob,'for(const t of c.transforms){','for(const t of c.transforms.slice(0,1)){'),
 ('release-partial-obligations',ob,'if(!success)obligations.length=0;',''),
 ('omit-selected-domains',ob,'if(!t||!sameRef(entry.field,t.inputDomain)||!sameRef(d.field,t.outputDomain))','if(!t)'),
 ('claim-enforcement',ob,"kind,status:'unverified',declaration","kind,status:'enforced',declaration"),
 ('omit-cache-propagation',ob,"['history','snapshots','exports','feeds','caches']","['history','snapshots','exports','feeds']")]
expected_failures={'original': [], 'omit-purpose-coverage': ['purpose closure refuses incomplete, duplicated, unknown and extra source atomically', 'source pins, complete declarations and selected domains refuse atomically, including unused transforms'], 'omit-exclusive-purpose': ['ordinary purposes may combine while reverse, vault-write and other remain exclusive'], 'omit-ontology-pin': ['source pins, complete declarations and selected domains refuse atomically, including unused transforms'], 'omit-separate-reverse-action': ['exact source purpose separation refuses ordinary aliases without banning explicit reverse grants', 'source pins, complete declarations and selected domains refuse atomically, including unused transforms'], 'omit-separate-vault-write-action': ['exact source purpose separation refuses ordinary aliases without banning explicit reverse grants'], 'omit-effective-equality': ['unsalted hashes require effective equality and report dictionary warning without executing an algorithm'], 'omit-warning': ['unsalted hashes require effective equality and report dictionary warning without executing an algorithm'], 'omit-unused-transform': ['source pins, complete declarations and selected domains refuse atomically, including unused transforms'], 'release-partial-obligations': ['unsalted hashes require effective equality and report dictionary warning without executing an algorithm', 'exact source purpose separation refuses ordinary aliases without banning explicit reverse grants', 'source pins, complete declarations and selected domains refuse atomically, including unused transforms'], 'omit-selected-domains': ['source pins, complete declarations and selected domains refuse atomically, including unused transforms'], 'claim-enforcement': ['stored declarations retain every unverified custody, propagation and separate action obligation'], 'omit-cache-propagation': ['stored declarations retain every unverified custody, propagation and separate action obligation']}
pinpaths=[action,ob,*tests,'tests/security/fixture.ts','tools/security/protection-obligations-mutations.py'];pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in pinpaths};rows=[]
for name,file,needle,replacement in variants:
 with tempfile.TemporaryDirectory(prefix='protection-obligations-control-') as folder:
  work=pathlib.Path(folder)
  for tree in ['src','spec','docs/helix/02-design/spikes/security']:shutil.copytree(root/tree,work/tree)
  for shared in ['native','node_modules']:(work/shared).symlink_to(root/shared,target_is_directory=True)
  for p in [*tests,'tests/security/fixture.ts']:
   dest=work/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,dest)
  if needle:
   dest=work/file;source=dest.read_text();assert source.count(needle)==1,(name,source.count(needle));dest.write_text(source.replace(needle,replacement))
  result=subprocess.run(['/opt/homebrew/bin/bun','test',*tests],cwd=work,capture_output=True,text=True,timeout=45)
  failures=re.findall(r'^\(fail\) (.*?) \[',result.stderr,re.M)
  assert failures==expected_failures[name] and result.returncode==(0 if name=='original' else 1),(name,failures,result.stderr)
  assert 'Ran 11 tests across 2 files' in result.stderr and 'Unhandled error' not in result.stderr,(name,result.stderr)
  rows.append({'id':name,'observedFailures':failures,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
assert pins=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in pinpaths}
out=root/'docs/helix/04-build/evidence/security/protection-obligations-20261015';out.mkdir(parents=True,exist_ok=True)
(out/'mutations.json').write_text(json.dumps({'status':'passed','sourceDigests':pins,'controls':rows,'scope':'Copied source/spec/prototype/test source mutations; each mutated source must cause named semantic assertions to fail. Shared read-only native/node_modules; no hermetic/native qualification.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'status':'passed','variants':len(rows),'failures':{r['id']:r['observedFailures'] for r in rows}}))
