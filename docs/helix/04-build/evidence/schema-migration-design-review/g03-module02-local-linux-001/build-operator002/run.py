#!/usr/bin/env python3
"""Bounded local Linux Weft source tests and held full-feature candidate build."""
from __future__ import annotations
import hashlib, importlib.util, json, os, pathlib, subprocess, sys, time, uuid

SOURCE = pathlib.Path('/private/tmp/weft-g03-ordinary-module')
OUTPUT = pathlib.Path('/private/tmp/g03-weft-local-linux-run-002')
IMAGE = 'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
PLATFORM = 'linux/amd64'
EXPECTED_HEAD = 'e7e88b077c256c852a83d7951e3bc5fd1ec234aa'
EXPECTED_TREE = '91717885cefaea1ff8d78ee188c5dc4ca2700df7'
EXPECTED_SEMANTIC_PATCH = 'a96e4f29262edb6d459b56c607f1d22527a622255bedeafd9e26274884531936'
EXPECTED_METADATA_PATCH = '25ccab8a9c2a3576ac09783a9c06dabfa503e1dbd9b7b67495e751424552564f'
CANDIDATE_VERSION = '0.4.55+g03.a96e4f29262e'
EXPECTED_CARGO_LOCK = '14697814e6cd5c04cef4cb8e03ab041bc0062404963da81d3107110cbc4cf019'
EXPECTED_PYPROJECT = 'c6e642eddcba38d30e01f8babbf70b5b885317aacad412d262a1665a91064eeb'
EXPECTED_PY_CARGO_BASE = 'cc53e8989ce529c0f05bdc27380f1ae0573fea14389c68fb69b718a8edd871e3'
CAPTURE_HELPER = pathlib.Path('/private/tmp/sdk-057-local3600-public-h-operator-proposal011/run_public_h_docker.py')
CAPTURE_HELPER_SHA = '8e383bece7d44484421302f8be32fdb1ba1ed96cd895749093a58171648cf1cd'
PYPI_METADATA = pathlib.Path('/private/tmp/g03-weft-local-linux-operator-002/maturin-1.9.6-pypi.json')
PYPI_METADATA_SHA = 'ff36b1d43664c264059608e2c475db66efe93264c894a80f6b0181b2f85bdf4e'
MATURIN_WHEEL = 'maturin-1.9.6-py3-none-manylinux_2_12_x86_64.manylinux2010_x86_64.musllinux_1_1_x86_64.whl'
MATURIN_WHEEL_SHA = '0246202377c49449315305209f45c8ecef6e2d6bd27a04b5b6f1ab3e4ea47238'
MATURIN_WHEEL_SIZE = 8641010
FETCH_HELPER_SHA = 'bd936fffbe758e265666230d2b554d463dbb17593fdf005ae04d4a4d328485a2'
MATURIN_REQUIREMENTS_SHA = '456c2c84a0d72376a5235ac8da66568cd95e86fed4b4170a92dea3eabc90fb8f'
TOTAL_SECONDS, TERMINAL_RESERVE, CLEANUP_SECONDS = 3600, 60, 60
STAGE_LIMITS = {'setup': 600, 'tests': 1800, 'candidate-build': 1800}
MAX_LOG_BYTES, MAX_METADATA_BYTES = 1024 * 1024, 16 * 1024 * 1024
MAX_WHEEL_BYTES, MAX_EXPANDED_WHEEL_BYTES = 32 * 1024 * 1024, 128 * 1024 * 1024
CPU, MEMORY, PIDS = '4', '8g', 8192
EXECUTION_ID = str(uuid.uuid4())
SUFFIX = EXECUTION_ID[:12]
CONTAINER = f'g03-weft-build-{SUFFIX}'
TARGET_VOLUME, CARGO_VOLUME = f'g03-weft-target-{SUFFIX}', f'g03-weft-cargo-{SUFFIX}'
CONTAINER_STARTED = False


