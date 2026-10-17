import hashlib,json,sysconfig,zipfile,subprocess
from pathlib import Path
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
sdk=Path('/private/tmp/sdk-completion-runtime-r12-wheels/umf_access-0.1.0.dev0-py3-none-any.whl')
weft=Path('/private/tmp/weft-combined-sdk-local-r12/wheels/weft_sql-0.4.42.dev0-cp39-abi3-macosx_11_0_arm64.whl')
site=Path(sysconfig.get_path('purelib'));rows={};wrows={}
def sha(b):return hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(sdk) as z:
 for name in z.namelist():
  if name.startswith('umf_access/') and not name.endswith('/'):
   wheel=z.read(name);source=(root/'python/umf_access/src'/name).read_bytes();installed=(site/name).read_bytes()
   assert wheel==source==installed,name
   rows[name]={'sha256':sha(wheel),'bytes':len(wheel)}
with zipfile.ZipFile(weft) as z:
 for name in z.namelist():
  if name.startswith('weft/') and not name.endswith('/'):
   wheel=z.read(name);installed=(site/name).read_bytes();assert wheel==installed,name
   wrows[name]={'sha256':sha(wheel),'bytes':len(wheel)}
receipt={'status':'PASS','scope':'exact source/wheel/installed byte custody; no native capability inference','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sdkWheel':str(sdk),'sdkWheelSha256':sha(sdk.read_bytes()),'weftWheel':str(weft),'weftWheelSha256':sha(weft.read_bytes()),'python':str(Path(sysconfig.get_path('scripts'))/'python'),'sdkPayloadCount':len(rows),'sdkPayloads':rows,'weftPayloads':wrows,'temporal':'HELD'}
Path('/private/tmp/sdk-r12-byte-correspondence.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ('sdkPayloads','weftPayloads')}))
