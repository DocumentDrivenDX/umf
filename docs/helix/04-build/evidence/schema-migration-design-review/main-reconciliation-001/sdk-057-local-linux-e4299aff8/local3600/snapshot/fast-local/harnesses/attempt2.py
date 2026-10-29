#!/usr/bin/env python3
"""Bounded local Linux equivalent for the paused UMF pr-fast workflow.

Default behavior is a dry plan summary. Execution requires the explicit --run
flag after review of this file's frozen SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import selectors
import textwrap
import signal
import subprocess
import sys
import time
import uuid

SOURCE_VOLUME = 'umf-migration-source-267675510'
IMAGE = 'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
EXPECTED_COMMIT = 'e4299aff8e87e9d211f9d86df2f2013ab9c95945'
EXPECTED_TREE = '8b98c0d895983ba2b7637dd3aea567dab0943883'
WORKFLOW_SHA = '7aab9a13445f9fcc1e3bb4a3d05a2a2edc1e06598162c1f0dec3f9392860c330'
PACKAGE_SHA = 'c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b'
LOCK_SHA = '5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4'
TS_CONFIG_SHA = 'fb5e87db29d610bb807d2be59e8c40700d9040532d918dfb7c3d8f51ad420918'
TOTAL_SECONDS = 600
LOG_CAP = 1_048_576
TERM_GRACE_SECONDS = 10
RESERVE_SECONDS = 25


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: pathlib.Path, value: object) -> None:
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n', encoding='utf-8')


def input_manifest(root: pathlib.Path) -> dict:
    rows = []
    total_bytes = 0
    for base, dirs, files in os.walk(root, topdown=True, followlinks=False):
        symlink_dirs = [name for name in dirs if (pathlib.Path(base) / name).is_symlink()]
        dirs[:] = sorted(name for name in dirs if name != 'node_modules' and name not in symlink_dirs)
        for name in sorted(dirs + files + symlink_dirs):
            path = pathlib.Path(base) / name
            rel = path.relative_to(root).as_posix()
            if path.is_symlink():
                rows.append({'path': rel, 'kind': 'symlink', 'target': os.readlink(path)})
            elif path.is_file():
                size = path.stat().st_size
                total_bytes += size
                rows.append({'path': rel, 'kind': 'file', 'sizeBytes': size, 'sha256': sha256(path)})
            elif path.is_dir():
                rows.append({'path': rel, 'kind': 'directory'})
            else:
                rows.append({'path': rel, 'kind': 'special'})
    canonical = json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()
    return {'filesAndDirectories': rows, 'regularFileBytes': total_bytes,
            'entryCount': len(rows), 'sha256': hashlib.sha256(canonical).hexdigest()}


def terminate_group(proc: subprocess.Popen, cidfile: pathlib.Path) -> dict:
    outcome = {'termSent': False, 'killSent': False, 'ownedContainerCleanup': 'no-cidfile'}
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        outcome['termSent'] = True
    except ProcessLookupError:
        pass
    try:
        proc.wait(timeout=TERM_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
            outcome['killSent'] = True
        except ProcessLookupError:
            pass
        proc.wait()
    if cidfile.is_file():
        cid = cidfile.read_text(encoding='ascii').strip()
        if cid:
            check = subprocess.run(['docker', 'inspect', '--type=container', cid],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   timeout=10, check=False)
            if check.returncode == 0:
                subprocess.run(['docker', 'rm', '--force', cid], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=10, check=False)
            verify = subprocess.run(['docker', 'inspect', '--type=container', cid],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    timeout=10, check=False)
            outcome['ownedContainerCleanup'] = 'verified-absent' if verify.returncode != 0 else 'FAILED-still-present'
    return outcome


class Run:
    def __init__(self, root: pathlib.Path):
        self.root = root
        self.started = time.monotonic()
        self.deadline = self.started + TOTAL_SECONDS
        self.log_bytes = 0
        self.steps = []
        self.cleanup = []
        self.failed = None

    def container(self, name: str, script: str, network: str, timeout: int,
                  work: pathlib.Path, source_mount: bool = False) -> dict:
        left = int(self.deadline - time.monotonic() - RESERVE_SECONDS)
        allowed = min(timeout, left)
        if allowed <= 0:
            raise TimeoutError('aggregate deadline reserve reached before ' + name)
        cidfile = self.root / 'evidence' / (name + '.cid')
        if cidfile.exists():
            raise RuntimeError('container CID file already exists for ' + name)
        argv = ['docker', 'run', '--rm', '--pull=never', '--platform=linux/amd64',
                f'--network={network}', '--read-only', '--tmpfs', '/tmp:rw,size=256m',
                '--cpus=4', '--memory=8g', '--pids-limit=8192',
                '--cidfile', str(cidfile), '--mount', f'type=bind,src={work},dst=/work']
        if source_mount:
            argv += ['--mount', f'type=volume,src={SOURCE_VOLUME},dst=/source,readonly']
        argv += ['--workdir', '/work/source', '--entrypoint', '/bin/bash', IMAGE, '-lc', script]
        stdout_path = self.root / 'evidence' / (name + '.stdout.log')
        stderr_path = self.root / 'evidence' / (name + '.stderr.log')
        started = time.monotonic()
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                start_new_session=True)
        selector = selectors.DefaultSelector()
        out = stdout_path.open('wb')
        err = stderr_path.open('wb')
        selector.register(proc.stdout, selectors.EVENT_READ, out)
        selector.register(proc.stderr, selectors.EVENT_READ, err)
        counts = {out: 0, err: 0}
        timed_out = False
        truncated = False
        while selector.get_map():
            remain = min(allowed - (time.monotonic() - started),
                         self.deadline - RESERVE_SECONDS - time.monotonic())
            if remain <= 0:
                timed_out = True
                break
            for key, _ in selector.select(min(0.25, remain)):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                take = min(len(chunk), max(0, LOG_CAP - self.log_bytes))
                if take:
                    key.data.write(chunk[:take]); counts[key.data] += take; self.log_bytes += take
                if take < len(chunk):
                    truncated = True
                    break
            if truncated:
                break
            if proc.poll() is not None and not selector.get_map():
                break
        cleanup = None
        if timed_out or truncated:
            cleanup = terminate_group(proc, cidfile)
        else:
            proc.wait()
        out.flush(); err.flush(); out.close(); err.close()
        if cleanup is None and cidfile.is_file():
            cid = cidfile.read_text(encoding='ascii').strip()
            verify = subprocess.run(['docker', 'inspect', '--type=container', cid],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    timeout=10, check=False)
            cleanup = {'ownedContainerCleanup': 'verified-absent' if verify.returncode != 0 else 'FAILED-still-present'}
            if verify.returncode == 0:
                subprocess.run(['docker', 'rm', '--force', cid], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=10, check=False)
                check = subprocess.run(['docker', 'inspect', '--type=container', cid],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=10, check=False)
                cleanup['ownedContainerCleanup'] = 'verified-absent' if check.returncode != 0 else 'FAILED-still-present'
        else:
            cleanup = cleanup or {'ownedContainerCleanup': 'no-cidfile'}
        self.cleanup.append({'step': name, **cleanup})
        row = {'name': name, 'argv': argv, 'network': network, 'exitCode': proc.returncode,
               'durationSeconds': round(time.monotonic() - started, 3), 'timedOut': timed_out,
               'truncated': truncated, 'stdout': {'path': str(stdout_path.relative_to(self.root)),
                   'sizeBytes': counts[out], 'sha256': sha256(stdout_path)},
               'stderr': {'path': str(stderr_path.relative_to(self.root)),
                   'sizeBytes': counts[err], 'sha256': sha256(stderr_path)}, 'cleanup': cleanup}
        self.steps.append(row)
        if timed_out or truncated or proc.returncode != 0 or cleanup.get('ownedContainerCleanup') != 'verified-absent':
            raise RuntimeError(f'{name} failed, timed out, truncated, or left an owned container')
        return row


def run_identities(work: pathlib.Path) -> dict:
    source_root = work / 'source'
    manifest_before = input_manifest(source_root)
    write_json(work / 'evidence' / 'source-manifest-before.json', manifest_before)
    fixed = {
        'package.json': PACKAGE_SHA, 'bun.lock': LOCK_SHA, 'tsconfig.json': TS_CONFIG_SHA,
    }
    actual = {name: sha256(source_root / name) for name in fixed}
    if actual != fixed:
        raise RuntimeError('copied package/lock/tsconfig bytes differ from the frozen source manifest')
    return manifest_before


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true', help='execute candidate commands; otherwise print plan only')
    parser.add_argument('--output', type=pathlib.Path,
                        default=pathlib.Path('/private/tmp/migration-pr-fast-local-e4299aff8-002'))
    args = parser.parse_args()
    if not args.run:
        print(json.dumps({'profile':'umf.pr-fast-local-equivalent/1','status':'PLAN_ONLY',
                          'sourceVolume':SOURCE_VOLUME,'image':IMAGE,'commands':[
                              'bun install --frozen-lockfile',
                              'bun test tests/core/cardinality-ideals.test.ts tests/core/nullability-ideals.test.ts tests/core/field-ideals.test.ts',
                              'bun build src/model/document.ts src/validation/document.ts --target=browser --outdir /work/output/umf-pr-fast',
                              'python -m compileall -q python scripts']}, sort_keys=True, indent=2))
        return 0
    root = args.output.resolve()
    if root.exists():
        raise SystemExit(f'owned run path already exists: {root}')
    work = root / 'work'
    evidence = root / 'evidence'
    work.mkdir(parents=True)
    evidence.mkdir()
    (work / 'source').mkdir()
    (work / 'output').mkdir()
    (work / 'home').mkdir()
    (work / 'pycache').mkdir()
    run = Run(root)
    receipt = {'profile':'umf.pr-fast-local-equivalent/1','status':'FAIL_OR_UNKNOWN',
               'executionKind':'local_linux_diagnostic','source':{'volume':SOURCE_VOLUME,
               'expectedCommit':EXPECTED_COMMIT,'expectedTree':EXPECTED_TREE,'workflowSha256':WORKFLOW_SHA,
               'packageSha256':PACKAGE_SHA,'bunLockSha256':LOCK_SHA,'tsconfigSha256':TS_CONFIG_SHA},
               'runtimeImage':{'reference':IMAGE,'platform':'linux/amd64'},
               'pythonQualification':'minimum-supported local syntax profile only; Python 3.12 workflow evidence not established',
               'totalTimeLimitSeconds':TOTAL_SECONDS,'aggregateLogCapBytes':LOG_CAP,
               'termGraceSeconds':TERM_GRACE_SECONDS,'startedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'commands':run.steps,'cleanup':run.cleanup}
    write_json(evidence / 'input-plan.json', {'sourceVolume':SOURCE_VOLUME,'image':IMAGE,
              'commit':EXPECTED_COMMIT,'tree':EXPECTED_TREE,'workflowSha256':WORKFLOW_SHA,
              'commands':['bun install --frozen-lockfile',
                'bun test tests/core/cardinality-ideals.test.ts tests/core/nullability-ideals.test.ts tests/core/field-ideals.test.ts',
                'bun build src/model/document.ts src/validation/document.ts --target=browser --outdir /work/output/umf-pr-fast',
                'python -m compileall -q python scripts']})
    try:
        copy_script = textwrap.dedent(r'''
          set -euo pipefail
          commit="$(git -c safe.directory=/source -C /source rev-parse HEAD)"
          tree="$(git -c safe.directory=/source -C /source rev-parse 'HEAD^{tree}')"
          status="$(GIT_OPTIONAL_LOCKS=0 git -c safe.directory=/source -C /source status --porcelain=v1 --untracked-files=all)"
          test "$commit" = "e4299aff8e87e9d211f9d86df2f2013ab9c95945"
          test "$tree" = "8b98c0d895983ba2b7637dd3aea567dab0943883"
          test -z "$status"
          test "$(sha256sum /source/.github/workflows/pr-fast.yml | cut -d' ' -f1)" = "7aab9a13445f9fcc1e3bb4a3d05a2a2edc1e06598162c1f0dec3f9392860c330"
          mkdir -p /work/source/tests /work/source/.github/workflows /work/output /work/home /work/pycache
          for path in src spec python scripts patches package.json bun.lock; do cp -a "/source/$path" /work/source/; done
          cp -a /source/tests/core /work/source/tests/
          cp -a /source/.github/workflows/pr-fast.yml /work/source/.github/workflows/
          for path in /source/tsconfig*.json; do cp -a "$path" /work/source/; done
          python3 - "$commit" "$tree" "$status" <<'PYCODE'
          import json, pathlib, sys
          pathlib.Path('/work/source-identity.json').write_text(json.dumps({
              'commit':sys.argv[1], 'tree':sys.argv[2], 'porcelainStatus':sys.argv[3],
              'workflowSha256':'7aab9a13445f9fcc1e3bb4a3d05a2a2edc1e06598162c1f0dec3f9392860c330'}, sort_keys=True, indent=2)+'\n')
          PYCODE
        ''').strip()
        run.container('source-copy', copy_script, 'none', 240, work, source_mount=True)
        source_identity = json.loads((work / 'source-identity.json').read_text())
        if source_identity.get('commit') != EXPECTED_COMMIT or source_identity.get('tree') != EXPECTED_TREE or source_identity.get('porcelainStatus') != '':
            raise RuntimeError('source-volume P/tree/clean identity did not close')
        before = run_identities(work)
        receipt['source']['copyManifestSha256'] = before['sha256']
        receipt['source']['copyManifestBytes'] = before['regularFileBytes']
        receipt['source']['fileCount'] = before['entryCount']
        receipt['source']['identity'] = source_identity
        runtime_row = run.container('runtime-identity', 'set -eu; printf "os-release\\n"; cat /etc/os-release; printf "kernel\\n"; uname -a; printf "bun\\n"; bun --version; printf "python\\n"; python --version', 'none', 30, work)
        runtime_text = (evidence / runtime_row['stdout']['path']).read_text(encoding='utf-8')
        if '\nbun\n1.4.3\n' not in '\n' + runtime_text or '\npython\nPython 3.11.17\n' not in '\n' + runtime_text:
            raise RuntimeError('runtime identity did not match pinned Bun/Python versions')
        receipt['runtimeImage'].update({'observedBun':'1.4.3','observedPython':'Python 3.11.17','identityLogSha256':runtime_row['stdout']['sha256'],'identityLogBytes':runtime_row['stdout']['sizeBytes']})
        receipt['source']['identity']['bunVersion'] = '1.4.3'
        receipt['source']['identity']['pythonVersion'] = 'Python 3.11.17'
        run.container('locked-dependency-install', 'set -eu; export HOME=/work/home; bun install --frozen-lockfile', 'bridge', 240, work)
        if sha256(work / 'source/package.json') != PACKAGE_SHA or sha256(work / 'source/bun.lock') != LOCK_SHA:
            raise RuntimeError('frozen dependency install changed package.json or bun.lock')
        test_cmd = 'set -eu; export HOME=/work/home; bun test tests/core/cardinality-ideals.test.ts tests/core/nullability-ideals.test.ts tests/core/field-ideals.test.ts'
        test_row = run.container('portable-core-unit', test_cmd, 'none', 180, work)
        test_text = (evidence / test_row['stdout']['path']).read_text(encoding='utf-8')
        pass_counts = [int(value) for value in re.findall(r'(?m)^\s*(\d+)\s+pass\b', test_text)]
        if not pass_counts:
            raise RuntimeError('Bun output did not expose a passing-test count')
        receipt['unitTestResults'] = {'passingTestsReported':sum(pass_counts),'stdoutSha256':test_row['stdout']['sha256'],'stdoutBytes':test_row['stdout']['sizeBytes']}
        build_cmd = 'set -eu; export HOME=/work/home RUNNER_TEMP=/work/output; bun build src/model/document.ts src/validation/document.ts --target=browser --outdir "$RUNNER_TEMP/umf-pr-fast"'
        run.container('browser-targeted-build', build_cmd, 'none', 90, work)
        py_cmd = 'set -eu; export HOME=/work/home PYTHONPYCACHEPREFIX=/work/pycache; python -m compileall -q python scripts'
        run.container('python-syntax-compile', py_cmd, 'none', 90, work)
        after = input_manifest(work / 'source')
        write_json(evidence / 'source-manifest-after.json', after)
        if before['sha256'] != after['sha256']:
            raise RuntimeError('copied source files changed during checks')
        if sha256(work / 'source/package.json') != PACKAGE_SHA or sha256(work / 'source/bun.lock') != LOCK_SHA:
            raise RuntimeError('package.json or bun.lock changed during checks')
        built = work / 'output/umf-pr-fast'
        if not built.is_dir():
            raise RuntimeError('browser build output directory missing')
        build_files = []
        total_build_bytes = 0
        for path in sorted(p for p in built.rglob('*') if p.is_file() and not p.is_symlink()):
            size = path.stat().st_size; total_build_bytes += size
            build_files.append({'path':path.relative_to(work).as_posix(),'sizeBytes':size,'sha256':sha256(path)})
        if not build_files or total_build_bytes > 16*1024*1024:
            raise RuntimeError('browser build output is empty or exceeds bounded 16 MiB capture')
        receipt['browserBundle'] = {'files':build_files,'totalBytes':total_build_bytes}
        cache_files = [p for p in (work / 'pycache').rglob('*.pyc') if p.is_file()]
        receipt['pythonSyntax'] = {'interpreter':'Python 3.11.17','requiredWorkflowInterpreter':'Python 3.12','compiledCacheOutsideSource':True,'compiledBytecodeFiles':len(cache_files)}
        receipt['status'] = 'LOCAL_LINUX_PR_FAST_EQUIVALENT_PASS_PY311'
    except Exception as exc:
        receipt['failure'] = f'{type(exc).__name__}: {str(exc)[:300]}'
    finally:
        receipt['commands'] = run.steps
        receipt['cleanup'] = run.cleanup
        receipt['elapsedSeconds'] = round(time.monotonic() - run.started, 3)
        receipt['aggregateCapturedLogBytes'] = run.log_bytes
        receipt['finishedUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        write_json(evidence / 'receipt.json', receipt)
    return 0 if receipt['status'] == 'LOCAL_LINUX_PR_FAST_EQUIVALENT_PASS_PY311' else 1


if __name__ == '__main__':
    raise SystemExit(main())
