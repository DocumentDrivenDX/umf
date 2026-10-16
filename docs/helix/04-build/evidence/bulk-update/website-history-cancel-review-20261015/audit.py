import pathlib,json,gzip,hashlib,base64,subprocess,shutil
base=pathlib.Path('/Users/erik/.codex/worktrees/security-action-source-custody/umf');out=pathlib.Path('/private/tmp/umf-history-cancel-review-20261015');site=base/'docs/helix/05-deploy/microsite';h=lambda b:hashlib.sha256(b).hexdigest();commit='4180f76dcfa9b1d9bfca172b9c76b38d6fbaa4eb';truss='/private/tmp/truss-main-integration-20261010'
p=json.loads((site/'assets/truss-browser/provenance.json').read_bytes());raw=(site/'assets/truss-browser/bundle.json.gz').read_bytes();assert h(raw)==p['archiveSha256'];a=json.loads(gzip.decompress(raw));assert h(a['manifestUtf8'].encode())==p['manifestSha256'];m=json.loads(a['manifestUtf8']);assert len(set(x['path'] for x in a['files']))==len(a['files']);assert set(x['path'] for x in a['files'])==set(m['assets']);assert (site/'dist/truss-browser/manifest.json').read_bytes()==a['manifestUtf8'].encode()
for x in a['files']:
 b=base64.b64decode(x['base64']);e=m['assets'][x['path']];assert h(b)==e['sha256'];assert len(b)==e['bytes'];assert b==(site/'dist/truss-browser'/x['path']).read_bytes();assert b==(pathlib.Path('/private/tmp/truss-browser-cancel-reviewed-a-20261015')/x['path']).read_bytes()
for name,digest in m['sourceHashes'].items():
 b=subprocess.check_output(['git','show',commit+':'+name],cwd=truss);assert h(b)==digest,(name,h(b),digest)
ownerbytes=subprocess.check_output(['git','show',commit+':docs/helix/04-build/evidence/browser-cancel-20261015/chromium.json'],cwd=truss);owner=json.loads(ownerbytes);assert owner['bundle']=={'manifestSha256':p['manifestSha256'],'providerSha256':m['assets']['store.js']['sha256']};(out/'original-owner-receipt.json').write_bytes(ownerbytes)
artifacts=[]
def walk(v):
 if isinstance(v,dict):
  if set(['mediaType','utf8','sha256'])<=set(v):assert h(v['utf8'].encode())==v['sha256'];artifacts.append(v['sha256'])
  for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(owner)
(out/'bundle-correspondence.json').write_text(json.dumps({'passed':True,'sourceCommit':commit,'archiveSha256':h(raw),'manifestSha256':p['manifestSha256'],'providerSha256':m['assets']['store.js']['sha256'],'assets':len(a['files']),'originalSourcePins':len(m['sourceHashes']),'exactOriginalOwnerBundle':True,'originalOwnerReceipt':True,'ownerReceiptSha256':h(ownerbytes),'ownerArtifactDigestsChecked':len(artifacts)},indent=2)+'\n');print('Audited',len(a['files']),'assets,',len(m['sourceHashes']),'source pins,',len(artifacts),'owner artifact digests')
r=json.loads((base/'docs/helix/04-build/evidence/bulk-update/website-compiler-results.json').read_text());fixture=out/'website-browser-fixture';fixture.mkdir(exist_ok=True)
for n,d in r['hashes'].items():
 p=base/n if n.startswith('docs/') else site/'dist'/n;assert h(p.read_bytes())==d,n
 if n.startswith('docs/'):
  q=fixture/n;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
for n,t in [('node_modules',base/'node_modules'),('docs/helix/05-deploy/microsite/dist',site/'dist')]:
 q=fixture/n
 if not q.exists():q.symlink_to(t,target_is_directory=True)
(fixture/'docs/helix/04-build/evidence/bulk-update').mkdir(parents=True,exist_ok=True);(out/'browser-temp').mkdir(exist_ok=True)
(out/'website-correspondence.json').write_text(json.dumps({'passed':True,'hashes':r['hashes'],'websiteSourceAndServedPins':len(r['hashes'])},indent=2)+'\n')
root=out/'compiler-fixture';rel=pathlib.Path('docs/helix/05-deploy/microsite')
for name in ['build-action-compiler.ts','action-compiler.ts','action-compiler.html','seal-intent.ts','bulk-intent.ts','assets/weft-local-mutation/provenance.json','assets/weft-local-mutation/weft_wasm_bg.wasm.gz','assets/weft-local-mutation/weft_wasm.js']:
 p=root/rel/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(base/rel/name,p)
p=root/'docs/helix/03-test/fixtures/bulk-update/local-products-input.json';p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(base/'docs/helix/03-test/fixtures/bulk-update/local-products-input.json',p)
r=subprocess.run(['bun',str(rel/'build-action-compiler.ts')],cwd=root,capture_output=True,text=True);assert r.returncode==0,r.stderr
files=[p for p in (root/rel/'dist').rglob('*') if p.is_file()];hashes={}
for p in files:
 n=p.relative_to(root/rel/'dist');assert p.read_bytes()==(base/rel/'dist'/n).read_bytes(),n;hashes[str(n)]=h(p.read_bytes())
(out/'compiler-build.json').write_text(json.dumps({'passed':True,'byteIdenticalOutputs':len(files),'hashes':hashes},indent=2)+'\n');print('Current21pins pass; compiler6outputs reproduced')
p=pathlib.Path('/private/tmp/umf-execute-website-review-20261015/packaging-controls.py');(out/'packaging-controls.py').write_text(p.read_text().replace('umf-execute-website-review-20261015','umf-history-cancel-review-20261015'))
