#!/usr/bin/env python3
"""Bounded guest orchestrator for the five-case G03 source/admission probe."""
from __future__ import annotations
import hashlib, json, os, pathlib, selectors, signal, stat, subprocess, sys, time

SOURCE = pathlib.Path('/volume-producer')
COHORT = pathlib.Path('/cohort/aggregate')
PROBE = pathlib.Path('/probe/probe.py')
PINS = pathlib.Path('/probe/source-pins.json')
OUT = pathlib.Path('/out')
WORK = pathlib.Path('/venv')
PYTHON = pathlib.Path('/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11')
TOTAL_SECONDS = 600
WORK_SECONDS = 540
COMMAND_SECONDS = 180
STOP_SECONDS = 10
LOG_LIMIT = 786432
EVIDENCE_LIMIT = 16 * 1024 * 1024
PROBE_SHA = 'b8f672f3ceefac3a9c085424edf50d9173534b7a0803689b7d211b0d41482630'
PINS_SHA = '0def26ca06ff03c7fcf902f8e843f270e4987628c5cdd76c646bfc4fe8817185'
LOCK_SHA = '29c69360e6bcbea329f1ddab05725f727316a729954f123cf11c102486a5c94b'
INDEX_SHA = 'c4d99294936f1631949cb7252d98c8e91b9ba106bf329e251dc9c8ef41e5287d'
REQ_SHA = 'c28065235c7863051de1498c6144dfc1813264f5011dcaff865c2791515b75e4'
MIRROR_SHA = '9e304930ca19abc38091a90e324806649d1f75b1ca799b37448327c5c0b052b9'
P_COMMIT = 'e4299aff8e87e9d211f9d86df2f2013ab9c95945'
P_TREE = '8b98c0d895983ba2b7637dd3aea567dab0943883'
IMAGE_ID = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
BASELINE_PROGRAM_SHA256 = 'c8be43e133c5869b2ac01c520e92177d620b558c326cc8d6aa6b087454ecaf5e'

def digest(path: pathlib.Path, cap: int) -> tuple[str, int]:
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size > cap:
        raise RuntimeError(f'unsafe or oversized input: {path}')
    h=hashlib.sha256(); n=0
    with path.open('rb') as f:
        while True:
            b=f.read(65536)
            if not b: break
            n+=len(b)
            if n>cap: raise RuntimeError(f'input grew beyond limit: {path}')
            h.update(b)
    if n!=st.st_size: raise RuntimeError(f'input changed during hashing: {path}')
    return h.hexdigest(),n

def inventory(root: pathlib.Path) -> tuple[list[dict], int]:
    rows=[]; total=0
    allowed_root={'logs','g03-defaults-native-fixture.json','g03-admission-report.json','guest-result.json'}
    if {p.name for p in root.iterdir()}-allowed_root:
        raise RuntimeError('unexpected guest output member')
    allowed_logs={f'{command}.{stream}.log' for command in
        ('source-commit','source-tree','source-clean-status','python-base-version','bun-version','fixture-generation',
         'offline-install-and-check','admission-probe') for stream in ('stdout','stderr')}
    if (root/'logs').is_dir() and {p.name for p in (root/'logs').iterdir()}-allowed_logs:
        raise RuntimeError('unexpected guest log member')
    for base,dirs,files in os.walk(root,followlinks=False):
        for name in dirs:
            p=pathlib.Path(base)/name
            if p.is_symlink(): raise RuntimeError(f'output symlink: {p}')
        for name in files:
            p=pathlib.Path(base)/name
            h,n=digest(p,EVIDENCE_LIMIT)
            total+=n
            if total>EVIDENCE_LIMIT: raise RuntimeError('output evidence exceeds 16 MiB')
            rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
    return sorted(rows,key=lambda row:row['path']),total

