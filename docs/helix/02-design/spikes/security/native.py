"""Independent observations on disposable PostgreSQL, never a production installer."""
import hashlib
import json
import subprocess
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
CONTAINER = "umf-security-spike-20261008"
cases = []


def sql(source, user="postgres"):
    return subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-A", "-t",
         "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-U", user],
        input=source, text=True, capture_output=True, timeout=30)


def observe(id, query, expected, covers, role=None, error=None):
    source = ("BEGIN; SET LOCAL ROLE " + role + ";\n" if role else "") + query
    if role:
        source += "\nROLLBACK;"
    run = sql(source, role or "postgres")
    rows = [line for line in run.stdout.splitlines() if line]
    passed = (run.returncode != 0 and error in run.stderr) if error else (
        run.returncode == 0 and rows == expected)
    case = {"id": id, "covers": covers, "backend": "postgresql-17.9-synthetic",
            "layer": "native", "role": role or "excluded-administrator",
            "source": source, "expected": error or expected, "observed": rows,
            "stderr": run.stderr, "status": "passed" if passed else "failed"}
    cases.append(case)
    if not passed:
        failure = ROOT / "docs/helix/04-build/evidence/security/native-failure.json"
        failure.parent.mkdir(parents=True, exist_ok=True)
        failure.write_text(json.dumps(case, indent=2) + "\n")
    assert passed, case


setup = sql("DROP SCHEMA IF EXISTS sec CASCADE; DROP ROLE IF EXISTS umf_security_alice; DROP ROLE IF EXISTS umf_security_bob; DROP ROLE IF EXISTS umf_security_outsider;\n" + (HERE / "postgresql.sql").read_text())
assert setup.returncode == 0, setup.stderr
server = sql("SELECT version();")
assert server.returncode == 0

# Independent expected oracle: no native predicate or graph query is reused.
assignments = {("Alice", "A"): True, ("Alice", "B"): False, ("Bob", "B"): True}
resources = {"RA": "A", "RB": "B", "RO": None}
for who in ["Alice", "Bob", "Outsider"]:
    role = "umf_security_" + who.lower()
    expected = sorted(r for r, owner in resources.items() if assignments.get((who, owner), False))
    observe("raw-read-" + who, "SELECT id FROM sec.resource ORDER BY id;", expected,
            ["US-079-AC4", "US-079-AC5", "US-056-AC1"], role)
    observe("graph-read-" + who, "SELECT id FROM sec.node ORDER BY id;", expected,
            ["US-056-AC2"], role)
    observe("count-" + who, "SELECT count(*) FROM sec.resource;", [str(len(expected))],
            ["US-056-AC1"], role)
    for table in ["assignment", "staff", "edge", "secret_resource"]:
        observe("private-" + table + "-" + who, "SELECT * FROM sec." + table + ";", [],
                ["US-056-AC5", "US-056-AC8"], role, "permission denied")

observe("mask-null", "SELECT id,note::text,note_disposition,salary,salary_disposition FROM sec.safe_resource;",
        ["SA|null|original||withheld"], ["US-079-AC7", "US-056-AC6"], "umf_security_alice")
observe("mask-absence", "SELECT id,note::text,note_disposition,salary,salary_disposition FROM sec.safe_resource;",
        ["SB||absent||withheld"], ["US-079-AC7", "US-056-AC6"], "umf_security_bob")
observe("insert-owned", "INSERT INTO sec.resource VALUES('NEW','A','new'); SELECT id FROM sec.resource ORDER BY id;",
        ["NEW", "RA"], ["US-057-AC1"], "umf_security_alice")
observe("insert-foreign", "INSERT INTO sec.resource VALUES('NEW','B','new');", [],
        ["US-057-AC1"], "umf_security_alice", "row-level security")
observe("update-original-hidden", "UPDATE sec.resource SET value='changed' WHERE id='RB' RETURNING id;",
        [], ["US-057-AC1"], "umf_security_alice")
observe("update-proposed-foreign", "UPDATE sec.resource SET project_id='B' WHERE id='RA';", [],
        ["US-057-AC1"], "umf_security_alice", "row-level security")
observe("delete-foreign", "DELETE FROM sec.resource WHERE id='RB' RETURNING id;", [],
        ["US-057-AC1"], "umf_security_alice")
observe("delete-owned", "DELETE FROM sec.resource WHERE id='RA' RETURNING id;", ["RA"],
        ["US-057-AC1"], "umf_security_alice")
observe("role-reset", "BEGIN; SET LOCAL ROLE umf_security_alice; COMMIT; SELECT current_setting('role');",
        ["none"], ["US-056-AC5"])
