import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import psycopg

repo = Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
out = Path(sys.argv[1]); out.mkdir(); (out/'socket').mkdir()
fixture = out/'fixture'
shutil.copytree('/private/tmp/sdk-r12-relationship-native-prepared', fixture)
script = repo/'python/umf_access/tests/relationship_native_e2e.py'
frozen = out/'frozen-harness.py'; shutil.copyfile(script, frozen)
shutil.copyfile(__file__, out/'owned-runner.py')
pg = Path('/opt/homebrew/opt/postgresql@18/bin')
started = False; checks=[]
def run(label, command, env=None):
    with (out/(label+'.log')).open('w') as log:
        result = subprocess.run(list(map(str,command)),cwd=repo,
            env={**os.environ,**(env or {})},stdout=log,stderr=subprocess.STDOUT)
    checks.append({'name':label,'command':list(map(str,command)),'exitCode':result.returncode})
    if result.returncode: raise RuntimeError(label+' failed; retained log')
try:
    run('init',[pg/'initdb','-D',out/'data','-A','trust','-U','sdk_admin','--no-sync'])
    run('start',[pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',
        f"-F -k {out/'socket'} -c listen_addresses='' -p 55497",'-w','start'])
    started=True
    dsn=f"host={out/'socket'} port=55497 dbname=postgres"
    with psycopg.connect(dsn,user='sdk_admin',autocommit=True) as admin:
        admin.execute('CREATE ROLE relationship_reader LOGIN NOSUPERUSER NOBYPASSRLS')
        admin.execute('GRANT CREATE ON DATABASE postgres TO relationship_reader')
    run('campaign',[sys.executable,'-I','-B',frozen,fixture],
        {'UMF_PG_TEST_DSN':dsn+' user=relationship_reader'})
finally:
    if started:run('stop',[pg/'pg_ctl','-D',out/'data','-m','fast','-w','stop'])
    (out/'result.json').write_text(json.dumps({'checks':checks,
        'serverStopped':not(out/'data/postmaster.pid').exists(),
        'frozenHarnessSha256':hashlib.sha256(frozen.read_bytes()).hexdigest(),
        'temporal':'HELD'},indent=2)+'\n')
print(json.dumps(checks))
