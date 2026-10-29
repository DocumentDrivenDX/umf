#!/usr/bin/env python3
"""Held local Linux Docker launcher for the SDK public-H reader; never dispatches Actions."""
from __future__ import annotations
import hashlib, json, os, pathlib, re, selectors, subprocess, sys, time

IMAGE = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PLATFORM = 'linux/amd64'
HOST_ROOT = pathlib.Path('/private/tmp')
READER = pathlib.Path('/private/tmp/sdk-057-local3600-public-h-v2/run-local3600-public-h.py')
LIMIT_SECONDS = 1800
STOP_GRACE_SECONDS = 10
OUTER_STREAM_LIMIT = 128 * 1024
OUTER_TOTAL_LIMIT = 256 * 1024
OUTER_METADATA_LIMIT = 1024 * 1024
PIDS_LIMIT = 8192
CPU_LIMIT = '4'
MEMORY_LIMIT = '8g'


def sha(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def fail(message: str) -> None:
    raise RuntimeError(message)


def run_checked(argv: list[str], timeout: int = 20) -> str:
    result = subprocess.run(argv, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, timeout=timeout)
    if result.returncode:
        fail(f'preflight command failed ({result.returncode}): {argv[0]}')
    return result.stdout.strip()


def has_held(value, where='input') -> None:
    if value == 'HELD' or value is None:
        fail(f'{where} contains a held or absent value; refusing container launch')
    if isinstance(value, dict):
        for k, v in value.items(): has_held(v, f'{where}.{k}')
    elif isinstance(value, list):
        for i, v in enumerate(value): has_held(v, f'{where}[{i}]')


def add_path_mount(mounts: set[pathlib.Path], value: str, label: str) -> None:
    p = pathlib.Path(value)
    if not p.is_absolute() or p == HOST_ROOT or HOST_ROOT not in p.parents:
        fail(f'{label} must be a specific absolute path below {HOST_ROOT}')
    physical = p.resolve(strict=True)
    if p.is_symlink(): fail(f'{label} must not be a symlink')
    mount = physical if physical.is_dir() else physical.parent
    if mount == HOST_ROOT or HOST_ROOT not in mount.parents:
        fail(f'{label} resolves outside the narrow temporary evidence roots')
    mounts.add(mount)


def input_mounts(packet: dict, packet_path: pathlib.Path) -> list[pathlib.Path]:
    mounts: set[pathlib.Path] = {packet_path.parent.resolve(strict=True), READER.parent.resolve(strict=True)}
    source = packet['source']; add_path_mount(mounts, source['producerRoot'], 'producer source')
    evidence = packet['evidence']
    sdk = evidence['sdkProducer']
    sdk_root = pathlib.Path(sdk['root'])
    if not sdk_root.is_absolute() or sdk_root != HOST_ROOT:
        add_path_mount(mounts, sdk['root'], 'SDK evidence root')
    for key in ('harnessPath','receiptPath','archivePath','manifestPath'):
        target = sdk_root / sdk[key]
        add_path_mount(mounts, str(target), f'SDK evidence {key}')
    d5 = evidence['d5']; add_path_mount(mounts, d5['root'], 'D5 evidence root')
    profile = d5.get('resourceProfileEvidence', {})
    for key in ('root','profilePath','operatorManifestPath','outerCapturePath','selectedEvidenceReceiptPath'):
        if key in profile: add_path_mount(mounts, profile[key], f'D5 profile {key}')
    for key, path in profile.get('roots', {}).items():
        add_path_mount(mounts, path, f'D5 profile roots.{key}')
    aggregate = evidence['aggregate']; add_path_mount(mounts, aggregate['root'], 'full18 aggregate root')
    add_path_mount(mounts, aggregate['harnessPath'], 'full18 harness')
    continuation = evidence['unionContinuation']; add_path_mount(mounts, continuation['root'], 'union continuation root')
    add_path_mount(mounts, str(pathlib.Path(continuation['root']) / continuation['harnessRoot']), 'union continuation harness')
    return sorted(mounts, key=lambda p: (len(p.parts), str(p)))


def minimal_mounts(mounts: list[pathlib.Path]) -> list[pathlib.Path]:
    kept: list[pathlib.Path] = []
    for p in mounts:
        if not any(parent == p or parent in p.parents for parent in kept):
            kept.append(p)
    return kept


def bounded_capture(proc: subprocess.Popen, log_dir: pathlib.Path, deadline: float):
    paths = [log_dir / 'docker.stdout.log', log_dir / 'docker.stderr.log']
    streams = [proc.stdout, proc.stderr]
    out = [p.open('xb') for p in paths]
    h = [hashlib.sha256(), hashlib.sha256()]
    sizes = [0, 0]; truncated = [False, False]
    selector = selectors.DefaultSelector()
    for i, stream in enumerate(streams):
        os.set_blocking(stream.fileno(), False); selector.register(stream, selectors.EVENT_READ, i)
    timed_out = False
    while selector.get_map():
        now = time.monotonic()
        if now >= deadline and proc.poll() is None:
            timed_out = True
            try: run_checked(['docker','stop','--time',str(STOP_GRACE_SECONDS),proc.args[3]], timeout=STOP_GRACE_SECONDS+15)
            except Exception: pass
            try: proc.wait(timeout=STOP_GRACE_SECONDS+5)
            except subprocess.TimeoutExpired: proc.kill()
        for key, _ in selector.select(0.2):
            idx = key.data
            try: data = os.read(key.fileobj.fileno(), 65536)
            except BlockingIOError: continue
            if not data:
                selector.unregister(key.fileobj); continue
            h[idx].update(data)
            allowance = OUTER_STREAM_LIMIT - sizes[idx]
            if allowance > 0:
                keep = data[:allowance]; out[idx].write(keep); sizes[idx] += len(keep)
            if len(data) > max(allowance, 0): truncated[idx] = True
    for f in out: f.flush(); os.fsync(f.fileno()); f.close()
    return {'paths':[str(p) for p in paths], 'bytes':sizes,
            'sha256':[x.hexdigest() for x in h], 'truncated':truncated,
            'timedOut':timed_out, 'totalRetainedBytes':sum(sizes)}


def selected_evidence_inventory(root: pathlib.Path) -> list[dict]:
    # The reader's disposable work/venv tree is deliberately excluded. Close only
    # the same receipt/input/log/report family that its metadata cap covers.
    allowed_root = {'receipt.json','input-packet.json','command-records.jsonl','logs','reports','work'}
    if not root.is_dir() or root.is_symlink(): fail('reader evidence directory is missing or unsafe')
    names={p.name for p in root.iterdir()}
    if names != allowed_root: fail('reader evidence top-level roster is not the closed expected family')
    work=root/'work'
    if work.is_symlink() or not work.is_dir(): fail('reader disposable work directory is missing or unsafe')
    rows=[]
    for rel in ('receipt.json','input-packet.json','command-records.jsonl'):
        p=root/rel
        if p.is_symlink() or not p.is_file(): fail(f'reader evidence file missing or unsafe: {rel}')
        rows.append({'path':rel,'sizeBytes':p.stat().st_size,'sha256':sha(p)})
    for dirname in ('logs','reports'):
        sub=root/dirname
        if sub.is_symlink() or not sub.is_dir(): fail(f'reader evidence directory missing or unsafe: {dirname}')
        for p in sorted(sub.iterdir()):
            if p.is_symlink() or not p.is_file(): fail(f'reader evidence member missing or unsafe: {p.relative_to(root)}')
            rows.append({'path':str(p.relative_to(root)),'sizeBytes':p.stat().st_size,'sha256':sha(p)})
    return rows


def main() -> int:
    if len(sys.argv) != 3:
        print('usage: run_public_h_docker.py READY_INPUT_PACKET.json NEW_RUN_DIRECTORY', file=sys.stderr); return 2
    packet_path=pathlib.Path(sys.argv[1]).resolve(strict=True)
    out_root=pathlib.Path(sys.argv[2]).resolve()
    if packet_path.is_symlink() or not packet_path.is_file(): fail('input packet must be a regular nonsymlink file')
    raw=packet_path.read_bytes()
    if len(raw)>16*1024*1024: fail('input packet exceeds the public-H metadata limit')
    packet=json.loads(raw)
    if packet.get('status')!='READY': fail('public-H packet remains HELD; no Docker command was started')
    has_held(packet)
    if packet.get('executionKind')!='local_linux_diagnostic': fail('only local Linux diagnostic execution is accepted')
    if packet.get('execution',{}).get('runtimeImageDigest')!=IMAGE: fail('packet runtime image differs from pinned image')
    if packet.get('execution',{}).get('localAdapterSha256')!=sha(READER): fail('reader source bytes differ from packet-pinned local adapter SHA')
    if not re.fullmatch(r'local-[a-f0-9-]{16,64}', packet['execution']['executionId']): fail('execution ID is not a local identifier')
    if out_root.exists() or out_root.is_symlink(): fail('run directory must be new')
    if HOST_ROOT not in out_root.parents: fail('run directory must be below /private/tmp')
    image=json.loads(run_checked(['docker','image','inspect',IMAGE,'--format','{{json .}}']))
    if image.get('Id')!=IMAGE or image.get('Os')!='linux' or image.get('Architecture')!='amd64': fail('inspected image is not the exact pinned linux/amd64 runtime')
    engine_text=run_checked(['docker','info','--format','{{json .}}'])
    if len(engine_text.encode())>65536: fail('Docker engine identity exceeds its metadata bound')
    engine=json.loads(engine_text)
    if engine.get('OSType')!='linux' or not isinstance(engine.get('Name'),str): fail('Docker engine identity is not a Linux server record')
    mounts=minimal_mounts(input_mounts(packet,packet_path))
    out_root.mkdir(parents=True,exist_ok=False); operator=out_root/'operator'; operator.mkdir()
    evidence=out_root/'evidence'
    name='umf-public-h-'+packet['execution']['executionId'].replace('_','-')[:45]
    if run_checked(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'],timeout=20):
        fail('the unique owned container name is already occupied; refusing to touch it')
    argv=['docker','run','--name',name,'--rm','--pull=never','--platform='+PLATFORM,
          '--cpus='+CPU_LIMIT,'--memory='+MEMORY_LIMIT,'--pids-limit='+str(PIDS_LIMIT),
          '--network=bridge','--read-only','--tmpfs','/tmp:rw,exec,size=1g',
          '--tmpfs','/private/tmp:rw,exec,size=64m',
          '--mount',f'type=bind,src={out_root},dst={out_root},rw']
    for path in mounts: argv.extend(['--mount',f'type=bind,src={path},dst={path},readonly'])
    argv.extend(['--env','LOCAL_RUNTIME_IMAGE_DIGEST='+IMAGE,'--env','GIT_OPTIONAL_LOCKS=0',IMAGE,
                 'python3','-I',str(READER),'run',str(packet_path),str(evidence)])
    with (operator/'operator-run.json').open('x') as f:
        f.write(json.dumps({'profile':'umf.sdk-057-public-h-docker-operator/1','status':'RUNNING',
            'executionId':packet['execution']['executionId'],'attempt':packet['execution']['attempt'],
            'driverSha256':sha(pathlib.Path(__file__).resolve()),'inputPacketPath':str(packet_path),'inputPacketSha256':hashlib.sha256(raw).hexdigest(),
            'readerPath':str(READER),'readerSha256':sha(READER),'runtimeImage':IMAGE,
            'runtimePlatform':PLATFORM,'dockerEngineInfo':engine,'containerName':name,
            'network':'bridge; enabled only during the seven H commands for public GitHub lookups/downloads and locked Bun dependency installation',
            'gitOptionalLocks':'0 to keep read-only source inspection from attempting optional index writes',
            'sourceAndEvidenceMountsReadOnly':[str(p) for p in mounts],
            'outputMountReadWrite':str(out_root),'command':argv,
            'limits':{'readerAggregateSeconds':1800,'readerEvidenceReserveSeconds':60,
              'readerChildSeconds':180,'readerTermGraceSeconds':10,
              'readerAggregateLogBytes':1048576,'readerMetadataArtifactBytes':16777216,
              'outerWallSeconds':1800,'outerStopGraceSeconds':STOP_GRACE_SECONDS,
              'outerStreamBytesEach':OUTER_STREAM_LIMIT,'outerCombinedCaptureBytes':OUTER_TOTAL_LIMIT,
              'outerMetadataBytes':OUTER_METADATA_LIMIT,'cpu':CPU_LIMIT,'memory':MEMORY_LIMIT,'pids':PIDS_LIMIT}},indent=2)+'\n')
    proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
    captured=bounded_capture(proc,operator,time.monotonic()+LIMIT_SECONDS)
    try: exit_code=proc.wait(timeout=STOP_GRACE_SECONDS+5)
    except subprocess.TimeoutExpired: proc.kill(); exit_code=proc.wait()
    cleanup_error=None; cleanup=None
    try:
        listing=run_checked(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'],timeout=20)
        if listing:
            cleanup=subprocess.run(['docker','rm','--force',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=20)
            if cleanup.returncode: fail('owned container removal returned nonzero')
        after=run_checked(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'],timeout=20)
        cleanup_ok=(not after)
    except Exception as exc:
        cleanup_ok=False; cleanup_error=type(exc).__name__+': '+str(exc)[:180]
    inventory_error=None
    try: evidence_rows=selected_evidence_inventory(evidence)
    except Exception as exc: evidence_rows=[]; inventory_error=type(exc).__name__+': '+str(exc)[:180]
    evidence_receipt=evidence/'receipt.json'
    reader_result={}
    if evidence_receipt.is_file() and not evidence_receipt.is_symlink():
        try: reader_result=json.loads(evidence_receipt.read_text())
        except Exception: reader_result={}
    reader_status=reader_result.get('status')
    selected_bytes=sum(x['sizeBytes'] for x in evidence_rows)
    metadata_match=reader_result.get('metadataArtifactBytes')==selected_bytes
    total_outer=captured['totalRetainedBytes']
    final_status='LOCAL_DIAGNOSTIC_PASS' if exit_code==0 and reader_status=='LOCAL_DIAGNOSTIC_PASS' and cleanup_ok and not cleanup_error and not inventory_error and metadata_match and selected_bytes<=16777216 and not captured['timedOut'] and not any(captured['truncated']) and total_outer<=OUTER_TOTAL_LIMIT else 'FAIL_OR_UNKNOWN'
    result={'profile':'umf.sdk-057-public-h-docker-operator/1','status':final_status,
        'executionKind':'local_linux_diagnostic','executionId':packet['execution']['executionId'],'attempt':packet['execution']['attempt'],
        'dockerExitCode':exit_code,'readerStatus':reader_status,'readerReceiptPath':str(evidence_receipt) if evidence_receipt.exists() else None,
        'readerReceiptSha256':sha(evidence_receipt) if evidence_receipt.is_file() else None,
        'outerCapture':captured,'cleanup':{'removeExitCode':cleanup.returncode if cleanup is not None else 0,
          'exactNameListingEmpty':cleanup_ok,'error':cleanup_error},
        'evidenceFiles':evidence_rows,'evidenceFileCount':len(evidence_rows),
        'evidenceBytes':selected_bytes,'readerMetadataBytesMatchPhysicalFamily':metadata_match,
        'evidenceInventoryError':inventory_error,
        'failure':None if final_status=='LOCAL_DIAGNOSTIC_PASS' else 'reader, capture, timeout, output custody, or cleanup did not close'}
    encoded=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
    if len(encoded)>OUTER_METADATA_LIMIT: fail('operator receipt exceeds its separate wrapper metadata cap')
    result_path=operator/'operator-result.json'
    result_path.write_bytes(encoded)
    operator_total=sum(p.stat().st_size for p in operator.iterdir() if p.is_file())
    if operator_total>OUTER_METADATA_LIMIT:
        result['status']='FAIL_OR_UNKNOWN'; result['failure']='outer-operator-evidence-cap-exceeded'
        result_path.write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
        final_status='FAIL_OR_UNKNOWN'
    run_record=json.loads((operator/'operator-run.json').read_text())
    run_record['status']=final_status
    run_record['resultPath']=str(result_path)
    run_record['resultSha256']=sha(result_path)
    (operator/'operator-run.json').write_text(json.dumps(run_record,sort_keys=True,indent=2)+'\n')
    return 0 if final_status=='LOCAL_DIAGNOSTIC_PASS' else 1

if __name__=='__main__':
    try: raise SystemExit(main())
    except BaseException as e:
        print(f'operator refused or failed before a qualified result: {type(e).__name__}: {e}',file=sys.stderr)
        raise SystemExit(1)
