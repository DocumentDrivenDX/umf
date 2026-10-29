#!/usr/bin/env python3
"""Held bounded Docker operator for the five-case local G03 admission probe."""
from __future__ import annotations
import hashlib, importlib.util, json, os, pathlib, stat, subprocess, sys, time, uuid

ROOT=pathlib.Path('/private/tmp/g03-local-linux-admission-operator-002')
PROBE_ROOT=pathlib.Path('/private/tmp/g03-local-linux-admission-probe-002')
FULL18=pathlib.Path('/private/tmp/migration-full18-e4299aff8-002')
AGG=FULL18/'aggregate'
LOCK=FULL18/'cells/linux-x86_64-py311/cohort.lock.json'
SOURCE_VOLUME='umf-migration-source-267675510'
IMAGE='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PLATFORM='linux/amd64'
TOTAL=600; COMMAND=180; STOP=10; RESERVE=60
LOG_LIMIT=1024*1024; EVIDENCE_LIMIT=16*1024*1024
PROBE_SHA='032e0546ad4d7846845da0a77a52a2efcab28be7318b1b35204532068ba4f8ef'
PINS_SHA='82db10f7a95989cc7b68d468710ba97e7d606881c8cb2d01accaba6005211dc6'
CAPTURE_HELPER=pathlib.Path('/private/tmp/sdk-057-local3600-public-h-operator-proposal011/run_public_h_docker.py')
CAPTURE_HELPER_SHA='8e383bece7d44484421302f8be32fdb1ba1ed96cd895749093a58171648cf1cd'
WEFT_VERIFIER=ROOT/'verify_weft_wheel.py'
WEFT_VERIFIER_SHA='cd3f8026acf1457604076b2937d01e40e3edeb19191121d915a61c7f91ec601b'
WEFT_WHEEL=AGG/'mirror/files/umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl'
WEFT_WHEEL_SHA='b34ca17fa37412afa7b8e8bd86aac8ee67a3c895a9b253221e1d582b39073a85'
WEFT_WHEEL_SIZE=14347375

def fail(msg): raise RuntimeError(msg)
def regular(path: pathlib.Path, cap: int):
    st=path.lstat()
    if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size>cap: fail('unsafe or oversized file: '+str(path))
    return st
def sha(path: pathlib.Path, cap: int):
    before=regular(path,cap); h=hashlib.sha256(); n=0
    with path.open('rb') as f:
        while True:
            b=f.read(65536)
            if not b: break
            n+=len(b)
            if n>cap: fail('file grew past bound: '+str(path))
            h.update(b)
    after=path.lstat()
    if n!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns): fail('file changed while hashing: '+str(path))
    return h.hexdigest(),n
def canonical(path: pathlib.Path):
    if not path.is_absolute() or path.absolute()!=path or path.resolve(strict=True)!=path: fail('path is not canonical: '+str(path))
    p=path
    while p!=p.parent:
        if p.is_symlink(): fail('symlink path component: '+str(p))
        p=p.parent
    return path
def write_json(path: pathlib.Path,value):
    raw=(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
    if len(raw)>512*1024: fail('operator receipt exceeds 512 KiB')
    with path.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
def metadata(argv:list[str],timeout=20):
    cp=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False)
    if len(cp.stdout)+len(cp.stderr)>128*1024: fail('metadata command output exceeded 128 KiB')
    if cp.returncode: fail('metadata command failed: '+argv[0]+' ('+str(cp.returncode)+')')
    return cp.stdout.decode('utf-8','replace').strip()
def output_inventory(root:pathlib.Path):
    rows=[];total=0
    for base,dirs,files in os.walk(root,followlinks=False):
        for d in dirs:
            p=pathlib.Path(base)/d
            if p.is_symlink():fail('output contains symlink directory')
        for f in files:
            p=pathlib.Path(base)/f;h,n=sha(p,EVIDENCE_LIMIT);total+=n
            if total>EVIDENCE_LIMIT:fail('complete output tree exceeds 16 MiB')
            rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
    return sorted(rows,key=lambda x:x['path']),total

