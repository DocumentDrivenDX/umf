"""Attack retained transport evidence coverage; never qualify a backend."""
import copy
import hashlib
import json
from pathlib import Path
root=Path('docs/helix/04-build/evidence/security')
source=root/'weft-protocol-transport.json'
workspace=Path('/Users/erik/.codex/worktrees/1598/umf')
assert Path.cwd()==workspace and Path(__file__).resolve()==workspace/'tools/security/weft-protocol-evidence-controls.py'
paths=[source,Path(__file__),Path('tools/security/weft_protocol_evidence.py')]
frozen={str(p):p.read_bytes() for p in paths}
sources={p:hashlib.sha256(data).hexdigest() for p,data in frozen.items()}
# Execute exactly the captured helper bytes, rather than a separately loaded file.
namespace={'__name__':'reviewed_protocol_evidence','__file__':str(workspace/'tools/security/weft_protocol_evidence.py')}
exec(compile(frozen['tools/security/weft_protocol_evidence.py'],namespace['__file__'],'exec'),namespace)
EXPECTED,valid_protocol=namespace['EXPECTED'],namespace['valid_protocol']
receipt=json.loads(frozen[str(source)])
checks=[]
def check(id,value,expected):
    observed=valid_protocol(value)
    checks.append({'id':id,'expected':expected,'observed':observed})
    if observed is not expected:raise RuntimeError(id)
check('unaltered-receipt',receipt,True)
for path in receipt['sourceDigests']:
    value=copy.deepcopy(receipt);del value['sourceDigests'][path]
    check('omitted-source:'+path,value,False)
for id in EXPECTED:
    value=copy.deepcopy(receipt);row=next(r for r in value['observations'] if r['id']==id)
    row['expected']=row['observed']=not EXPECTED[id]
    check('reversed-expectation:'+id,value,False)
value=copy.deepcopy(receipt);value['observations'][0]['id']='unrelated-success'
check('unrelated-id',value,False)
value=copy.deepcopy(receipt);value['observations'][0]=copy.deepcopy(value['observations'][1])
check('duplicate-id',value,False)
value=copy.deepcopy(receipt);value['sourcesUnchanged']=False
check('changed-source-declaration',value,False)
assert all(Path(p).read_bytes()==data for p,data in frozen.items()),'Source changed during mutant replay'
(root/'weft-protocol-evidence-controls.json').write_text(json.dumps({'status':'passed','sourcesUnchanged':True,'nativeImplementationQualified':False,'scope':'Independent source-coverage and expected-control receipt mutants only; no native/semantic qualification','sourceDigests':sources,'observations':checks},indent=2)+'\n')
print(json.dumps({'status':'passed','checks':len(checks)}))
