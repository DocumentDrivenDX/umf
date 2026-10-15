import pathlib,subprocess,hashlib,json,zipfile,os,sys
repo=pathlib.Path('/Users/erik/Projects/weft');commit='a6168847c22717b012ee394e304bf536d5268645';out=pathlib.Path('/private/tmp/umf-weft-current-root-20261015');out.mkdir(exist_ok=True)
def blob(p):return subprocess.check_output(['git','show',f'{commit}:{p}'],cwd=repo)
def sha(b):return hashlib.sha256(b).hexdigest()
evidence='docs/helix/04-build/evidence/current-query-object-20261015/';receipt=json.loads(blob(evidence+'receipt.json'));verified={}
for group in ['sourceSha256','composedUpstreamSourceSha256','evidenceSha256']:
 for p,h in receipt[group].items():
  path=evidence+p if group=='evidenceSha256' else p;assert sha(blob(path))==h,path;verified[path]=h
wheel=pathlib.Path('/private/tmp/weft-current-object-v0432-wheels/weft_sql-0.4.32-cp39-abi3-macosx_11_0_arm64.whl');assert sha(wheel.read_bytes())==receipt['candidateWheelSha256']
installed=pathlib.Path('/private/tmp/weft-current-object-v0432-installed');mods=list(installed.rglob('*.so'));assert len(mods)==1;before=sha(mods[0].read_bytes());assert before==receipt['installedNativeModuleSha256']
with zipfile.ZipFile(wheel) as z:
 names=[x for x in z.namelist() if x.endswith('.so')];assert len(names)==1 and sha(z.read(names[0]))==before
paths=subprocess.check_output(['git','ls-tree','-r','--name-only',commit,'tests/current-query-designation','tests/application-lineage','tests/lineage-v02'],cwd=repo,text=True).splitlines()
for p in paths:
 dest=out/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(blob(p))
checks=[]
for p in ['tests/current-query-designation/issued-current-python.py','tests/current-query-designation/python-bridge.py','tests/lineage-v02/python-bridge.py','tests/lineage-v02/issued-python.py']:
 c=subprocess.run([sys.executable,str(out/p)],cwd=out,env={**os.environ,'PYTHONPATH':str(installed)},text=True,capture_output=True);name=pathlib.Path(p).parent.name+'-'+pathlib.Path(p).name;(out/(name+'.log')).write_text(c.stdout+c.stderr);assert c.returncode==0,(p,c.stderr);checks.append({'path':p,'result':json.loads(c.stdout)})
assert sha(mods[0].read_bytes())==before
result={'commit':commit,'scope':'Independent installed candidate artifact and source custody replay; no root rebuild or native permission','python':sys.version,'wheelSha256':sha(wheel.read_bytes()),'nativeModuleSha256':before,'verifiedCommittedPins':verified,'checks':checks};(out/'replay.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'packet':str(out),'corpora':len(checks),'verifiedPins':len(verified)}))