def main():
    start=time.monotonic(); ROOT.joinpath('runs').mkdir(exist_ok=True)
    run_id=uuid.uuid4().hex; output=ROOT/'runs'/run_id; output.mkdir(); guest_output=output/'guest';guest_output.mkdir()
    status='FAIL_OR_UNKNOWN';failure=None;container=None;cleanup={'attempted':False,'removed':False,'nameAbsent':False}
    result={'profile':'umf.g03-local-linux-admission-docker-operator/2','executionKind':'local_linux_diagnostic',
            'executionId':run_id,'status':status,'sourceVolume':SOURCE_VOLUME,'sourceMount':'/volume-producer:ro',
            'image':IMAGE,'platform':PLATFORM,'limits':{'aggregateSeconds':TOTAL,'commandSeconds':COMMAND,
            'reserveSeconds':RESERVE,'stopGraceSeconds':STOP,'logsBytes':LOG_LIMIT,'evidenceBytes':EVIDENCE_LIMIT}}
    docker_run=None;guest=None;preflight=[];capture_closure=None
    try:
        for p in (ROOT,PROBE_ROOT,FULL18,AGG,LOCK,CAPTURE_HELPER,WEFT_VERIFIER):canonical(p)
        if sha(CAPTURE_HELPER,256*1024)[0]!=CAPTURE_HELPER_SHA:fail('accepted bounded-capture helper hash mismatch')
        verifier_sha,verifier_size=sha(WEFT_VERIFIER,64*1024)
        if verifier_sha!=WEFT_VERIFIER_SHA:fail('installed Weft member verifier source hash mismatch')
        helper_spec=importlib.util.spec_from_file_location('accepted_bounded_capture',CAPTURE_HELPER)
        if helper_spec is None or helper_spec.loader is None:fail('cannot load accepted bounded-capture helper')
        helper=importlib.util.module_from_spec(helper_spec);helper_spec.loader.exec_module(helper)
        probe_hash,_=sha(PROBE_ROOT/'probe.py',2*1024*1024);pins_hash,_=sha(PROBE_ROOT/'source-pins.json',64*1024)
        if probe_hash!=PROBE_SHA or pins_hash!=PINS_SHA:fail('frozen probe or source-pins digest mismatch')
        image_id=metadata(['docker','image','inspect','--format','{{.Id}}',IMAGE])
        if image_id!=IMAGE:fail('Docker image ID differs from frozen digest')
        image_os=metadata(['docker','image','inspect','--format','{{.Os}}/{{.Architecture}}',IMAGE])
        if image_os!='linux/amd64':fail('Docker image platform differs from linux/amd64')
        engine_version=metadata(['docker','version','--format','{{.Server.Version}}'])
        engine_platform=metadata(['docker','info','--format','{{.OSType}}/{{.Architecture}}'])
        if not engine_version or not engine_platform.startswith('linux/'):
            fail('Docker engine identity is absent or not Linux')
        volume_rows=metadata(['docker','volume','inspect','--format','{{.Name}}',SOURCE_VOLUME]).splitlines()
        if volume_rows!=[SOURCE_VOLUME]:fail('existing P volume identity unavailable')
        wheel_sha,wheel_size=sha(WEFT_WHEEL,20*1024*1024)
        if (wheel_sha,wheel_size)!=(WEFT_WHEEL_SHA,WEFT_WHEEL_SIZE):fail('selected Linux Weft wheel bytes differ from lock pin')
        preflight=[{'imageId':image_id,'platform':image_os,'engineVersion':engine_version,
                    'enginePlatform':engine_platform,'sourceVolume':volume_rows[0],
                    'probeSha256':probe_hash,'pinsSha256':pins_hash,
                    'aggregateIndexSha256':sha(AGG/'aggregate.json',4*1024*1024)[0],
                    'requirementsSha256':sha(AGG/'mirror/requirements.lock',1024*1024)[0],
                    'mirrorManifestSha256':sha(AGG/'mirror/manifest.json',4*1024*1024)[0],
                    'weftWheelPath':str(WEFT_WHEEL),'weftWheelSha256':wheel_sha,'weftWheelSizeBytes':wheel_size,
                    'weftVerifierSha256':verifier_sha,'weftVerifierSizeBytes':verifier_size,
                    'selectedLockSha256':sha(LOCK,8*1024*1024)[0],
                    'captureHelperSha256':CAPTURE_HELPER_SHA}]
        container='g03-admission-'+run_id
        exact=metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}']).splitlines()
        if exact:fail('unique owned container name already exists')
        argv=['docker','run','--pull','never','--name',container,'--label','codex.g03.execution-id='+run_id,
              '--platform',PLATFORM,'--network','none','--read-only','--cpus','4','--memory','8g','--pids-limit','8192',
              '--cap-add','SYS_ADMIN','--security-opt','seccomp=unconfined','--tmpfs','/tmp:rw,nosuid,nodev,exec,size=2g',
              '--tmpfs','/venv:rw,nosuid,nodev,exec,size=1g',
              '--mount',f'type=volume,source={SOURCE_VOLUME},target=/volume-producer,readonly',
              '--mount',f'type=bind,source={AGG},target=/cohort/aggregate,readonly',
              '--mount',f'type=bind,source={LOCK},target=/cohort/selected-child-lock.json,readonly',
              '--mount',f'type=bind,source={PROBE_ROOT},target=/probe,readonly',
              '--mount',f'type=bind,source={ROOT / "guest_runner.py"},target=/guest_runner.py,readonly',
              '--mount',f'type=bind,source={WEFT_VERIFIER},target=/verify_weft_wheel.py,readonly',
              '--mount',f'type=bind,source={guest_output},target=/out',
              '--workdir','/volume-producer',IMAGE,'python3.11','-I','/guest_runner.py']
        # Let the accepted capture helper use at most 15 seconds for stop/drain,
        # then preserve the fixed 60-second terminal receipt/cleanup reserve.
        deadline=start+TOTAL-RESERVE-15
        def stop_only_owned(name):
            if name!=container: return
            try: subprocess.run(['docker','stop','--time',str(STOP),name],stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,timeout=STOP+5,check=False)
            except Exception: pass
        helper.stop_owned=stop_only_owned
        proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        docker_run=helper.bounded_capture(proc,output,container,deadline,prefix='outer')
        capture_closure=helper.verify_outer_capture(docker_run)
        # The running container has already exited; remove only this exact run-owned name.
        label=metadata(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',container],timeout=10)
        if label!=run_id:fail('container ownership label mismatch; refusing removal')
        cleanup['attempted']=True
        rm=subprocess.run(['docker','rm',container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15,check=False)
        cleanup['rmExitCode']=rm.returncode
        cleanup['removed']=rm.returncode==0
        cleanup['nameAbsent']=not metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],timeout=10).splitlines()
        guest_path=guest_output/'guest-result.json'
        if guest_path.is_file():
            guest=json.loads(guest_path.read_text())
        logs_bytes=sum(row['sizeBytes'] for row in output_inventory(output)[0] if row['path'].endswith('.log'))
        if not cleanup['removed'] or not cleanup['nameAbsent']:fail('owned container cleanup did not close')
        if docker_run['timedOut'] or proc.returncode!=0:fail('docker guest returned timeout/nonzero')
        if (docker_run.get('timedOut') or docker_run.get('drainExpired') or docker_run.get('captureFailed')
                or any(docker_run['truncated'])):fail('outer Docker capture incomplete/truncated')
        if not capture_closure or not capture_closure.get('verified'):fail('outer Docker log physical closure failed')
        if logs_bytes>LOG_LIMIT:fail('guest plus outer logs exceed 1 MiB')
        if not guest or guest.get('status')!='PASS_COMPILER_ADMISSION_ONLY':fail('guest did not close source/compiler admission PASS')
        expected_guest={'guest-result.json','g03-defaults-native-fixture.json','g03-admission-report.json'}
        expected_outer={'outer.stdout.log','outer.stderr.log'}
        expected_guest_logs={f'{command}.{stream}.log' for command in
            ('source-commit','source-tree','source-clean-status','python-base-version','bun-version',
             'fixture-generation','offline-install-and-check','admission-probe') for stream in ('stdout','stderr')}
        actual={row['path'] for row in output_inventory(output)[0] if row['path']!='operator-result.json'}
        roster=(expected_outer | {f'guest/{name}' for name in expected_guest} |
                {f'guest/logs/{name}' for name in expected_guest_logs})
        if actual!=roster:fail('successful guest output roster mismatch')
        status='PASS_COMPILER_ADMISSION_ONLY'
    except BaseException as exc:
        failure=type(exc).__name__+': '+str(exc)[:240]
        if container and not (cleanup.get('removed') and cleanup.get('nameAbsent')):
            try:
                names=metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],timeout=10).splitlines()
                if not names:
                    cleanup['nameAbsent']=True
                elif names==[container]:
                    label=metadata(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',container],timeout=10)
                    if label!=run_id:fail('refusing failure cleanup of a container without the exact ownership label')
                    try: subprocess.run(['docker','stop','--time',str(STOP),container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=STOP+5,check=False)
                    except Exception: pass
                    cleanup['attempted']=True
                    rm=subprocess.run(['docker','rm','--force',container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15,check=False)
                    cleanup['rmExitCode']=rm.returncode;cleanup['removed']=rm.returncode==0
                    cleanup['nameAbsent']=not metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],timeout=10).splitlines()
                else:
                    fail('failure cleanup found a nonunique container-name match')
            except Exception as cleanup_error:
                cleanup['error']=type(cleanup_error).__name__+': '+str(cleanup_error)[:120]
    result.update(status=status,failure=failure,preflight=preflight,containerName=container,
                  dockerRun=docker_run,dockerCapturePhysicalClosure=capture_closure,guestResult=guest,cleanup=cleanup,
                  elapsedSeconds=round(time.monotonic()-start,3))
    receipt_path=output/'operator-result.json'
    try:
        # Reserve a bounded terminal record before any candidate execution; final bytes replace it.
        with receipt_path.open('xb') as f:f.write(b' '*(512*1024));f.flush();os.fsync(f.fileno())
        rows,total=output_inventory(output)
        rows=[row for row in rows if row['path']!='operator-result.json']
        result['outputFiles']=rows;result['outputBytes']=total-512*1024
        if result['elapsedSeconds']>TOTAL or result['outputBytes']>EVIDENCE_LIMIT:
            result['status']='FAIL_OR_UNKNOWN';result['failure']='operator evidence/elapsed cap exceeded'
        raw=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
        if len(raw)>512*1024:
            result['status']='FAIL_OR_UNKNOWN';result['failure']='operator result exceeded reserved 512 KiB';raw=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
        with receipt_path.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
        final_rows,final_total=output_inventory(output)
        if final_total>EVIDENCE_LIMIT:
            result['status']='FAIL_OR_UNKNOWN';result['failure']='final physical evidence exceeds 16 MiB cap'
            raw=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
            with receipt_path.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
            if output_inventory(output)[1]>EVIDENCE_LIMIT:raise RuntimeError('failure receipt cannot close within evidence cap')
    except BaseException as exc:
        result['status']='FAIL_OR_UNKNOWN';result['failure']='final receipt closure: '+type(exc).__name__+': '+str(exc)[:160]
        if receipt_path.exists():
            raw=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
            with receipt_path.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
        else:write_json(receipt_path,result)
    print(json.dumps({'status':result['status'],'executionId':run_id,'output':str(output)},sort_keys=True))
    return 0 if result['status']=='PASS_COMPILER_ADMISSION_ONLY' else 1

if __name__=='__main__':raise SystemExit(main())
