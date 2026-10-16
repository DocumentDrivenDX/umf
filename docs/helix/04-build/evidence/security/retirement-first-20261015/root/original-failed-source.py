"""Native retirement-first ordering component, not backend acceptance.
@covers US-057-AC2
@covers US-057-AC3
@covers US-057-AC7
Run from the UMF repository with psycopg 3; uses an owned disposable PG17.9.
"""
import concurrent.futures, hashlib, json, os, secrets, subprocess, time, uuid
from pathlib import Path
import psycopg

ROOT = Path.cwd()
SELF = 'tools/security/pg-retirement-first-probe.py'
OUT = ROOT / 'docs/helix/04-build/evidence/security/pg-retirement-first-component.json'
paths = [SELF, 'tests/security/native/pg-raw-membership.sql',
         'tests/security/native/pg-raw-drain.sql',
         'tests/security/native/pg-raw-persistent-drain.sql',
         'tests/security/native/pg-raw-persistent-drain-oracle.json']
sha = lambda b: hashlib.sha256(b).hexdigest()
sources = {p: sha((ROOT / p).read_bytes()) for p in paths}
original = (ROOT / paths[3]).read_text()
start = original.index('CREATE FUNCTION security_drain.read_enrolled(')
end = original.index('REVOKE ALL ON FUNCTION security_drain.read_enrolled(', start)
read_definition = original[start:end].replace('CREATE FUNCTION ', 'CREATE OR REPLACE FUNCTION ', 1)
claim_start = read_definition.index(' UPDATE security_drain.publisher p SET state=')
claim_end = read_definition.index(' RETURN QUERY ', claim_start)
unsafe_definition = read_definition[:claim_start] + ' -- Deliberately unsafe: no lease claim or terminal-state check.\n' + read_definition[claim_end:]
assert unsafe_definition != read_definition
run_id = str(uuid.uuid4())
name = 'umf-retirement-first-' + run_id
container = None
observations = []
passwords = {actor: secrets.token_hex(32) for actor in ['postgres', 'umf_sec_alice', 'umf_sec_revoker', 'umf_sec_issuer']}
connections = []

def command(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, timeout=kw.pop('timeout', 20), **kw)

def require(result):
    if result.returncode:
        raise RuntimeError('Owned fixture command failed: ' + result.stderr[:1000])
    return result.stdout.strip()

