import pathlib, json, gzip, hashlib, shutil, subprocess, base64, copy
base=pathlib.Path('/Users/erik/.codex/worktrees/security-action-source-custody/umf')
out=pathlib.Path('/private/tmp/umf-load-website-review-20261015')
root=out/'fixture'; site=root/'docs/helix/05-deploy/microsite'; original=base/'docs/helix/05-deploy/microsite'
h=lambda b:hashlib.sha256(b).hexdigest()
for rel in ['docs/helix/05-deploy/microsite/build-truss-browser.ts','docs/helix/05-deploy/microsite/truss-catalog-worker.ts','docs/helix/05-deploy/microsite/load-intent.ts','docs/helix/05-deploy/microsite/assets/truss-browser/bundle.json.gz','docs/helix/05-deploy/microsite/assets/truss-browser/provenance.json','docs/helix/03-test/fixtures/bulk-update/local-products-input.json']:
 p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(base/rel,p)
run=lambda:subprocess.run(['bun','docs/helix/05-deploy/microsite/build-truss-browser.ts'],cwd=root,capture_output=True,text=True)
r=run();assert r.returncode==0,r.stderr
files=[p for p in (site/'dist').rglob('*') if p.is_file()]
for p in files:assert p.read_bytes()==(original/'dist'/p.relative_to(site/'dist')).read_bytes(),p
cases=[{'name':'Fresh exact original builder reproduces all 375 outputs including scoped package notices','passed':True,'files':len(files)}]
provenance=json.loads((site/'assets/truss-browser/provenance.json').read_text());raw=(site/'assets/truss-browser/bundle.json.gz').read_bytes();archive=json.loads(gzip.decompress(raw))
before={str(p.relative_to(site)):h(p.read_bytes()) for p in files}
def refuse(name,mutate,repin=True):
 a=copy.deepcopy(archive);mutate(a);b=gzip.compress(json.dumps(a,separators=(',',':')).encode());p=copy.deepcopy(provenance)
 if repin:p['archiveSha256']=h(b)
 (site/'assets/truss-browser/bundle.json.gz').write_bytes(b);(site/'assets/truss-browser/provenance.json').write_text(json.dumps(p));r=run();assert r.returncode!=0,name
 assert {str(p.relative_to(site)):h(p.read_bytes()) for p in files}==before,name+' changed output before refusal'
 cases.append({'name':name,'passed':True,'stderr':r.stderr[-500:]})
refuse('Changed compressed archive without original pin refuses',lambda a:None,False)
refuse('Manifest content differs from original pin refuses',lambda a:a.update(manifestUtf8=a['manifestUtf8']+' '))
refuse('Asset content differs from original manifest refuses',lambda a:a['files'][0].update(base64=base64.b64encode(b'wrong').decode()))
refuse('Parent traversal refuses even with repinned archive',lambda a:a['files'][0].update(path='../escape'))
refuse('Scoped parent traversal refuses even with repinned archive',lambda a:a['files'][0].update(path='@scope/../escape'))
refuse('Duplicate file path refuses',lambda a:a['files'].append(a['files'][0]))
refuse('Omitted original asset refuses',lambda a:a['files'].pop())
(out/'packaging-controls.json').write_text(json.dumps({'passed':len(cases),'scope':'Independent exact builder execution in isolated temp copy; no repository outputs modified','cases':cases},indent=2)+'\n')
print('Passed',len(cases),'packaging controls; exact outputs',len(files))
