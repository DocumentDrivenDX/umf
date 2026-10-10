"""Current assembly replay; retained native observations are not a fresh installation."""
import hashlib,json,subprocess
from pathlib import Path
root=Path('docs/helix/04-build/evidence/security');native_path=root/'truss-key-transport.json';native=json.loads(native_path.read_text())
for p,h in native['sourceDigests'].items():
 if hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h:raise RuntimeError('Stale transport oracle')
paths=[str(Path(__file__)),'tools/security/truss-stored-key-replay.ts',str(native_path),'/Users/erik/Projects/truss/packages/postgresql/src/security-stored-key.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-key-transport.ts',native['transportReport']['producer']['directory']+'/producer.js']
pins={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
r=subprocess.run(['bun','tools/security/truss-stored-key-replay.ts'],capture_output=True,text=True,timeout=15)
if r.returncode:raise RuntimeError(r.stderr)
report=json.loads(r.stdout)
if len(report['checks'])!=8 or not all(report['checks'].values()):raise RuntimeError('Assembly checks failed')
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Source changed')
(root/'truss-stored-key-replay.json').write_text(json.dumps({'status':'passed-retained-native-oracle-replay','freshNativeExecution':False,'sourceDigests':pins,**report},indent=2)+'\n')
print(json.dumps({'status':'passed','checks':8,'freshNativeExecution':False}))
