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
 image='eclipse-temurin@sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5'
 expected_image='sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5'
 subprocess.run(['docker','pull','--platform','linux/arm64',image],check=True)
 inspected=json.loads(subprocess.check_output(['docker','image','inspect',image]))[0]
 assert image in inspected['RepoDigests'] and inspected['Os']=='linux' and inspected['Architecture']=='arm64'
 java_command=['docker','run','--rm','--network','none','--entrypoint','java',image,'--version']
 java=subprocess.run(java_command,text=True,capture_output=True,check=True)
 assert java.stdout.startswith('openjdk 21.')
 (cache/'java-version.log').write_text(java.stdout+java.stderr)
 (cache/'runtime-observation.json').write_text(json.dumps({'imageReference':image,'manifestDigest':expected_image,'repoDigestVerified':True,'imageId':inspected['Id'],'os':inspected['Os'],'architecture':inspected['Architecture'],'javaCommand':java_command,'exitCode':java.returncode,'javaVersion':java.stdout.splitlines()[0],'javaLogSha256':hashlib.sha256((java.stdout+java.stderr).encode()).hexdigest()},indent=2)+'\n')
 if not jar.exists():
  with urllib.request.urlopen('https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar') as response:jar.write_bytes(response.read())
 if hashlib.sha256(jar.read_bytes()).hexdigest()!='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88':raise RuntimeError('Pinned TLC 1.7.4 artifact mismatch')
 # Adapt tooling paths/runtime and its descriptive annotation; properties and bounds stay exact.
 original=(source/'run_tlc.py').read_text()
 assert original.count('/private/tmp/umf-actions-formal-tools')==3 and original.count('umf-core-replay:latest')==3
 runner=original.replace('/private/tmp/umf-actions-formal-tools',str(cache)).replace('umf-core-replay:latest',image).replace('Java21 isolated existing UMF replay image','Java21 pinned public Eclipse Temurin runtime')
 (cache/'run_tlc.py').write_text(runner)
 subprocess.run([str(python),str(cache/'run_tlc.py')],check=True)
manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(cache.iterdir()) if p.is_file() and p.name!='reproduction-manifest.json'}
(cache/'reproduction-manifest.json').write_text(json.dumps({'scope':'Original bounded design probes; not implementation qualification','z3':'4.15.3.0','tlc':'1.7.4','executed':['SMT']+(['TLC'] if '--tlc' in sys.argv else []),'files':manifest},indent=2)+'\n')
print('Outputs retained in',cache)
