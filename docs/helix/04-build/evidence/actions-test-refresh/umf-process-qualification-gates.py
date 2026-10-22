from pathlib import Path
import subprocess
gates=sorted(str(p) for p in Path('tests/core-ideals').glob('*.test.ts') if p.name.endswith(('conformance.test.ts','evidence.test.ts')))
assert len(gates)==8,gates
subprocess.run(['git','diff','--exit-code','HEAD','--','src','scripts','spec','tests','native','package.json','bun.lock','bunfig.toml'],check=True)
subprocess.run(['bun','scripts/run-tests.ts',*gates],check=True)
subprocess.run(['bun','scripts/verify-current-core-evidence.ts'],check=True)