observe("cannot-adopt-other-role", "SET ROLE umf_security_bob;", [],
        ["US-056-AC5"], "umf_security_alice", "permission denied")
# Deliberate disposable membership drift: identity must remain the original connection actor.
drift = sql("GRANT umf_security_bob TO umf_security_alice;")
assert drift.returncode == 0, drift.stderr
observe("delegated-role-original-actor", "SET LOCAL ROLE umf_security_bob; SELECT current_user,session_user;",
        ["umf_security_bob|umf_security_alice"], ["US-056-AC5"], "umf_security_alice")
observe("delegated-role-raw-identity", "SET LOCAL ROLE umf_security_bob; SELECT id FROM sec.resource ORDER BY id;",
        ["RA"], ["US-056-AC1", "US-056-AC5"], "umf_security_alice")
observe("delegated-role-graph-identity", "SET LOCAL ROLE umf_security_bob; SELECT id FROM sec.node ORDER BY id;",
        ["RA"], ["US-056-AC2", "US-056-AC5"], "umf_security_alice")
observe("delegated-role-mask-identity", "SET LOCAL ROLE umf_security_bob; SELECT id FROM sec.safe_resource ORDER BY id;",
        ["SA"], ["US-056-AC5", "US-056-AC6"], "umf_security_alice")
# A meaningful weakened control demonstrates the exact impersonation defect.
auth_source = re.search(r"CREATE FUNCTION sec.allowed\(p text\).*?\$\$;", (HERE / "postgresql.sql").read_text(), re.S)
assert auth_source is not None
original = auth_source.group(0).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
mutant = original.replace("s.native_role=session_user::text", "s.native_role=current_setting('role')")
assert mutant != original
installed_mutant = sql(mutant)
assert installed_mutant.returncode == 0, installed_mutant.stderr
observe("weakened-role-impersonation-counterexample", "SET LOCAL ROLE umf_security_bob; SELECT id FROM sec.resource ORDER BY id;",
        ["RB"], ["US-056-AC5"], "umf_security_alice")
restored = sql(original + "\nREVOKE umf_security_bob FROM umf_security_alice;")
assert restored.returncode == 0, restored.stderr
observe("restored-ordinary-role-isolation", "SET ROLE umf_security_bob;", [],
        ["US-056-AC5"], "umf_security_alice", "permission denied")
observe("restored-raw-identity", "SELECT id FROM sec.resource ORDER BY id;", ["RA"],
        ["US-056-AC1", "US-056-AC5"], "umf_security_alice")

observe("cannot-change-authenticated-actor", "SET SESSION AUTHORIZATION umf_security_bob;", [],
        ["US-056-AC5"], "umf_security_alice", "permission denied")
observe("caller-authored-subject-is-ignored", "SET LOCAL umf.subject='Bob'; SELECT id FROM sec.resource ORDER BY id;", ["RA"],
        ["US-056-AC1", "US-056-AC5"], "umf_security_alice")
# Every ordinary observation uses an actual unprivileged connection identity.

observe("excluded-admin-bypass", "SELECT id FROM sec.resource ORDER BY id;", ["RA", "RB", "RO"],
        ["US-056-AC5"])
observe("ordinary-role-attributes", "SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user;",
        ["f|f|f"], ["US-056-AC5"], "umf_security_alice")
observe("cannot-disable-rls", "ALTER TABLE sec.resource DISABLE ROW LEVEL SECURITY;", [],
        ["US-056-AC5", "US-056-AC9"], "umf_security_alice", "must be owner")
observe("forced-native-inventory", "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='sec.resource'::regclass;",
        ["t|t"], ["US-056-AC9"])

out = ROOT / "docs/helix/04-build/evidence/security/native.json"
receipt = {"server": server.stdout.strip(), "container": CONTAINER,
           "sourceDigests": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [HERE / "native.py", HERE / "postgresql.sql"]},
           "command": "python3 docs/helix/02-design/spikes/security/native.py",
           "cases": cases, "identityControl": {"membershipDrift": "GRANT umf_security_bob TO umf_security_alice",
             "originalHelper": original, "weakenedHelper": mutant,
             "restoration": "Restore original helper and REVOKE umf_security_bob FROM umf_security_alice",
             "scope": "Original session identity versus adopted role; membership drift is deliberately unqualified"},
           "actualTrussQualified": False, "actualAshlarQualified": False,
           "authorityLifecycleQualified": False,
           "scope": "Synthetic PostgreSQL raw/graph static RLS and field-projection feasibility only"}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"passed": len(cases), "server": receipt["server"], "receipt": str(out)}))
