"""Independent mock-only cleanup boundary controls; never invokes Docker."""
import hashlib
import json
import pathlib
import subprocess
import sys
import types
import uuid

ROOT = pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf')
OUT = pathlib.Path('/private/tmp/umf-retirement-first-astra-20261015')
SOURCE = ROOT / 'tools/security/pg-retirement-first-probe.py'
source_bytes = SOURCE.read_bytes()
source_sha = hashlib.sha256(source_bytes).hexdigest()
run_id = uuid.UUID('a2fdde19-f281-4bc0-86bd-7756ec472171')
name = 'umf-retirement-first-' + str(run_id)
original_run = subprocess.run
original_uuid = uuid.uuid4
original_psycopg = sys.modules.get('psycopg')
results = []

def control(case, expected_error, expected_removed):
    calls = []
    removed = []

    def completed(args, stdout='', code=0, stderr=''):
        return subprocess.CompletedProcess(args, code, stdout=stdout, stderr=stderr)

    def fake_run(args, **kwargs):
        calls.append(list(args))
        if args[:3] == ['docker', 'container', 'ls']:
            fmt = args[args.index('--format') + 1]
            if fmt == '{{.Names}}':
                return completed(args, name if case == 'preexisting-name' else '')
            if fmt == '{{.ID}} {{.Names}}':
                if case == 'unresolved-creation':
                    return completed(args, 'sibling-id ' + name + '-sibling')
                if case == 'ambiguous-creation':
                    return completed(args, 'owned-id ' + name + '\nsecond-id ' + name)
                return completed(args, 'owned-id ' + name + '\nsibling-id ' + name + '-sibling')
            if fmt == '{{.ID}}' and '--filter' in args:
                assert args[args.index('--filter') + 1] == 'label=umf.security.run=' + str(run_id)
                return completed(args, '')
        if args[:3] == ['docker', 'run', '-d']:
            assert args[args.index('--name') + 1] == name
            assert args[args.index('--label') + 1] == 'umf.security.run=' + str(run_id)
            if case == 'nonzero-after-creation':
                return completed(args, code=1, stderr='simulated Docker client failure')
            raise subprocess.TimeoutExpired(args, 20)
        if args[:2] == ['docker', 'inspect']:
            assert args[-1] == 'owned-id'
            return completed(args, 'different-owner' if case == 'ownership-mismatch' else str(run_id))
        if args[:3] == ['docker', 'rm', '-f']:
            assert args[-1] == 'owned-id'
            removed.append(args[-1])
            return completed(args, 'owned-id')
        raise AssertionError('Unexpected subprocess call: ' + repr(args))

    subprocess.run = fake_run
    uuid.uuid4 = lambda: run_id
    sys.modules['psycopg'] = types.SimpleNamespace(__version__='mock-only')
    try:
        exec(compile(source_bytes, str(SOURCE), 'exec'), {'__name__': 'independent_cleanup_fault_control'})
        raise AssertionError('Fault path unexpectedly succeeded')
    except Exception as error:
        error_kind = type(error).__name__
        error_message = str(error)
        if expected_error not in error_message and expected_error != error_kind:
            raise AssertionError((case, expected_error, error_kind, error_message)) from error
    finally:
        subprocess.run = original_run
        uuid.uuid4 = original_uuid
        if original_psycopg is None:
            sys.modules.pop('psycopg', None)
        else:
            sys.modules['psycopg'] = original_psycopg
    assert bool(removed) is expected_removed, (case, removed)
    if case == 'preexisting-name':
        assert len(calls) == 1 and not any(c[1] == 'run' for c in calls)
    results.append({'id': case, 'passed': True, 'expectedCleanup': expected_removed,
                    'observedRemovedIds': removed, 'errorType': error_kind,
                    'error': error_message, 'calls': calls})

control('timeout-after-creation', 'TimeoutExpired', True)
control('nonzero-after-creation', 'simulated Docker client failure', True)
control('ownership-mismatch', 'Fixture ownership changed', False)
control('preexisting-name', 'Preexisting fixture refused', False)
control('unresolved-creation', 'Unresolved fixture creation outcome', False)
control('ambiguous-creation', 'Ambiguous owned fixture creation outcome', False)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_sha
report = {'status': 'passed', 'nativeExecution': False, 'sourceSha256': source_sha,
          'coverage': 'Mocked subprocess outcomes only; no daemon/crash recovery claim.',
          'results': results}
(OUT / 'cleanup-controls.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': 'passed', 'controls': len(results), 'sourceSha256': source_sha}))
