"""Current pure validator replay over retained original native canonical outputs."""
import hashlib,json,subprocess
from pathlib import Path
root=Path('docs/helix/04-build/evidence/security');oracle_path=root/'namespace-canonical-oracle.json';oracle=json.loads(oracle_path.read_text())
for path,pin in oracle['sourceDigests'].items():
 if hashlib.sha256(Path(path).read_bytes()).hexdigest()!=pin:raise RuntimeError('Original producer evidence changed')
paths=[str(Path(__file__)),'tools/security/truss-key-namespace.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts',str(oracle_path)]
pins={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
result=subprocess.run(['bun','tools/security/truss-key-namespace.ts'],input=json.dumps({'cases':oracle['cases']}),capture_output=True,text=True,timeout=15)
if result.returncode:raise RuntimeError('Current namespace replay refused: '+result.stderr[:2000])
report=json.loads(result.stdout)
if len(report['observations'])!=len(oracle['cases']) or any(r['expected']!=r['observed'] for r in report['observations']):raise RuntimeError('Replay corpus mismatch')
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Replay source changed')
receipt={'status':'passed-retained-native-oracle-replay','sourceDigests':pins,'observations':report['observations'],'cases':oracle['cases'],'freshNativeExecution':False,'scope':'Current portable namespace factory on retained original native canonical outputs. Immutable selection mutation controls pass. Native producer source correspondence is retained separately; no fresh native database execution, native original namespace/registry authority or complete graph profile qualification.'}
(root/'truss-key-namespace-replay.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(report['observations']),'freshNativeExecution':False}))