def install(source):
    return require(command(['docker', 'exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], input=source))

def check(identity, expected, observed):
    record = json.loads(json.dumps({'id': identity, 'expected': expected, 'observed': observed}))
    if type(expected) is not type(observed) or expected != observed:
        raise AssertionError(identity)
    if any(item['id'] == identity for item in observations):
        raise AssertionError('Duplicate observation')
    observations.append(record)

def connect(actor, autocommit=True):
    connection = psycopg.connect(host='127.0.0.1', port=port, dbname='postgres', user=actor,
        password=passwords[actor], autocommit=autocommit, connect_timeout=5,
        options='-c statement_timeout=7000 -c lock_timeout=6000')
    connections.append(connection)
    return connection

def scalar(connection, sql, parameters=()):
    return connection.execute(sql, parameters).fetchone()[0]

receipt = None
try:
    if name in require(command(['docker', 'container', 'ls', '-a', '--format', '{{.Names}}'])).splitlines():
        raise RuntimeError('Preexisting fixture refused')
    container = require(command(['docker', 'run', '-d', '--name', name, '--label', 'umf.security.run=' + run_id,
        '--publish', '127.0.0.1::5432', '-e', 'POSTGRES_HOST_AUTH_METHOD=scram-sha-256',
        '-e', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',
        '-e', 'POSTGRES_PASSWORD', 'postgres:17.9'], env={**os.environ, 'POSTGRES_PASSWORD': passwords['postgres']}))
    deadline = time.monotonic() + 25
    while command(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).returncode:
        if time.monotonic() > deadline:
            raise TimeoutError('Readiness deadline')
        time.sleep(.1)
    for path in paths[1:4]:
        install((ROOT / path).read_text())
    for actor, password in passwords.items():
        install("ALTER ROLE " + actor + " PASSWORD '" + password + "';")
    endpoint = json.loads(require(command(['docker', 'inspect', container])))[0]
    ports = endpoint['NetworkSettings']['Ports']['5432/tcp']
    if len(ports) != 1 or ports[0]['HostIp'] != '127.0.0.1':
        raise RuntimeError('Owned loopback endpoint required')
    port = int(ports[0]['HostPort'])
    assessor = connect('postgres')
    check('engine', '170009', scalar(assessor, "SELECT current_setting('server_version_num')"))
    authentication = scalar(assessor, "SELECT jsonb_agg(jsonb_build_object('type',type,'method',auth_method,'error',error) ORDER BY rule_number) FROM pg_hba_file_rules WHERE type LIKE 'host%'")
    check('host-scram-only', True, bool(authentication) and all(r['type']=='host' and r['method']=='scram-sha-256' and r['error'] is None for r in authentication))
    issuer = connect('umf_sec_issuer', False)
    reader = connect('umf_sec_alice')
    for actor, connection in [('reader', reader), ('issuer', issuer)]:
        check(actor + ':ordinary-role', [False, False], list(connection.execute('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=session_user').fetchone()))
    issuer.commit()
    reader_pid = reader.info.backend_pid
    issuer_pid = issuer.info.backend_pid
    check('independent-native-connections', True, len({reader_pid, issuer_pid, assessor.info.backend_pid}) == 3)
    binding = assessor.execute('SELECT usename,backend_start FROM pg_stat_activity WHERE pid=%s', (reader_pid,)).fetchone()
    expected_ids = ['RA', 'RAB']
    schedules = []
    for label, commit, unsafe in [('retirement-commit', True, False), ('retirement-rollback', False, False), ('unsafe-claim-omitted', True, True)]:
        token = uuid.uuid4()
        issuer.execute('SELECT security_drain.enroll_publisher(%s,%s,%s,%s)', (token, binding[0], reader_pid, binding[1]))
        issuer.commit()
        rows = reader.execute('SELECT * FROM security_drain.read_enrolled(%s)', (token,)).fetchall()
        check(label + ':initial-authorized-ids', expected_ids, [r[0] for r in rows])
        check(label + ':durable-pending', 'pending', scalar(assessor, 'SELECT state FROM security_drain.publisher WHERE id=%s', (token,)))
        # The complete result is drained before the issuer attempts retirement.
        if unsafe:
            install(unsafe_definition)
        check(label + ':issuer-retirement-result', 'retired', scalar(issuer, 'SELECT security_drain.retire_publisher(%s)', (token,)))
        # Issuer has no table privilege: assess uncommitted retirement by routine
        # result plus native exclusive lock; a separate snapshot still sees pending.
        check(label + ':not-committed', 'pending', scalar(assessor, 'SELECT state FROM security_drain.publisher WHERE id=%s', (token,)))
        def attempt():
            try:
                return {'kind': 'rows', 'ids': [r[0] for r in reader.execute('SELECT * FROM security_drain.read_enrolled(%s)', (token,)).fetchall()]}
            except psycopg.Error as error:
                return {'kind': 'refused', 'sqlstate': error.sqlstate, 'message': error.diag.message_primary}
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = pool.submit(attempt)
        try:
            deadline = time.monotonic() + 5
            barrier = None
            while time.monotonic() < deadline:
                barrier = scalar(assessor, "SELECT jsonb_build_object('waitType',wait_event_type,'waitEvent',wait_event,'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=%s", (reader_pid,))
                if barrier and barrier['waitType'] == 'Lock' and barrier['waitEvent'] == 'advisory' and issuer_pid in barrier['blockers']:
                    break
                if future.done():
                    raise AssertionError('Reader did not wait behind retirement')
                time.sleep(.01)
            check(label + ':exact-native-wait', True, bool(barrier) and barrier['waitType']=='Lock' and barrier['waitEvent']=='advisory' and issuer_pid in barrier['blockers'])
            check(label + ':no-early-outcome', False, future.done())
            locks = assessor.execute("SELECT pid,mode,granted FROM pg_locks WHERE locktype='advisory' AND objid=10070019 ORDER BY pid,mode").fetchall()
            check(label + ':exclusive-retirement-holder', True, (issuer_pid, 'ExclusiveLock', True) in locks)
            check(label + ':shared-reader-waiter', True, (reader_pid, 'ShareLock', False) in locks)
            issuer.commit() if commit else issuer.rollback()
            outcome = future.result(timeout=10)
            expected = {'kind':'rows','ids':expected_ids} if unsafe else {'kind':'refused','sqlstate':'42501','message':'Publisher custody unavailable'}
            check(label + ':after-release', expected, outcome)
            check(label + ':durable-state', 'released' if commit else 'pending', scalar(assessor, 'SELECT state FROM security_drain.publisher WHERE id=%s', (token,)))
            check(label + ':same-reader-recovery', reader_pid, scalar(reader, 'SELECT pg_backend_pid()'))
            schedules.append({'id':label,'barrier':barrier,'locks':[list(r) for r in locks],'outcome':outcome})
        finally:
            issuer.rollback()
            pool.shutdown(wait=True)
            if unsafe:
                install(read_definition)
    check('restored-definition', read_definition.replace('CREATE OR REPLACE FUNCTION ', 'CREATE FUNCTION ',1).split('AS $$',1)[1].split('$$;',1)[0], scalar(assessor, "SELECT prosrc FROM pg_proc WHERE oid='security_drain.read_enrolled(uuid)'::regprocedure"))
    check('sources-stable', sources, {p:sha((ROOT / p).read_bytes()) for p in paths})
    receipt = {'status':'passed','runId':run_id,'sourceDigests':sources,'observations':observations,'schedules':schedules,
        'versions':{'postgresql':scalar(assessor,'SELECT version()'),'psycopg':psycopg.__version__},
        'imageId':endpoint['Image'],'hostAuthentication':authentication,
        'safeReadDefinitionSha256':sha(read_definition.encode()),'unsafeReadDefinitionSha256':sha(unsafe_definition.encode()),
        'acceptanceCasesPromoted':[], 'nativeImplementationQualified':False,
        'scope':'Fixed PG17.9 read-committed raw component. Original ordinary reader and trusted ordinary issuer use separate TCP/SCRAM psycopg sessions. Independent native lock barriers establish retirement-first ordering. Committed retirement refuses a second read without a result; rolled-back retirement also refuses reuse of the still-pending token. Deliberately omitting the claim admits known authorized rows after terminal retirement, demonstrating the control. Installer/assessor and mutation are excluded test authority. Initial result drain is synchronous fetch completion, not public final transport acknowledgment. Does not qualify the public pg-runtime decoder, authenticated host enrollment/retirement service, complete writer closure, source admission, arbitrary statement schedules, graph/Delta or L03 acceptance.'}
finally:
    for connection in reversed(connections):
        connection.close()
    if container:
        if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container])) != run_id:
            raise RuntimeError('Fixture ownership changed')
        require(command(['docker','rm','-f',container]))
if receipt is None:
    raise RuntimeError('Missing receipt')
OUT.write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({'status':'passed','observations':len(observations),'schedules':len(schedules)}))