def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def file_sha(path: pathlib.Path, cap: int) -> tuple[int, str]:
    h = hashlib.sha256(); total = 0
    with path.open('rb') as f:
        while True:
            block = f.read(min(1024 * 1024, cap + 1 - total))
            if not block: break
            total += len(block)
            if total > cap: raise RuntimeError(f'{path} exceeds {cap} bytes')
            h.update(block)
    return total, h.hexdigest()

def checked(argv: list[str], timeout: int = 20) -> str:
    p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout, check=False)
    if p.returncode: raise RuntimeError(f'{argv!r} exit={p.returncode}: {p.stderr[-500:]}')
    return p.stdout.strip()

def load_capture():
    if sha(CAPTURE_HELPER.read_bytes()) != CAPTURE_HELPER_SHA: raise RuntimeError('capture helper SHA mismatch')
    spec = importlib.util.spec_from_file_location('pinned_h_capture', CAPTURE_HELPER)
    if spec is None or spec.loader is None: raise RuntimeError('cannot load pinned capture helper')
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    mod.STOP_GRACE_SECONDS = 10
    return mod

def git(args: list[str], timeout: int = 20) -> str:
    return checked(['git', '-c', f'safe.directory={SOURCE}', '-C', str(SOURCE), *args], timeout)

def source_identity() -> dict:
    head, tree = git(['rev-parse', 'HEAD']), git(['rev-parse', 'HEAD^{tree}'])
    patch = subprocess.run(['git', '-c', f'safe.directory={SOURCE}', '-C', str(SOURCE), 'diff', '--binary'],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False)
    if patch.returncode: raise RuntimeError('git diff failed')
    status_proc=subprocess.run(['git','-c',f'safe.directory={SOURCE}','-C',str(SOURCE),'status','--short'],
      stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=20,check=False)
    if status_proc.returncode: raise RuntimeError('git status failed')
    status=status_proc.stdout.rstrip('\n')
    paths = {line[3:] for line in status.splitlines() if len(line) > 3}
    expected = {'crates/weft-core/src/model.rs','crates/weft-core/src/raw_read.rs',
      'crates/weft-core/src/table_operation.rs','crates/weft-core/src/table_query.rs',
      'crates/weft-postgresql/tests/table_operation.rs',
      'docs/helix/02-design/contracts/CONTRACT-003-compile-and-host-boundary.md',
      'Cargo.lock','crates/weft-python/Cargo.toml','crates/weft-python/pyproject.toml'}
    if head != EXPECTED_HEAD or tree != EXPECTED_TREE or paths != expected or any(x[:2] != ' M' for x in status.splitlines()):
        raise RuntimeError(f'source identity/status mismatch: {head}/{tree}/{status!r}')
    if not patch.stdout.startswith(b'diff --git a/Cargo.lock'):
        raise RuntimeError('full source patch does not start at expected stable sorted path')
    semantic = subprocess.run(['git','-c',f'safe.directory={SOURCE}','-C',str(SOURCE),'diff','--binary','--',
       'crates/weft-core/src/model.rs','crates/weft-core/src/raw_read.rs','crates/weft-core/src/table_operation.rs',
       'crates/weft-core/src/table_query.rs','crates/weft-postgresql/tests/table_operation.rs',
       'docs/helix/02-design/contracts/CONTRACT-003-compile-and-host-boundary.md'],
       stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30,check=False)
    metadata = subprocess.run(['git','-c',f'safe.directory={SOURCE}','-C',str(SOURCE),'diff','--binary','--',
       'Cargo.lock','crates/weft-python/Cargo.toml','crates/weft-python/pyproject.toml'],
       stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30,check=False)
    if semantic.returncode or metadata.returncode or sha(semantic.stdout) != EXPECTED_SEMANTIC_PATCH or sha(metadata.stdout) != EXPECTED_METADATA_PATCH:
        raise RuntimeError('semantic or candidate metadata patch hash mismatch')
    pins = {'Cargo.lock': EXPECTED_CARGO_LOCK,
      'crates/weft-python/pyproject.toml': EXPECTED_PYPROJECT,
      'crates/weft-python/Cargo.toml': EXPECTED_PY_CARGO_BASE}
    for rel, expected_sha in pins.items():
        content=(SOURCE/rel).read_bytes()
        # The three reviewed version strings are the only allowed differences from their pre-candidate pins.
        if rel == 'Cargo.lock': content=content.replace(CANDIDATE_VERSION.encode(),b'0.4.55')
        elif rel.endswith('pyproject.toml'): content=content.replace(CANDIDATE_VERSION.encode(),b'0.4.55')
        else: content=content.replace(CANDIDATE_VERSION.encode(),b'0.4.55')
        if sha(content) != expected_sha: raise RuntimeError(f'source pin mismatch: {rel}')
    versions={}
    for rel in ['Cargo.lock','crates/weft-python/Cargo.toml','crates/weft-python/pyproject.toml']:
        txt=(SOURCE/rel).read_text()
        if CANDIDATE_VERSION not in txt: raise RuntimeError(f'candidate version absent from {rel}')
        versions[rel]=CANDIDATE_VERSION
    return {'head':head,'baseTree':tree,'status':status,'fullPatchSha256':sha(patch.stdout),
      'semanticPatchSha256':sha(semantic.stdout),'candidateMetadataPatchSha256':sha(metadata.stdout),
      'candidateVersion':CANDIDATE_VERSION,'versionFiles':versions,'baseFilePins':pins}

