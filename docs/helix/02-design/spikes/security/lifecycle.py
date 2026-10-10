"""Native lock ordering witness and stale-snapshot counterexample, not an installer."""
import hashlib
import json
import queue
import subprocess
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
CONTAINER = "umf-security-spike-20261008"
BASE = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-U"]


def run(source, user="postgres"):
    p = subprocess.run(BASE + [user], input=source, text=True, capture_output=True, timeout=10)
    assert p.returncode == 0, p.stderr
    return p.stdout.strip()


class Session:
    def __init__(self, user):
        self.p = subprocess.Popen(BASE + [user], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, bufsize=1)
        self.q = queue.Queue()
        self.lines = []
        def pump():
            for line in self.p.stdout:
                self.lines.append(line.strip())
                self.q.put(line.strip())
        self.thread = threading.Thread(target=pump, daemon=True)
        self.thread.start()

    def send(self, source):
        self.p.stdin.write(source + "\n")
        self.p.stdin.flush()

    def wait(self, marker):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            line = self.q.get(timeout=max(.01, deadline - time.monotonic()))
            if line == marker:
                return
        raise AssertionError("Missing native barrier: " + marker)

    def close(self):
        if self.p.poll() is None:
            self.p.stdin.close()
            try:
                self.p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.p.kill()
                self.p.wait(timeout=5)
        self.thread.join(timeout=2)
        stderr = self.p.stderr.read()
        assert self.p.returncode == 0, stderr


reader = revoker = stale = None
cases = []
try:
    run("UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A';")
    reader = Session("umf_security_alice")
    reader.send("BEGIN ISOLATION LEVEL READ COMMITTED; SELECT pg_advisory_xact_lock_shared(529052); SELECT 'ADMITTED';")
    reader.wait("ADMITTED")
    reader.send("SELECT id FROM sec.resource ORDER BY id; SELECT 'ROWS_READY';")
    reader.wait("ROWS_READY")
    assert "RA" in reader.lines and "RB" not in reader.lines
    revoker = Session("postgres")
    revoker.send("BEGIN; SELECT pg_advisory_xact_lock(529052); UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A'; COMMIT; SELECT 'ACK';")
    waiting = False
    for _ in range(100):
        if run("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=529052 AND NOT granted);") == "t":
            waiting = True
            break
        time.sleep(.02)
    assert waiting, "Revoker did not block behind actual shared guard"
    assert "ACK" not in revoker.lines, "Premature revocation acknowledgment"
    # The tested final boundary is native statement result release, not HTTP response release.
    reader.send("SELECT 'FINAL_NATIVE_RELEASE'; COMMIT; SELECT 'DRAINED';")
    reader.wait("DRAINED")
    revoker.wait("ACK")
    reader.send("BEGIN; SELECT pg_advisory_xact_lock_shared(529052); SELECT count(*) FROM sec.resource; COMMIT; SELECT 'AFTER_ACK';")
    reader.wait("AFTER_ACK")
    assert reader.lines[-2:] == ["0", "AFTER_ACK"], reader.lines
    cases.append({"id": "native-guard-drain", "covers": ["US-057-AC2", "US-057-AC3"],
                  "status": "passed", "observedWaitingLock": waiting,
                  "reader": reader.lines, "revoker": revoker.lines,
                  "scope": "Participating PostgreSQL READ COMMITTED protocol; native result boundary only"})
    reader.close(); reader = None
    revoker.close(); revoker = None

    # Session-level guard survives native transaction completion while host rows remain live.
    for mode in ['release', 'cancel', 'early-native-close-negative-control']:
        run("UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A';")
        reader = Session("umf_security_alice")
        reader.send("SELECT pg_advisory_lock_shared(529052); BEGIN; SELECT id FROM sec.resource ORDER BY id; COMMIT; SELECT 'BUFFER_READY';")
        reader.wait("BUFFER_READY")
        buffer = [line for line in reader.lines if line in ['RA','RB','RO']]
        assert buffer == ['RA'], buffer
        revoker = Session("postgres")
        revoker.send("BEGIN; SELECT pg_advisory_xact_lock(529052); UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A'; COMMIT; SELECT 'BUFFER_ACK';")
        waiting = False
        for _ in range(100):
            if run("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=529052 AND NOT granted);") == 't':
                waiting = True
                break
            time.sleep(.02)
        assert waiting and 'BUFFER_ACK' not in revoker.lines
        events = ['native-transaction-committed','buffer-live','native-revoker-waiting']
        if mode == 'early-native-close-negative-control':
            reader.close(); reader = None
            revoker.wait('BUFFER_ACK')
            assert buffer == ['RA']
            events += ['native-session-closed','revocation-acknowledged','revoked-buffer-still-releasable']
            buffer.clear()
        else:
            delivered = list(buffer) if mode == 'release' else []
            buffer.clear()
            events += ['application-final-release' if mode == 'release' else 'application-buffer-invalidated']
            assert not buffer
            reader.send("SELECT pg_advisory_unlock_shared(529052); SELECT 'HOST_DRAINED';")
            reader.wait('HOST_DRAINED')
            revoker.wait('BUFFER_ACK')
            events += ['native-session-guard-released','revocation-acknowledged']
            assert delivered == (['RA'] if mode == 'release' else [])
            reader.close(); reader = None
        assert run('SELECT count(*) FROM sec.resource;', 'umf_security_alice') == '0'
        cases.append({'id':'application-buffer-'+mode,'covers':['US-057-AC2','US-057-AC3','US-057-AC7'],
                      'status':'passed','actor':'umf_security_alice','observedWaitingLock':waiting,'events':events,
                      'observedBufferedRows':['RA'],'revoker':list(revoker.lines),
                      'scope':'Participating Python/psql host buffer with session guard; negative control demonstrates early session close is unsafe; no public backend driver qualification'})
        revoker.close(); revoker = None

    run("UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A';")
    stale = Session("umf_security_alice")
    stale.send("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT sec.allowed('A'); SELECT 'SNAPSHOT_OPEN';")
    stale.wait("SNAPSHOT_OPEN")
    assert "t" in stale.lines
    run("UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A';")
    fresh = run("SELECT sec.allowed('A');", "umf_security_alice")
    stale.send("SELECT sec.allowed('A'); SELECT 'STALE_OBSERVED'; ROLLBACK;")
    stale.wait("STALE_OBSERVED")
    assert fresh == "f" and stale.lines[-2:] == ["t", "STALE_OBSERVED"], stale.lines
    cases.append({"id": "old-snapshot-negative-control", "covers": ["US-057-AC3", "US-057-AC7"],
                  "status": "passed", "fresh": fresh, "stale": stale.lines,
                  "observed": "RLS on an old snapshot still grants after removal; naive guard-only design is unsafe",
                  "scope": "Counterexample establishes required restart/refusal; no production admission implemented"})
    stale.close(); stale = None
finally:
    for session in [reader, revoker, stale]:
        if session:
            session.close()
    run("UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A';")

receipt = {"command": "python3 docs/helix/02-design/spikes/security/lifecycle.py",
           "server": run("SELECT version();"), "cases": cases,
           "sourceDigests": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [HERE / "lifecycle.py", HERE / "postgresql.sql"]},
           "scope": "Native and explicit application-buffer feasibility with negative controls; no full backend lifecycle acceptance"}
out = ROOT / "docs/helix/04-build/evidence/security/lifecycle.json"
out.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"passed": len(cases), "receipt": str(out)}))
