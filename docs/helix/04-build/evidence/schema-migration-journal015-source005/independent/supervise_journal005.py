"""One owned endpoint-enable phase under the reviewed 45+15 process guard."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

import psutil

Q = Path('/private/tmp/g11-journal005-independent-review001')
WORKER = Q / 'verify005_controller.py'
EXPECTED = 'dde1a321799ce1418ac3302e651b3001851d190eba20675f8fb757a6ecd889de'

def write(path, value):
    raw = (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())

def group_alive(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False

def signal_group(pgid, signal_number):
    try:
        os.killpg(pgid, signal_number)
    except ProcessLookupError:
        pass

def main():
    started = time.monotonic()
    assert not WORKER.is_symlink() and hashlib.sha256(WORKER.read_bytes()).hexdigest() == EXPECTED
    marker = Q / 'journal005-verification-supervisor-consumed.safe.json'
    write(marker, {'owner': 'sole-operator', 'scope': 'exact-frozen-journal005-source-verification', 'worker_sha256': EXPECTED,
                   'replay_allowed': False, 'prior_unused_go_superseded': True})
    out = Q / ('journal005-verification-once-' + str(uuid.uuid4()))
    out.mkdir(mode=0o700)
    proc = None
    facts = {'worker_sha256': EXPECTED, 'sql_authorized': 'none', 'provider_mutations_authorized': False}
    with (out / 'stdout.private.log').open('xb') as stdout, (out / 'stderr.private.log').open('xb') as stderr:
        os.chmod(stdout.name, 0o600)
        os.chmod(stderr.name, 0o600)
        try:
            proc = subprocess.Popen([sys.executable, '-I', '-B', str(WORKER)],
                                    stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                    close_fds=True, start_new_session=True)
            facts.update(pid=proc.pid, pgid=proc.pid, start_time_unix=psutil.Process(proc.pid).create_time())
            write(out / 'launch.safe.json', facts)
            print(json.dumps({'directory': str(out), 'launch': facts}), flush=True)
            try:
                proc.wait(timeout=max(0.0, started + 45 - time.monotonic()))
                facts['worker_completed_within_work_budget'] = time.monotonic() <= started + 45
            except subprocess.TimeoutExpired:
                facts['work_timed_out'] = True
        finally:
            if proc is not None:
                # The direct child has its own new session. Cleanup runs for every
                # path after Popen, including metadata and wait failures.
                if group_alive(proc.pid):
                    signal_group(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=min(5.0, max(0.0, started + 55 - time.monotonic())))
                except subprocess.TimeoutExpired:
                    pass
                if group_alive(proc.pid):
                    signal_group(proc.pid, signal.SIGKILL)
                try:
                    proc.wait(timeout=max(0.0, started + 58 - time.monotonic()))
                except subprocess.TimeoutExpired:
                    facts['reap_incomplete'] = True
                while group_alive(proc.pid) and time.monotonic() < started + 59:
                    time.sleep(0.05)
                facts.update(exit_code=proc.poll(), process_group_absent=not group_alive(proc.pid))
            facts['elapsed_seconds'] = time.monotonic() - started
            write(out / 'terminal.safe.json', facts)
    print(json.dumps({'directory': str(out), 'terminal': facts}), flush=True)
    return 0 if (facts.get('exit_code') == 0 and facts.get('process_group_absent')
                 and facts.get('worker_completed_within_work_budget') is True
                 and not facts.get('work_timed_out') and not facts.get('reap_incomplete')) else 1

if __name__ == '__main__':
    raise SystemExit(main())