def inspect_wheel(path: pathlib.Path) -> dict:
    import stat, zipfile
    if path.is_symlink() or not path.is_file(): raise RuntimeError('wheel output is not a regular file')
    size, archive_sha = file_sha(path, MAX_WHEEL_BYTES)
    if size == 0: raise RuntimeError('empty candidate wheel')
    members=[]; total=0
    with zipfile.ZipFile(path) as archive:
        infos=archive.infolist()
        if not infos or len(infos)>10000: raise RuntimeError('candidate wheel member count out of bounds')
        names=set()
        for info in infos:
            name=info.filename
            p=pathlib.PurePosixPath(name)
            mode=(info.external_attr >> 16) & 0xffff
            if (not name or name in names or p.is_absolute() or '..' in p.parts or '\\' in name
                or stat.S_ISLNK(mode)):
                raise RuntimeError(f'unsafe/duplicate/non-file wheel member: {name!r}')
            names.add(name); total+=info.file_size
            if total>MAX_EXPANDED_WHEEL_BYTES: raise RuntimeError('expanded wheel cap exceeded')
            h=hashlib.sha256(); member_size=0
            with archive.open(info,'r') as stream:
                while True:
                    block=stream.read(1024*1024)
                    if not block: break
                    member_size+=len(block); h.update(block)
                    if member_size>info.file_size: raise RuntimeError('wheel member exceeded declared size')
            if member_size!=info.file_size: raise RuntimeError('wheel member size mismatch')
            members.append({'path':name,'sizeBytes':member_size,'sha256':h.hexdigest(),'directory':info.is_dir()})
    metadata_members={suffix:[m for m in members if m['path'].endswith(suffix)]
                      for suffix in ('.dist-info/METADATA','.dist-info/WHEEL','.dist-info/RECORD')}
    if any(len(items)!=1 for items in metadata_members.values()): raise RuntimeError('wheel lacks unique METADATA/WHEEL/RECORD')
    required=[metadata_members[suffix][0] for suffix in ('.dist-info/METADATA','.dist-info/WHEEL','.dist-info/RECORD')]
    metadata=next(item for item in required if item['path'].endswith('.dist-info/METADATA'))
    with zipfile.ZipFile(path) as archive:
        from email.parser import Parser
        parsed=Parser().parsestr(archive.read(metadata['path']).decode('utf-8'))
    if parsed.get('Name')!='umf-weft' or parsed.get('Version')!=CANDIDATE_VERSION:
        raise RuntimeError('candidate wheel METADATA name/version differs from held candidate identity')
    receipt={'path':str(path),'sizeBytes':size,'sha256':archive_sha,'expandedBytes':total,
             'memberCount':len(members),'members':members,
             'metadataMembers':[{'path':m['path'],'sizeBytes':m['sizeBytes'],'sha256':m['sha256']} for m in required]}
    raw=(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode()
    if len(raw)>MAX_METADATA_BYTES: raise RuntimeError('wheel inspection metadata exceeds evidence cap')
    (OUTPUT/'wheel-inspection.json').write_bytes(raw)
    return {'path':str(path),'sizeBytes':size,'sha256':archive_sha,'expandedBytes':total,
            'memberCount':len(members),'inspectionPath':str(OUTPUT/'wheel-inspection.json'),
            'inspectionSha256':sha(raw)}

def volume_create(name: str, purpose: str, volumes: list[str]) -> None:
    # Register the unique name before create so a timeout/unknown outcome can be closed by exact ownership inspection.
    volumes.append(name)
    checked(['docker','volume','create','--label',f'codex.g03.owner={EXECUTION_ID}',
      '--label',f'codex.g03.purpose={purpose}',name],timeout=30)
    obj=json.loads(checked(['docker','volume','inspect',name],timeout=20))[0]
    if obj['Name']!=name or obj['Labels'].get('codex.g03.owner')!=EXECUTION_ID:
        raise RuntimeError(f'volume ownership mismatch: {name}')

def run_stage(capture, rows: list[dict], name: str, argv: list[str], deadline: float, log_dir: pathlib.Path, retained: list[int]) -> None:
    now=time.monotonic(); allowed=min(STAGE_LIMITS[name],deadline-now)
    if allowed<=0: raise TimeoutError(f'aggregate work deadline before {name}')
    # Three captured stages, two streams each: at most 256 KiB/stage and 768 KiB total.
    capture.OUTER_STREAM_LIMIT=min(128*1024, max(0,(MAX_LOG_BYTES-retained[0])//2))
    start=time.monotonic(); proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    captured=capture.bounded_capture(proc,log_dir,CONTAINER, start+allowed,prefix=name)
    elapsed=time.monotonic()-start
    physical=capture.verify_outer_capture(captured)
    row={'name':name,'argv':argv,'exitCode':proc.returncode,'durationSeconds':round(elapsed,3),
      'stageLimitSeconds':STAGE_LIMITS[name],'effectiveDeadlineSeconds':round(allowed,3),
      'capture':captured,'physicalClosure':physical}
    rows.append(row); retained[0]+=captured['totalRetainedBytes']
    if retained[0]>MAX_LOG_BYTES: raise RuntimeError('aggregate outer log cap exceeded')
    if proc.returncode!=0 or captured['timedOut'] or captured['drainExpired'] or captured['captureFailed'] or any(captured['truncated']) or not physical['verified']:
        raise RuntimeError(f'{name} failed or did not close')

def main() -> int:
    if OUTPUT.exists() or OUTPUT.is_symlink(): raise RuntimeError('output path must be fresh')
    operator_dir=pathlib.Path(__file__).resolve().parent
    for path, expected in [(operator_dir/'fetch_maturin.py',FETCH_HELPER_SHA),
                           (operator_dir/'maturin-requirements.txt',MATURIN_REQUIREMENTS_SHA),
                           (PYPI_METADATA,PYPI_METADATA_SHA)]:
        if sha(path.read_bytes())!=expected: raise RuntimeError(f'operator input pin mismatch: {path.name}')
    OUTPUT.mkdir(mode=0o700); log_dir=OUTPUT/'logs'; log_dir.mkdir(mode=0o700)
    candidate=OUTPUT/'candidate'; candidate.mkdir(mode=0o700)
    capture=load_capture(); source=source_identity()
    image=json.loads(checked(['docker','image','inspect',IMAGE],timeout=30))[0]
    if image['Id']!=IMAGE or image['Os']!='linux' or image['Architecture']!='amd64': raise RuntimeError('image identity/platform mismatch')
    rows=[]; volumes=[]; retained=[0]; started=time.monotonic()
    deadline=started+TOTAL_SECONDS-TERMINAL_RESERVE
    status='FAIL_OR_UNKNOWN'; failure=None; cleanup_errors=[]; container_attempted=False
    try:
        volume_create(TARGET_VOLUME,'cargo-target',volumes)
        volume_create(CARGO_VOLUME,'cargo-home',volumes)
        docker_run=['docker','run','-d','--name',CONTAINER,'--label',f'codex.g03.owner={EXECUTION_ID}',
          '--label','codex.g03.purpose=bounded-source-test-build','--platform',PLATFORM,'--cpus',CPU,'--memory',MEMORY,
          '--pids-limit',str(PIDS),'--network','bridge','--read-only','--cap-drop','ALL',
          '--mount',f'type=bind,src={SOURCE},dst=/workspace,readonly',
          '--mount',f'type=bind,src={operator_dir},dst=/operator,readonly',
          '--mount',f'type=volume,src={TARGET_VOLUME},dst=/target',
          '--mount',f'type=volume,src={CARGO_VOLUME},dst=/cargo-home',
          '--mount',f'type=bind,src={candidate},dst=/out',
          '--tmpfs','/tmp:rw,exec,nosuid,nodev,size=2g',
          '--env','CARGO_HOME=/cargo-home','--env','CARGO_TARGET_DIR=/target/build',
          '--env','CARGO_BUILD_JOBS=4','--env','PIP_DISABLE_PIP_VERSION_CHECK=1',
          '--env','RUSTUP_TOOLCHAIN=1.90.0-x86_64-unknown-linux-gnu',
          IMAGE,'sleep','infinity']
        container_attempted=True
        docker_id=checked(docker_run,timeout=40)
        container_info=json.loads(checked(['docker','inspect',CONTAINER],timeout=20))[0]
        if container_info.get('Id')!=docker_id or container_info.get('Config',{}).get('Labels',{}).get('codex.g03.owner')!=EXECUTION_ID:
            raise RuntimeError('container ownership identity mismatch')
        identity='set -eu; rustc --version; cargo --version; python3 --version; command -v python3; cc --version | head -1'
        setup_script=(
          'set -eu; mkdir -p /target/tooling /cargo-home/registry; '
          'printf "RUNTIME_IDENTITY\\n"; '+identity+'; '
          'case "$(rustc --version)" in "rustc 1.90."*) ;; *) exit 41 ;; esac; '
          'case "$(cargo --version)" in "cargo 1.90."*) ;; *) exit 42 ;; esac; '
          'test "$(python3 --version)" = "Python 3.11.17"; '
          'test -d /opt/cargo/registry; cp -a /opt/cargo/registry/. /cargo-home/registry/; '
          'cargo fetch --locked --manifest-path /workspace/Cargo.toml; '
          'python3 /operator/fetch_maturin.py /target/tooling /out/provisioning.json; '
          'python3 -m venv /target/tooling-venv; '
          '/target/tooling-venv/bin/python -m pip install --disable-pip-version-check --no-index --no-deps --only-binary=:all: '
          '--require-hashes --find-links=/target/tooling -r /operator/maturin-requirements.txt; '
          'test -x /target/tooling-venv/bin/maturin; '
          'test "$(/target/tooling-venv/bin/maturin --version)" = "maturin 1.9.6"')
        setup=['docker','exec',CONTAINER,'sh','-lc',setup_script]
        run_stage(capture,rows,'setup',setup,deadline,log_dir,retained)
        checked(['docker','network','disconnect','bridge',CONTAINER],timeout=30)
        inspect=json.loads(checked(['docker','inspect',CONTAINER],timeout=20))[0]
        networks=inspect['NetworkSettings']['Networks']
        if networks: raise RuntimeError(f'container still attached to networks: {sorted(networks)}')
        test_cmd=['docker','exec',CONTAINER,'sh','-lc',
          'set -eu; export CARGO_HOME=/cargo-home CARGO_TARGET_DIR=/target/build CARGO_BUILD_JOBS=4; '
          'cd /workspace && cargo test --locked --offline -p weft-core -p weft-postgresql']
        run_stage(capture,rows,'tests',test_cmd,deadline,log_dir,retained)
        build_cmd=['docker','exec',CONTAINER,'sh','-lc',
          'set -eu; export CARGO_HOME=/cargo-home CARGO_TARGET_DIR=/target/build CARGO_BUILD_JOBS=4; '
          'cd /workspace/crates/weft-python && /target/tooling-venv/bin/maturin build --release --locked --offline '
          '--interpreter "$(command -v python3)" --out /out']
        run_stage(capture,rows,'candidate-build',build_cmd,deadline,log_dir,retained)
        wheels=sorted(candidate.glob('*.whl'))
        if len(wheels)!=1 or wheels[0].is_symlink() or not wheels[0].is_file(): raise RuntimeError('candidate wheel roster mismatch')
        candidate_wheel=inspect_wheel(wheels[0])
        status='LOCAL_LINUX_SOURCE_TESTS_AND_CANDIDATE_BUILD_PASS'
    except BaseException as exc:
        failure=f'{type(exc).__name__}: {str(exc)[:400]}'
    finally:
        clean_start=time.monotonic()
        cleanup_deadline=clean_start+CLEANUP_SECONDS
        if container_attempted:
            try:
                listed=checked(['docker','ps','-a','--filter',f'name=^/{CONTAINER}$','--format','{{.Names}}'],timeout=20)
                if listed.splitlines()==[CONTAINER]:
                    info=json.loads(checked(['docker','inspect',CONTAINER],timeout=10))[0]
                    if info.get('Config',{}).get('Labels',{}).get('codex.g03.owner')!=EXECUTION_ID:
                        raise RuntimeError('container owner label mismatch; refusing removal')
                    remaining=cleanup_deadline-time.monotonic()
                    if remaining<=0: raise TimeoutError('shared cleanup deadline reached before container removal')
                    subprocess.run(['docker','rm','-f',CONTAINER],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(15,remaining),check=True)
                elif listed: cleanup_errors.append('container name lookup was not exact')
                absent=checked(['docker','ps','-a','--filter',f'name=^/{CONTAINER}$','--format','{{.Names}}'],timeout=10)
                if absent: cleanup_errors.append('owned container remains after cleanup')
            except BaseException as exc: cleanup_errors.append(f'container cleanup {type(exc).__name__}: {str(exc)[:160]}')
        for name in reversed(volumes):
            try:
                remaining=cleanup_deadline-time.monotonic()
                if remaining<=0: raise TimeoutError('shared cleanup deadline reached')
                names=checked(['docker','volume','ls','-q','--filter',f'name=^{name}$'],timeout=min(8,remaining))
                if names:
                    if names.splitlines()!=[name]: raise RuntimeError('volume name listing was not exact')
                    v=json.loads(checked(['docker','volume','inspect',name],timeout=min(8,max(0.1,cleanup_deadline-time.monotonic()))))[0]
                    if v.get('Name')!=name or v.get('Labels',{}).get('codex.g03.owner')!=EXECUTION_ID:
                        cleanup_errors.append(f'volume ownership mismatch: {name}')
                    else:
                        remaining=cleanup_deadline-time.monotonic()
                        if remaining<=0: raise TimeoutError('shared cleanup deadline reached')
                        subprocess.run(['docker','volume','rm',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(15,remaining),check=True)
                        remain=cleanup_deadline-time.monotonic()
                        absent=checked(['docker','volume','ls','-q','--filter',f'name=^{name}$'],timeout=min(8,max(0.1,remain)))
                        if absent: cleanup_errors.append(f'owned volume remains after cleanup: {name}')
            except BaseException as exc: cleanup_errors.append(f'volume cleanup {name} {type(exc).__name__}: {str(exc)[:160]}')
        cleanup_time=time.monotonic()-clean_start
        if cleanup_time>CLEANUP_SECONDS: cleanup_errors.append('cleanup deadline exceeded')
        final_source=None
        try:
            final_source=source_identity()
            if final_source!=source: cleanup_errors.append('source identity changed during run')
        except BaseException as exc: cleanup_errors.append(f'post-run source check {type(exc).__name__}: {str(exc)[:160]}')
        if cleanup_errors: status='FAIL_OR_UNKNOWN'
        record={'profile':'umf.g03-local-linux-source-test-build/1','status':status,'executionId':EXECUTION_ID,
          'source':source,'postRunSource':final_source,'image':{'reference':IMAGE,'id':image['Id'],'os':image['Os'],'architecture':image['Architecture']},
          'candidateVersion':CANDIDATE_VERSION,'operator':{'runnerSha256':sha(pathlib.Path(__file__).read_bytes()),
          'captureHelper':str(CAPTURE_HELPER),'captureHelperSha256':CAPTURE_HELPER_SHA},
          'limits':{'aggregateSeconds':TOTAL_SECONDS,'terminalReserveSeconds':TERMINAL_RESERVE,'cleanupSeconds':CLEANUP_SECONDS,
          'stageSeconds':STAGE_LIMITS,'logBytes':MAX_LOG_BYTES,'metadataBytes':MAX_METADATA_BYTES,
          'candidateWheelBytes':MAX_WHEEL_BYTES,'candidateWheelExpandedBytes':MAX_EXPANDED_WHEEL_BYTES,
          'cpu':CPU,'memory':MEMORY,'pids':PIDS,'network':'bridge only during locked setup; detached before test/build',
          'sourceMount':'read-only','terminationGraceSeconds':10},
          'commands':rows,'outerLogRetainedBytes':retained[0],
          'candidateWheel':candidate_wheel if 'candidate_wheel' in locals() else None,
          'maturinProvisioning':({'path':str(candidate/'provisioning.json'),
            'sha256':file_sha(candidate/'provisioning.json',1024*1024)[1]} if (candidate/'provisioning.json').is_file() else None),
          'cleanup':{'durationSeconds':round(cleanup_time,3),'errors':cleanup_errors},
          'outerDurationSeconds':round(time.monotonic()-started,3),'failure':failure or ('; '.join(cleanup_errors) if cleanup_errors else None)}
        result=OUTPUT/'result.json'
        raw=(json.dumps(record,sort_keys=True,indent=2)+'\n').encode()
        if len(raw)>MAX_METADATA_BYTES:
            status='FAIL_OR_UNKNOWN'; record['status']=status; record['failure']='metadata evidence cap exceeded'
            raw=(json.dumps(record,sort_keys=True,indent=2)+'\n').encode()
        result.write_bytes(raw)
        metadata_files=[]; metadata_bytes=0
        for path in sorted(OUTPUT.rglob('*')):
            if not path.is_file() or path.is_symlink() or path.suffix=='.whl': continue
            size=path.stat().st_size; metadata_bytes+=size
            metadata_files.append({'path':str(path.relative_to(OUTPUT)),'sizeBytes':size})
        if metadata_bytes>MAX_METADATA_BYTES or retained[0]>MAX_LOG_BYTES or time.monotonic()-started>TOTAL_SECONDS:
            status='FAIL_OR_UNKNOWN'; record['status']=status
            record['failure']='selected metadata/log or total-duration cap exceeded'
            record['selectedMetadataBytes']=metadata_bytes; record['selectedLogBytes']=retained[0]
            raw=(json.dumps(record,sort_keys=True,indent=2)+'\n').encode()
            result.write_bytes(raw)
    print(json.dumps({'status':status,'result':str(OUTPUT/'result.json'),'failure':failure}))
    return 0 if status=='LOCAL_LINUX_SOURCE_TESTS_AND_CANDIDATE_BUILD_PASS' else 1

if __name__=='__main__': raise SystemExit(main())