def run_command(name: str, argv: list[str], start: float, deadline: float, logs: pathlib.Path,
                records: list[dict], env: dict[str,str] | None=None) -> int:
    global log_bytes
    now=time.monotonic()
    timeout=max(0.0,min(COMMAND_SECONDS,deadline-now))
    if timeout<=0: raise TimeoutError('aggregate work deadline reached before '+name)
    stdout_path=logs/(name+'.stdout.log'); stderr_path=logs/(name+'.stderr.log')
    proc=subprocess.Popen(argv,cwd=SOURCE,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE,start_new_session=True)
    streams=[proc.stdout,proc.stderr]; paths=[stdout_path,stderr_path]
    files=[p.open('xb') for p in paths]; selector=selectors.DefaultSelector()
    for i,stream in enumerate(streams): os.set_blocking(stream.fileno(),False); selector.register(stream,selectors.EVENT_READ,i)
    hashes=[hashlib.sha256(),hashlib.sha256()]; counts=[0,0]; observed=[0,0]; truncated=[False,False]
    began=time.monotonic(); limit=began+timeout; drain=limit+STOP_SECONDS; timed_out=False; failure=None
    try:
        while selector.get_map():
            now=time.monotonic()
            if now>=limit and not timed_out:
                timed_out=True; failure='command-timeout'
                try: os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError: pass
            if now>=drain and selector.get_map():
                failure=failure or 'command-output-drain-timeout'
                for key in list(selector.get_map().values()):
                    selector.unregister(key.fileobj)
                    try:key.fileobj.close()
                    except OSError:pass
                break
            for key,_ in selector.select(.15):
                idx=key.data
                try: block=os.read(key.fileobj.fileno(),65536)
                except BlockingIOError: continue
                if not block: selector.unregister(key.fileobj); continue
                hashes[idx].update(block); observed[idx]+=len(block)
                allowance=max(0,min(LOG_LIMIT-log_bytes,LOG_LIMIT-sum(counts)))
                if allowance:
                    kept=block[:allowance]; files[idx].write(kept); counts[idx]+=len(kept); log_bytes+=len(kept)
                if len(block)>allowance:
                    truncated[idx]=True; failure=failure or 'aggregate-log-cap-exceeded'
        if proc.poll() is None:
            try: proc.wait(timeout=max(.1,drain-time.monotonic()))
            except subprocess.TimeoutExpired:
                timed_out=True; failure=failure or 'command-timeout'
                try: os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError: pass
                try: proc.wait(timeout=STOP_SECONDS)
                except subprocess.TimeoutExpired: pass
                try: os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError: pass
                try: proc.wait(timeout=STOP_SECONDS)
                except subprocess.TimeoutExpired: failure='command-kill-timeout'
    finally:
        selector.close()
        for f in files:
            f.flush(); os.fsync(f.fileno()); f.close()
    code=proc.returncode
    record={'name':name,'argv':argv,'startedMonotonicOffsetSeconds':round(began-start,3),
            'elapsedSeconds':round(time.monotonic()-began,3),'exitCode':code,'timedOut':timed_out,
            'failure':failure,'streams':[{'path':str(p.relative_to(OUT)),'retainedBytes':counts[i],
                'rawBytesObserved':observed[i],'physicalSha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                'rawSha256':hashes[i].hexdigest(),'truncated':truncated[i],
                'physicalClosure':(p.stat().st_size==counts[i] and (truncated[i] or
                    hashlib.sha256(p.read_bytes()).hexdigest()==hashes[i].hexdigest()))}
                for i,p in enumerate(paths)]}
    if any(not stream['physicalClosure'] for stream in record['streams']):
        raise RuntimeError(name+' log physical closure mismatch')
    records.append(record)
    if failure: raise RuntimeError(f'{name} {failure}')
    if code!=0: raise RuntimeError(f'{name} exited {code}')
    return code

log_bytes=0

def write_json(path: pathlib.Path, value: object) -> None:
    raw=(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
    if len(raw)>128*1024: raise RuntimeError('guest receipt exceeds 128 KiB')
    with path.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())

def observed_text(logs: pathlib.Path, command: str) -> str:
    return '\n'.join((logs/(command+'.'+stream+'.log')).read_text() for stream in ('stdout','stderr')).strip()

