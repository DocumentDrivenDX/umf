import datetime,hashlib,json,pathlib,shutil,subprocess
root=pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf')
out=pathlib.Path('/private/tmp/protection-catalog-astra-20261015')
files=['spec/extensions/security-protection/package.json','spec/extensions/security-protection/schema.json','src/extensions/security/protection/catalog.ts','src/extensions/security/protection/source.ts','tests/security/protection/catalog.test.ts','tests/security/protection/source.test.ts','tools/security/protection-catalog-browser.ts','tools/security/protection-catalog-controls.py','tools/security/protection-boundary.ts','src/model/json.ts','src/model/types.ts','src/model/serialization.ts','src/validation/schema.ts','src/validation/document.ts','src/registry/registry.ts','src/index.ts','bun.lock','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/04-build/security-field-protection-plan.md','fixtures/extension-package-audit.json']
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pins=lambda:{p:hashfile(root/p) for p in files}
before=pins()
r=subprocess.run(['/opt/homebrew/bin/bun','test','tests/security/protection/'],cwd=root,capture_output=True,text=True,timeout=30)
(out/'final-supplied-tests.log').write_text(r.stdout+r.stderr)
assert r.returncode==0
r2=subprocess.run(['/opt/homebrew/bin/bun',str(out/'controls.ts')],cwd=root,capture_output=True,text=True,timeout=30)
(out/'final-controls.log').write_text(r2.stdout+r2.stderr)
assert r2.returncode==0
assert before==pins()
e=root/'docs/helix/04-build/evidence/security/protection-catalog-20261015'
results={}
for name in ['browser.json','controls.json']:
 d=json.loads((e/name).read_text());checks={p:hashfile(root/p)==sha for p,sha in d['sourceDigests'].items()};assert all(checks.values()),(name,checks)
 rows=d.get('observations',d.get('controls',[]))
 results[name]={'sha256':hashfile(e/name),'sourcePinsMatch':True,'controls':len(rows),'status':d['status'],'independentlyRerun':False}
 shutil.copy2(e/name,out/name)
for p in files:
 target=out/'sources'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,target)
(out/'source-pins.json').write_text(json.dumps({'before':before,'after':pins(),'sourceUnchanged':True},indent=2)+'\n')
(out/'evidence-checks.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'status':'passed','sourceCount':len(files),'suppliedTests':6,'independentControls':48,'suppliedEvidence':results}))
