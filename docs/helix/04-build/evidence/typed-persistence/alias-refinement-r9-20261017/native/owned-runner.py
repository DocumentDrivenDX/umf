import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

name = sys.argv[1]
assert re.fullmatch('[a-z0-9-]+', name)
root = pathlib.Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
out = pathlib.Path('/private/tmp/sdk-refinement-' + name)
out.mkdir()
(out / 'socket').mkdir()
fixture = out / 'fixture'
shutil.copytree('/private/tmp/sdk-r9-refinement-native-prepared', fixture)
shutil.copyfile(__file__, out / 'owned-runner.py')
script = root / 'python/umf_access/tests/refinement_native_e2e.py'
start = hashlib.sha256(script.read_bytes()).hexdigest()
shutil.copyfile(script,out/'frozen-harness.py')
pg = pathlib.Path('/opt/homebrew/opt/postgresql@18/bin')
checks = []
started = False

def run(label, args, env=None):
    with (out / (label + '.log')).open('w') as log:
        result = subprocess.run(list(map(str, args)), cwd=root,
            env={**os.environ, **(env or {})}, stdout=log, stderr=subprocess.STDOUT)
    checks.append({'name': label, 'command': list(map(str, args)), 'exitCode': result.returncode})
    if result.returncode:
        raise RuntimeError(label + ' failed; see retained log')

try:
    run('init', [pg/'initdb', '-D', out/'data', '-A', 'trust', '-U', 'sdk_test', '--no-sync'])
    run('start', [pg/'pg_ctl', '-D', out/'data', '-l', out/'server.log', '-o',
        f"-F -k {out/'socket'} -c listen_addresses='' -p 55497", '-w', 'start'])
    started = True
    run('role', [pg/'psql', '-h', out/'socket', '-p', '55497', '-U', 'sdk_test', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE ROLE alias_user LOGIN; GRANT CREATE ON DATABASE postgres TO alias_user'])
    run('campaign', [sys.executable, '-I', '-B', script, fixture],
        {'UMF_PG_TEST_DSN': f"host={out/'socket'} port=55497 dbname=postgres user=alias_user"})
finally:
    if started:
        run('stop', [pg/'pg_ctl', '-D', out/'data', '-m', 'fast', '-w', 'stop'])
    end = hashlib.sha256(script.read_bytes()).hexdigest()
    (out/'result.json').write_text(json.dumps({'checks': checks,
        'serverStopped': not (out/'data/postmaster.pid').exists(),
        'harnessStartSha256': start, 'harnessEndSha256': end,
        'unchangedHarness': start == end, 'temporal': 'HELD', 'scope': 'real installed generated aliases and ancestor refinement on PostgreSQL18'}, indent=2) + '\n')
    assert start == end, 'harness changed during run'
print(json.dumps(checks))
