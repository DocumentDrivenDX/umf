import hashlib,json,pathlib,shutil,subprocess
root=pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf');out=pathlib.Path('/private/tmp/protection-wire-astra-20261015')
files=['src/extensions/security/protection/catalog.ts','src/extensions/security/protection/source.ts','spec/extensions/security-protection/package.json','spec/extensions/security-protection/schema.json','spec/extensions/security/schema.json','scripts/security-protection-schema.py','tests/security/protection/catalog.test.ts','tests/security/protection/wire.test.ts','tests/security/protection/source.test.ts','tools/security/protection-catalog-browser.ts','tools/security/protection-wire-controls.py','tools/security/protection-catalog-controls.py','tools/security/protection-boundary.ts','src/model/json.ts','src/model/schema-literals.ts','src/model/types.ts','src/validation/schema.ts','src/index.ts','bun.lock','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/technical-designs/TD-079-security-semantics.md','docs/helix/03-test/test-plans/STP-079-security-semantics.md','docs/helix/03-test/security/cases.json']
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();pins=lambda:{p:h(root/p) for p in files};before=pins()
for name,args in [('final-supplied-tests',['/opt/homebrew/bin/bun','test','tests/security/protection/']),('final-controls',['/opt/homebrew/bin/bun',str(out/'controls.ts')])]:
 r=subprocess.run(args,cwd=root,capture_output=True,text=True,timeout=30);(out/(name+'.log')).write_text(r.stdout+r.stderr);assert r.returncode==0,(name,r.stdout,r.stderr)
assert before==pins()
for p in files:
 dest=out/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,dest)
(out/'source-pins.json').write_text(json.dumps({'before':before,'after':pins(),'sourceUnchanged':True},indent=2)+'\n')
e=root/'docs/helix/04-build/evidence/security/protection-wire-20261015';evidence={}
for name in ['browser.json','controls.json','envelope-controls.json']:
 if not (e/name).exists():continue
 d=json.loads((e/name).read_text());checks={p:h(root/p)==sha for p,sha in d['sourceDigests'].items()};rows=d.get('observations',d.get('controls',[]));evidence[name]={'sha256':h(e/name),'currentSourcePinsMatch':all(checks.values()),'mismatchedSourcePins':[p for p,yes in checks.items() if not yes],'controls':len(rows),'status':d['status'],'independentlyRerun':False};shutil.copy2(e/name,out/name)
(out/'evidence-checks.json').write_text(json.dumps(evidence,indent=2)+'\n')
old=json.loads(subprocess.check_output(['git','show','HEAD:docs/helix/03-test/security/cases.json'],cwd=root));new=json.loads((root/'docs/helix/03-test/security/cases.json').read_text());
# The sole expected allocation delta defines the existing 4096 bound's wire measure.
# No status, command or implementation binding is changed.
assert type(old)==type(new)
def diffs(a,b,path=''):
 if type(a)!=type(b):return [path]
 if isinstance(a,dict):
  if set(a)!=set(b):return [path]
  return [d for k in a for d in diffs(a[k],b[k],path+'/'+str(k))]
 if isinstance(a,list):
  if len(a)!=len(b):return [path]
  return [d for i,(x,y) in enumerate(zip(a,b)) for d in diffs(x,y,path+'/'+str(i))]
 return [] if a==b else [path]
changes=diffs(old,new);assert len(changes)==1 and changes[0].endswith('/assertion'),changes
(out/'allocation-delta.json').write_text(json.dumps({'status':'passed','changedPaths':changes,'scope':'Only S18 assertion specifies canonical JSON encoding length; no status/runner/evidence/implementation promotion.'},indent=2)+'\n')
print(json.dumps({'sourceCount':len(files),'controls':143,'suppliedTests':11,'sourceUnchanged':True,'evidence':evidence,'allocationChangedPaths':changes}))
