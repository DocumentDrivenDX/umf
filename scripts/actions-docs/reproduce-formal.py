"""Reproduce the original bounded SMT/TLC design probes without modifying certified inputs."""
from pathlib import Path
import subprocess,sys,shutil,hashlib,urllib.request,json
repo=Path(__file__).resolve().parents[2]
source=repo/'docs/helix/02-design/experiments/actions/formal'
cache=repo/'.cache/actions-formal-reproduction';cache.mkdir(parents=True,exist_ok=True)
venv=cache/'venv';jar=cache/'tla2tools.jar'
if not venv.exists():subprocess.run([sys.executable,'-m','venv',str(venv)],check=True)
python=venv/'bin/python'
subprocess.run([str(python),'-m','pip','install','z3-solver==4.15.3.0'],check=True)
for name in ['semantics.py','Commands.tla','history_oracle.py']:
 shutil.copy2(source/name,cache/name)
subprocess.run([str(python),str(cache/'semantics.py')],check=True)
if '--tlc' in sys.argv:
 if not jar.exists():
  with urllib.request.urlopen('https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar') as response:jar.write_bytes(response.read())
 if hashlib.sha256(jar.read_bytes()).hexdigest()!='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88':raise RuntimeError('Pinned TLC 1.7.4 artifact mismatch')
 # Copy the original runner; change only its tooling location and immutable runtime image.
 runner=(source/'run_tlc.py').read_text().replace('/private/tmp/umf-actions-formal-tools',str(cache)).replace('umf-core-replay:latest','sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249')
 (cache/'run_tlc.py').write_text(runner)
 subprocess.run([str(python),str(cache/'run_tlc.py')],check=True)
manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(cache.iterdir()) if p.is_file() and p.name!='reproduction-manifest.json'}
(cache/'reproduction-manifest.json').write_text(json.dumps({'scope':'Original bounded design probes; not implementation qualification','z3':'4.15.3.0','tlc':'1.7.4','executed':['SMT']+(['TLC'] if '--tlc' in sys.argv else []),'files':manifest},indent=2)+'\n')
print('Outputs retained in',cache)
