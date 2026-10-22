import hashlib, json, subprocess, time, os
from pathlib import Path
Path(os.environ['TMPDIR']).mkdir(parents=True,exist_ok=True)
expected='5529ead377ddf2ae267c426e18aec3d0ca90e9e4'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==expected
out=Path('fixtures/validation/core-check-refresh');out.mkdir(parents=True,exist_ok=True)
record={'sourceRevision':expected,'complete':False,'driverSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'containerInit':True,'gateHelperSha256':'277f469bb4846938eba659caf5115ab216344137754bc390aefb62511d6cbd2d','executionFilesystem':'Docker named volume umf-final-qualification-40c2590a; original snapshot plus exact 5529ead3 process-isolated Git update verified against HEAD','historicalPathAlias':'/work mounts the same Docker volume as the execution directory','sourceUpdateBundleSha256':'ab1311bd0ad7faad415c2ce7f3e3c6d1482e88ad934ff1f065240722dd25951e','snapshotSha256':'d9eb7a5cd6eea45b274478d418d4c74916244d9bfed9cc9b39b612a5aae3820d','runs':[]}
stages=[('source-copy-integrity',['git','diff','--exit-code','HEAD','--','src','scripts','spec','tests','native','package.json','bun.lock','bunfig.toml','docs/helix/01-frame','docs/helix/02-design','docs/helix/03-test']),('arrow-corpus-control',['bun','scripts/run-tests.ts','tests/arrow/flatbuffer-encode.test.ts']),('prepare',['python','/opt/replay.py','prepare']),('test-prerequisites',['bun','run','test:prepare']),('regression',['.venv/bin/python','scripts/refresh-core-checks.py','--regression']),('native',['python','/opt/replay.py','native']),('auxiliary',['python','/opt/replay.py','auxiliary']),('publish',['python','/opt/replay.py','publish']),('gates',['python','/opt/isolated-gates.py']),('full-suite',['bun','run','test']),('action-browser',['bun','scripts/actions-browser.ts']),('post-full-integrity',['bun','scripts/verify-current-core-evidence.ts'])]
for stage,command in stages:
 record['runningStage']=stage;(out/'pipeline.json').write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps({'stage':stage,'command':command}),flush=True)
 log=out/('pipeline-'+stage+'.log');started=time.time()
 with log.open('wb') as f:result=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT)
 row={'stage':stage,'command':command,'exitCode':result.returncode,'elapsedSeconds':round(time.time()-started,3),'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}
 record['runs'].append(row);record['runningStage']=None;(out/'pipeline.json').write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps(row),flush=True)
 if result.returncode:raise SystemExit(result.returncode)
record['complete']=True;(out/'pipeline.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'complete':True,'sourceRevision':expected}),flush=True)
