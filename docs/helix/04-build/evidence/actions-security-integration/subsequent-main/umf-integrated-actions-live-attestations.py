from pathlib import Path
import json,hashlib,subprocess,urllib.request,urllib.parse,datetime,concurrent.futures
R=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf');S=R/'docs/helix/05-deploy/microsite/dist';D=R/'.cache/actions-live-attestations';D.mkdir(parents=True,exist_ok=True)
base='https://documentdrivendx.github.io/umf/';cli='/private/tmp/umf-actions-innsigle-verifier/src/cli.mjs'
verifier=Path(cli).parents[1];verifier_revision='4185eb56beb7b52beaa4a00c2fc897f93d44b939'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=verifier,text=True).strip()==verifier_revision
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=verifier,text=True).strip(),'Verifier checkout is dirty'
expected_pages={base+p for p in ['index.html','docs.html','demo.html','ecosystem.html','explorer.html','schema-browser.html']}|{base+'actions/'+p for p in json.loads((S/'actions/manifest.json').read_text())['outputs'] if p.endswith('.html')}
assert len(expected_pages)==16
def sha(b):return hashlib.sha256(b).hexdigest()
def get(url):
 request=urllib.request.Request(url,headers={'User-Agent':'UMF-release-verification','Cache-Control':'no-cache'})
 with urllib.request.urlopen(request,timeout=40) as response:
  assert response.status==200;return response.read()
keys=get(base+'.well-known/innsigle/keys.json');assert keys==(R/'.innsigle/public/keys.json').read_bytes();(D/'keys.json').write_bytes(keys)
rows=[]
for local in sorted((R/'.innsigle/public/claims').glob('*.attestation.json')):
 claim=get(base+'.well-known/innsigle/claims/'+local.name);assert claim==local.read_bytes(),('Live claim differs',local.name)
 payload=json.loads(claim)['payload'];subject=payload['subjects'][0];uri=subject['uri'];assert uri.startswith(base)
 relative=uri[len(base):];assert relative.endswith('.html') and '..' not in relative
 content=get(uri);assert content==(S/relative).read_bytes(),('Live HTML differs',relative)
 assert subject['digest']=={'alg':'sha256','value':sha(content)}
 assert payload['issuer']['key_url']==base+'.well-known/innsigle/keys.json'
 att=D/local.name;att.write_bytes(claim);html=D/relative.replace('/','-');html.write_bytes(content)
 result=subprocess.run(['node',cli,'verify','--attestation',str(att),'--content',str(html),'--keys',str(D/'keys.json')],capture_output=True,text=True,check=True)
 assert result.stdout.startswith('VALID\n');rows.append({'uri':uri,'htmlSha256':sha(content),'attestationSha256':sha(claim),'verification':'VALID'})
assert len(rows)==16 and len({r['uri'] for r in rows})==16 and {r['uri'] for r in rows}==expected_pages
manifest=json.loads((S/'actions/manifest.json').read_text());assets={}
for path,h in manifest['assetHashes'].items():
 content=get(base+'actions/'+path);assert sha(content)==h and content==(S/'actions'/path).read_bytes();assets[path]=h
served_files=sorted(p for p in S.rglob('*') if p.is_file());assert all(not p.is_symlink() and p.suffix.lower()!='.zip' for p in served_files)
def verify_served(local):
 relative=str(local.relative_to(S));content=get(base+urllib.parse.quote(relative,safe='/'));assert content==local.read_bytes(),('Live served asset differs',relative);return relative,sha(content)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:served_artifacts=dict(pool.map(verify_served,served_files))
print(json.dumps({'completeServedArtifactCount':len(served_artifacts),'allDeployedBytesMatch':True}),flush=True)
report={'profile':'umf.actions.live-attestation-verification/1','verifiedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'site':base,'pages':rows,'guideAssetHashes':assets,'completeServedArtifactSha256':served_artifacts,'keysSha256':sha(keys),'verifierRevision':verifier_revision,'verifierCheckoutClean':True,'scope':'Actual deployed HTML, signed exact subject URIs, public claims/keys and guide-bound assets; independent responsive browser report covers visual/layout checks.'}
(D/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'pages':len(rows),'actionsPages':10,'signatures':'VALID','guideAssets':list(assets)}))
