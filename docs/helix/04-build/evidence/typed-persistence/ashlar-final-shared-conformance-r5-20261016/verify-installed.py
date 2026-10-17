from pathlib import Path
import sys,zipfile,hashlib,json
out=Path(__file__).parent
site=Path(sys.prefix)/'lib/python3.11/site-packages';receipts=[]
for wheel in [Path('/private/tmp/sdk-completion-runtime-r5-wheels/umf_access-0.1.0.dev0-py3-none-any.whl'),out/'wheels/ashlar_graph_toolkit-0.1.0.dev0-py3-none-any.whl',Path('/private/tmp/weft-prefix-local/wheels/weft_sql-0.4.42.dev0-cp39-abi3-macosx_11_0_arm64.whl')]:
 with zipfile.ZipFile(wheel) as z:
  payloads=[n for n in z.namelist() if not n.endswith('/') and '.dist-info/' not in n]
  for n in payloads:
   assert (site/n).read_bytes()==z.read(n),(wheel,n)
   if n.startswith('umf_access/'):
    assert (Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/python/umf_access/src')/n).read_bytes()==z.read(n),n
   if n.startswith(('ashlar/','ashlar_host/')):
    assert (Path('/private/tmp/ashlar-sdk-adoption/src')/n).read_bytes()==z.read(n),n
  receipts.append({'wheel':str(wheel),'sha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),'installedPayloadMatches':len(payloads)})
import umf_access,weft,ashlar
assert Path(umf_access.__file__).is_relative_to(site)
assert Path(weft.__file__).is_relative_to(site)
assert Path(ashlar.__file__).is_relative_to(site)
p=out/'installed-wheels.json';p.write_text(json.dumps(receipts,indent=2)+'\n');print(json.dumps(receipts))