def main() -> int:
    start=time.monotonic(); deadline=start+WORK_SECONDS; OUT.mkdir(parents=True,exist_ok=True)
    logs=OUT/'logs'; logs.mkdir()
    record={'profile':'umf.g03-local-linux-admission-guest/3','status':'FAIL_OR_UNKNOWN',
            'sourceCommit':None,'sourceTree':None,'sourceStatus':None,'imageId':IMAGE_ID,
            'probeSha256':PROBE_SHA,'pinsSha256':PINS_SHA,'commandResults':[],'failure':None}
    code=1
    try:
        if digest(PROBE,2*1024*1024)[0]!=PROBE_SHA or digest(PINS,64*1024)[0]!=PINS_SHA:
            raise RuntimeError('frozen probe or pins hash mismatch')
        pins=json.loads(PINS.read_text())
        if pins['sourceP']['commit']!=P_COMMIT or pins['sourceP']['tree']!=P_TREE or pins['runtime']['imageId']!=IMAGE_ID:
            raise RuntimeError('frozen source/runtime identity mismatch')
        if pins.get('expectedBaselineProgramSha256')!=BASELINE_PROGRAM_SHA256:
            raise RuntimeError('baseline program pin differs from the frozen probe expectation')
        expected_versions={'umf-access':'0.1.0.dev8','umf-codegen':'0.1.0a5',
                           'umf-weft':'0.4.55+g03.a96e4f29262e','umf-core':'0.10.3'}
        if pins.get('expectedPackageVersions')!=expected_versions:
            raise RuntimeError('expected package version matrix differs from the frozen candidate profile')
        held_weft=pins.get('cohort',{}).get('heldCandidateRows',{}).get('umf-weft',{})
        if (held_weft.get('version'),held_weft.get('wheel'),held_weft.get('sha256'),held_weft.get('sizeBytes')) != (
                '0.4.55+g03.a96e4f29262e',
                'umf_weft-0.4.55+g03.a96e4f29262e-cp39-abi3-manylinux_2_34_x86_64.whl',
                '51d607f851c72cffbc0dc45a969237f23d90b59185826b9eda56a791e799533e',14373430):
            raise RuntimeError('held Weft candidate pins differ from the frozen operator selection')
        expected={
            'tests/lifecycle/g03-defaults-native-fixture.ts':'8547d5f51aa0af84fc693bb2283ec35fc1aaa255ca3d79ee6a187227a9e7bf6d',
            'tests/binding/fixtures/table-lifecycle-note.json':'0f8a2f5d38d32514ec38fc3bbe393c5b88d45c251c2ae05ac23bea261b0e94ee',
            'python/umf_access/src/umf_access/unified/session_policy.py':'1582fea2148e739beff1378716436ad0ad7bd7839ad154c8e71b185e052e21ee',
            'python/umf_access/src/umf_access/unified/table_reads.py':'618d17c6a839f31e77aaa7043a41e8099f77b94c486cb96ca28cf9f9819c7f44',
            'python/umf_access/tests/test_fixed_query_preparation.py':'77dde4035b7506abfcb97ecb2dbf013b463fdb735b06851353febf048e3b8f21',
            'python/umf_access/tests/test_table_outcomes.py':'99cba3eb97ddd67f0ce06ec94ca67f845dc68995c4a81a7293d4c421770cfc47'}
        source_rows={p:{'sha256':digest(SOURCE/p,4*1024*1024)[0]} for p in expected}
        if any(source_rows[p]['sha256']!=h for p,h in expected.items()): raise RuntimeError('P source file hash mismatch')
        lock=pathlib.Path('/cohort/selected-child-lock.json')
        index=COHORT/'aggregate.json'; req=COHORT/'mirror/requirements.lock'; manifest=COHORT/'mirror/manifest.json'
        for path,want,cap in [(lock,LOCK_SHA,8*1024*1024),(index,INDEX_SHA,4*1024*1024),
                              (req,REQ_SHA,1024*1024),(manifest,MIRROR_SHA,4*1024*1024)]:
            if digest(path,cap)[0]!=want:raise RuntimeError('cohort input hash mismatch: '+str(path))
        rec=[]
        git=['git','-c','safe.directory=/volume-producer','-C',str(SOURCE)]
        git_env=dict(os.environ);git_env['GIT_OPTIONAL_LOCKS']='0'
        run_command('source-commit',git+['rev-parse','HEAD'],start,deadline,logs,rec,git_env)
        run_command('source-tree',git+['rev-parse','HEAD^{tree}'],start,deadline,logs,rec,git_env)
        run_command('source-clean-status',git+['status','--porcelain=v1','--untracked-files=all'],start,deadline,logs,rec,git_env)
        commit=(logs/'source-commit.stdout.log').read_text().strip(); tree=(logs/'source-tree.stdout.log').read_text().strip()
        status=(logs/'source-clean-status.stdout.log').read_text()
        if commit!=P_COMMIT or tree!=P_TREE or status:raise RuntimeError('mounted P source identity/clean status mismatch')
        record.update(sourceCommit=commit,sourceTree=tree,sourceStatus='clean',sourceFiles=source_rows,
            cohortInputs={'selectedLockSha256':LOCK_SHA,'aggregateIndexSha256':INDEX_SHA,
                          'requirementsSha256':REQ_SHA,'mirrorManifestSha256':MIRROR_SHA})
        env=dict(os.environ); env.update({'HOME':'/tmp/home','TMPDIR':'/tmp',
            'BUN_RUNTIME_TRANSPILER_CACHE_PATH':'/tmp/bun-cache','PYTHONDONTWRITEBYTECODE':'1'})
        pathlib.Path('/tmp/home').mkdir(exist_ok=True); pathlib.Path('/tmp/bun-cache').mkdir(exist_ok=True)
        run_command('python-base-version',[str(PYTHON),'--version'],start,deadline,logs,rec,env)
        run_command('bun-version',['bun','--version'],start,deadline,logs,rec,env)
        python_version=observed_text(logs,'python-base-version')
        bun_version=observed_text(logs,'bun-version')
        if python_version!='Python '+pins['runtime']['python']:
            raise RuntimeError('observed Python version differs from frozen runtime pin')
        if bun_version!='1.4.3':
            raise RuntimeError('observed Bun version differs from the frozen fixture-tool pin 1.4.3')
        record['runtimeVersions']={'python':python_version,'bun':bun_version}
        run_command('fixture-generation',['bun','tests/lifecycle/g03-defaults-native-fixture.ts',
            '/out/g03-defaults-native-fixture.json'],start,deadline,logs,rec,env)
        run_command('offline-install-and-check',['bash','-euo','pipefail','-c',
            f'{PYTHON} -m venv /venv && '
            'unshare --net /venv/bin/python -I -m pip --isolated install '
            '--disable-pip-version-check --no-cache-dir --no-compile --only-binary=:all: --require-hashes '
            '--index-url file:///cohort/aggregate/mirror/simple -r /cohort/aggregate/mirror/requirements.lock && '
            'unshare --net /venv/bin/python -I -m pip --isolated check && '
            '/venv/bin/python -I /verify_weft_wheel.py'],start,deadline,logs,rec,env)
        install_stdout=observed_text(logs,'offline-install-and-check')
        wheel_lines=[line for line in install_stdout.splitlines() if line.startswith('{') and 'wheelSha256' in line]
        if len(wheel_lines)!=1: raise RuntimeError('installed Weft wheel-member correspondence receipt missing/ambiguous')
        wheel_proof=json.loads(wheel_lines[0])
        if wheel_proof.get('wheelSha256')!='51d607f851c72cffbc0dc45a969237f23d90b59185826b9eda56a791e799533e':
            raise RuntimeError('installed Weft wrapper/native bytes do not bind the selected Linux wheel')
        record['weftWheelCorrespondence']=wheel_proof
        run_command('admission-probe',['unshare','--net','/venv/bin/python','-I',
            '/probe/probe.py','--fixture','/out/g03-defaults-native-fixture.json',
            '--report','/out/g03-admission-report.json'],start,deadline,logs,rec,env)
        fixture=OUT/'g03-defaults-native-fixture.json'; report=OUT/'g03-admission-report.json'
        if digest(fixture,2*1024*1024)[1]>2*1024*1024 or digest(report,128*1024)[1]>128*1024:
            raise RuntimeError('fixture or probe report exceeds its individual bound')
        probe_report=json.loads(report.read_text())
        if probe_report.get('status')!='PASS':raise RuntimeError('five-case probe did not report PASS')
        record['probeStatus']=probe_report['status']; record['commandResults']=rec
        record['status']='PASS_COMPILER_ADMISSION_ONLY'; code=0
    except BaseException as exc:
        record['commandResults']=locals().get('rec',record['commandResults'])
        record['failure']=type(exc).__name__+': '+str(exc)[:240]
    record['elapsedSeconds']=round(time.monotonic()-start,3)
    if record['elapsedSeconds']>TOTAL_SECONDS:record['status']='FAIL_OR_UNKNOWN';record['failure']='guest total deadline exceeded';code=1
    try:
        rows,total=inventory(OUT)
        record['outputFiles']=rows;record['outputBytes']=total
        if total+128*1024>EVIDENCE_LIMIT:
            record['status']='FAIL_OR_UNKNOWN';record['failure']='output evidence plus terminal receipt exceeds cap';code=1
    except BaseException as exc:
        record['status']='FAIL_OR_UNKNOWN';record['failure']='output inventory failure: '+type(exc).__name__+': '+str(exc)[:160];code=1
    write_json(OUT/'guest-result.json',record)
    return code

if __name__=='__main__': raise SystemExit(main())
