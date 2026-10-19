# SPDX-License-Identifier: MIT OR Apache-2.0
"""Isolated PostgreSQL 18 acceptance gate for per-call Psycopg sessions.

Creates only uniquely named synthetic fixtures. Supply an ephemeral admin DSN,
not an application database. Weft execution below is a bounded fixture executor,
not the production compiler-obligation executor or a qualified action compiler.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from contextlib import asynccontextmanager, contextmanager, nullcontext
from pathlib import Path
from uuid import uuid4

parser = argparse.ArgumentParser()
parser.add_argument('--dsn')
parser.add_argument('--compile-only', action='store_true')
parser.add_argument('--generated', required=True)
parser.add_argument('--weft')
parser.add_argument('--psycopg')
parser.add_argument('--pool')
parser.add_argument('--report', required=True)
args = parser.parse_args()
sys.path[:0] = [args.generated, *[p for p in (args.weft,args.psycopg,args.pool) if p]]

import psycopg
import psycopg_pool
import weft
from psycopg import sql
from shop import Client, Customer, SyncClient
from umf_access.unified import AsyncSession, SessionError, SessionIdentity, SessionPolicy, SyncSession, SyncWeftTableBinding
from umf_access.unified.session_binding import AsyncSessionTransport, SyncSessionTransport

suffix = uuid4().hex[:12]
schema, login, alice_role, bob_role, batch_role = [f'p1_{n}_{suffix}' for n in ('schema','login','alice','bob','batch')]
alice, bob, batch = SessionIdentity('person','alice'), SessionIdentity('person','bob'), SessionIdentity('batch','run')
policy = SessionPolicy({'alice':alice_role,'bob':bob_role}, {'run':batch_role}, schema)
source = (Path(__file__).parent / 'commerce.json').read_text()
digest = hashlib.sha256(source.encode()).hexdigest()
binding = {'version':'umf.raw-read-binding/0.1','schema':None,'modelJson':source,'modelSha256':digest,
           'tables':[{'logical':['example.commerce','Customer'],'native':'customers','key':['customerId'],
                      'columns':[{'logical':name,'native':name,'carrier':carrier,'nullable':False} for name,carrier in
                                 [('customerId','string'),('customerUuid','uuid'),('externalId','bits128'),('customerName','string')]]}],
           'relationships':[]}

if args.compile_only:
    captured = []
    def compile_capture(artifact, request):
        assert artifact['status'] == 'compiled'
        captured.append(artifact)
        return {'schema':digest,'rows':[]}
    client = SyncClient(SyncWeftTableBinding(binding,weft,compile_capture,target='postgresql18'))
    Customer.objects.using(client).all(limit=100)
    assert len(captured) == 1
    result = {'mode':'compiler-only','weft':weft.__version__,'sourceSha256':digest,
              'artifact':captured[0],'nativeExecuted':False}
    Path(args.report).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'mode':'compiler-only','status':'compiled','weft':weft.__version__}))
    sys.exit(0)
if not args.dsn:
    parser.error('--dsn is required for native acceptance')

with psycopg.connect(args.dsn, autocommit=True) as admin:
    server_version=admin.info.server_version
    assert server_version // 10000 == 18
    admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    for role in (login, alice_role, bob_role, batch_role):
        admin.execute(sql.SQL('CREATE ROLE {} NOINHERIT {}').format(sql.Identifier(role), sql.SQL('LOGIN' if role == login else 'NOLOGIN')))
    for role in (alice_role, bob_role, batch_role):
        admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT FALSE, SET TRUE').format(sql.Identifier(role),sql.Identifier(login)))
        admin.execute(sql.SQL('GRANT USAGE ON SCHEMA {} TO {}').format(sql.Identifier(schema),sql.Identifier(role)))
    admin.execute(sql.SQL('CREATE TABLE {}.customers ("customerId" text PRIMARY KEY,"customerUuid" uuid NOT NULL,"externalId" bytea NOT NULL,"customerName" text NOT NULL)').format(sql.Identifier(schema)))
    for key, owner in [('a1',alice_role),('a2',alice_role),('b1',bob_role)]:
        admin.execute(sql.SQL('INSERT INTO {}.customers VALUES (%s,%s,%s,%s)').format(sql.Identifier(schema)),
                      (key, uuid4(), bytes.fromhex('00112233445566778899aabbccddeeff'), owner))
    admin.execute(sql.SQL('ALTER TABLE {}.customers ENABLE ROW LEVEL SECURITY').format(sql.Identifier(schema)))
    admin.execute(sql.SQL('CREATE POLICY person_select ON {}.customers FOR SELECT TO {},{} USING ("customerName" = current_user)').format(sql.Identifier(schema),sql.Identifier(alice_role),sql.Identifier(bob_role)))
    admin.execute(sql.SQL('CREATE POLICY batch_select ON {}.customers FOR SELECT TO {} USING (true)').format(sql.Identifier(schema),sql.Identifier(batch_role)))
    admin.execute(sql.SQL('CREATE POLICY person_update ON {}.customers FOR UPDATE TO {},{} USING ("customerName" = current_user) WITH CHECK ("customerName" = current_user)').format(sql.Identifier(schema),sql.Identifier(alice_role),sql.Identifier(bob_role)))
    for role in (alice_role,bob_role,batch_role):
        admin.execute(sql.SQL('GRANT SELECT ON {}.customers TO {}').format(sql.Identifier(schema),sql.Identifier(role)))
    for role in (alice_role,bob_role):
        admin.execute(sql.SQL('GRANT UPDATE ON {}.customers TO {}').format(sql.Identifier(schema),sql.Identifier(role)))

connection_args = dict(psycopg.conninfo.conninfo_to_dict(args.dsn), user=login)
report = {'serverMajor':18,'serverVersion':server_version,'psycopg':psycopg.__version__,'pool':psycopg_pool.__version__,
          'weft':weft.__version__,'schema':schema,'assertions':[],
          'limits':['fixture-only Weft executor; production catalog/privilege admission remains open',
                    'writes below test session transactions directly, not Weft action compilation']}

def check(name, condition):
    if not condition: raise AssertionError(name)
    report['assertions'].append(name)


def rows(artifact, values):
    output = []
    for row in values:
        converted = {}
        for spec, value in zip(artifact['outputs'], row, strict=True):
            name = spec['name']
            if name == 'customerUuid': value = {'uuid':str(value)}
            if name == 'externalId': value = {'bits128Hex':bytes(value).hex()}
            converted[name] = value
        output.append(converted)
    return {'schema':digest,'rows':output}


def read(connection, artifact, request):
    assert artifact['status'] == 'compiled' and artifact['target'] == 'postgresql18'
    # RawCursor preserves Weft's original $n SQL; no regex rewriting of SQL literals.
    with psycopg.RawCursor(connection) as cursor:
        cursor.execute(artifact['sql'], [request['parameters'][name] for name in artifact['parameterOrder']])
        return rows(artifact, cursor.fetchall())


async def async_read(connection, artifact, request):
    assert artifact['status'] == 'compiled' and artifact['target'] == 'postgresql18'
    async with psycopg.AsyncRawCursor(connection) as cursor:
        await cursor.execute(artifact['sql'], [request['parameters'][name] for name in artifact['parameterOrder']])
        return rows(artifact, await cursor.fetchall())


@contextmanager
def direct(_):
    with psycopg.connect(**connection_args) as connection:
        yield connection


session = SyncSession(direct, policy)
for identity, expected in ((alice,['a1','a2']),(bob,['b1']),(batch,['a1','a2','b1'])):
    client = SyncClient(SyncSessionTransport(session,identity,binding,weft,read,cursor_secret=b'x'*32))
    result = Customer.objects.using(client).all(limit=100)
    check('sync_weft_'+identity.subject, sorted(row.customer_id for row in result) == expected)

with psycopg.connect(**connection_args) as connection:
    session = SyncSession(lambda _:nullcontext(connection),policy)
    initial = connection.execute('SELECT current_user, current_setting(\'search_path\'),current_setting(\'statement_timeout\')').fetchone()
    connection.rollback()
    try:
        with session.open(alice) as leased:
            check('sync_effective_identity',leased.execute('SELECT current_user').fetchone() == (alice_role,))
            leased.execute('UPDATE customers SET "customerName"=%s WHERE "customerId"=%s',(bob_role,'a1'))
    except psycopg.errors.ReadOnlySqlTransaction: pass
    else: raise AssertionError('read lease accepted a write')
    # The escaping read-only failure must roll back before reusing the connection.
    check('sync_idle_after_failed_read',int(connection.info.transaction_status)==0)
    with session.open(alice,read_only=False):
        cursor=connection.execute('UPDATE customers SET "customerName"=%s WHERE "customerId"=%s',(alice_role,'b1'))
        check('sync_rls_foreign_update_zero',cursor.rowcount == 0)
    with connection.transaction():
        connection.execute('SET TRANSACTION READ ONLY')
        before=connection.execute('SELECT current_user, current_setting(\'search_path\'),current_setting(\'statement_timeout\')').fetchone()
        caller = SyncSession(lambda _:nullcontext(connection),policy,transaction_owner='caller')
        with caller.open(bob):
            check('caller_role',connection.execute('SELECT current_user').fetchone() == (bob_role,))
        check('caller_outer_alive',int(connection.info.transaction_status)==2)
        check('caller_settings_restored',connection.execute('SELECT current_user, current_setting(\'search_path\'),current_setting(\'statement_timeout\')').fetchone()==before)
    check('sync_role_settings_reset',connection.execute('SELECT current_user, current_setting(\'search_path\'),current_setting(\'statement_timeout\')').fetchone()==initial)
    connection.rollback()

def observed_uuid():
    with psycopg.connect(args.dsn,autocommit=True) as admin:
        return admin.execute(sql.SQL('SELECT "customerUuid" FROM {}.customers WHERE "customerId"=%s').format(sql.Identifier(schema)),('a1',)).fetchone()[0]

with psycopg.connect(**connection_args) as connection:
    session=SyncSession(lambda _:nullcontext(connection),policy)
    committed=uuid4()
    with session.open(alice,read_only=False):
        connection.execute('UPDATE customers SET "customerUuid"=%s WHERE "customerId"=%s',(committed,'a1'))
    check('sync_owned_write_commits',observed_uuid()==committed)
    try:
        with session.open(alice,read_only=False):
            connection.execute('UPDATE customers SET "customerUuid"=%s WHERE "customerId"=%s',(uuid4(),'a1'))
            raise ValueError('rollback owned write')
    except ValueError:pass
    check('sync_owned_write_rolls_back',observed_uuid()==committed)
    with connection.transaction(force_rollback=True):
        caller=SyncSession(lambda _:nullcontext(connection),policy,transaction_owner='caller')
        with caller.open(alice,read_only=False):
            connection.execute('UPDATE customers SET "customerUuid"=%s WHERE "customerId"=%s',(uuid4(),'a1'))
        check('sync_caller_does_not_commit',observed_uuid()==committed)
        check('sync_caller_owns_outer',int(connection.info.transaction_status)==2)
    check('sync_caller_outer_rollback',observed_uuid()==committed)
    try:
        with session.open(alice):
            connection.execute("SELECT pg_catalog.set_config('statement_timeout','0',true)")
    except SessionError:pass
    else:raise AssertionError('session setting tampering accepted')
    check('sync_tamper_rollback_idle',int(connection.info.transaction_status)==0)
    for identity in (SessionIdentity('batch','alice'),SessionIdentity('person','run')):
        try:
            with session.open(identity):raise AssertionError('unregistered identity acquired')
        except SessionError:pass
    check('explicit_person_batch_registry',True)

with psycopg_pool.ConnectionPool(kwargs=connection_args,min_size=1,max_size=1) as pool:
    session=SyncSession(lambda _:pool.connection(),policy)
    pids=[]
    for identity in (alice,bob,batch):
        with session.open(identity) as connection:
            pids.append(connection.info.backend_pid)
            check('pool_role_'+identity.subject,connection.execute('SELECT current_user').fetchone()==(policy.role(identity),))
    check('pool_reused_backend',len(set(pids))==1)
    with pool.connection() as connection:
        check('pool_role_reset',connection.execute('SELECT current_user').fetchone()==(login,))


async def async_tests():
    connection=await psycopg.AsyncConnection.connect(**connection_args)
    async with connection:
        @asynccontextmanager
        async def borrowed(_):yield connection
        direct=AsyncSession(borrowed,policy)
        committed=uuid4()
        async with direct.open(alice,read_only=False):
            await connection.execute('UPDATE customers SET "customerUuid"=%s WHERE "customerId"=%s',(committed,'a1'))
        check('async_owned_write_commits',observed_uuid()==committed)
        try:
            async with direct.open(alice,read_only=False):
                await connection.execute('UPDATE customers SET "customerUuid"=%s WHERE "customerId"=%s',(uuid4(),'a1'))
                raise ValueError('rollback owned write')
        except ValueError:pass
        check('async_owned_write_rolls_back',observed_uuid()==committed)
        async with connection.transaction(force_rollback=True):
            caller=AsyncSession(borrowed,policy,transaction_owner='caller')
            before=await (await connection.execute("SELECT current_user,current_setting('search_path'),current_setting('statement_timeout')")).fetchone()
            async with caller.open(alice,read_only=False):
                await connection.execute('UPDATE customers SET "customerUuid"=%s WHERE "customerId"=%s',(uuid4(),'a1'))
            check('async_caller_does_not_commit',observed_uuid()==committed)
            check('async_caller_owns_outer',int(connection.info.transaction_status)==2)
            check('async_caller_restores_settings',await (await connection.execute("SELECT current_user,current_setting('search_path'),current_setting('statement_timeout')")).fetchone()==before)
            # Cancellation at a savepoint must preserve the healthy outer transaction.
            started=asyncio.Event()
            async def nested_cancel():
                async with caller.open(bob,read_only=False):
                    started.set()
                    await asyncio.Event().wait()
            task=asyncio.create_task(nested_cancel());await started.wait();task.cancel()
            try:await task
            except asyncio.CancelledError:pass
            else:raise AssertionError('caller cancellation swallowed')
            check('async_caller_cancel_outer_alive',int(connection.info.transaction_status)==2)
            check('async_caller_cancel_role_restored',await (await connection.execute('SELECT current_user')).fetchone()==(login,))
        check('async_caller_outer_rollback',observed_uuid()==committed)
    async with psycopg_pool.AsyncConnectionPool(kwargs=connection_args,min_size=1,max_size=1,open=False) as pool:
        session=AsyncSession(lambda _:pool.connection(),policy)
        for identity,expected in ((alice,['a1','a2']),(bob,['b1']),(batch,['a1','a2','b1'])):
            client=Client(AsyncSessionTransport(session,identity,binding,weft,async_read,cursor_secret=b'x'*32))
            result=await Customer.objects.using(client).all(limit=100)
            check('async_weft_'+identity.subject,sorted(row.customer_id for row in result)==expected)
        started=asyncio.Event()
        backend=[]
        async def sleeping():
            async with session.open(alice) as connection:
                backend.append(connection.info.backend_pid)
                started.set()
                await connection.execute('SELECT pg_catalog.pg_sleep(30)')
        task=asyncio.create_task(sleeping())
        await started.wait()
        # Observe a running native query before cancellation; scheduling a task
        # alone does not establish that PostgreSQL received the statement.
        observer = await psycopg.AsyncConnection.connect(args.dsn,autocommit=True)
        async with observer:
            active=False
            for _ in range(100):
                cursor=await observer.execute("SELECT state='active' AND query LIKE '%%pg_sleep%%' FROM pg_catalog.pg_stat_activity WHERE pid=%s",(backend[0],))
                observed=await cursor.fetchone()
                if observed and observed[0]:
                    active=True
                    break
                await asyncio.sleep(0.05)
            check('cancel_native_query_observed',active)
        task.cancel()
        try: await task
        except asyncio.CancelledError: pass
        else: raise AssertionError('cancellation was swallowed')
        async with pool.connection() as connection:
            check('cancel_pool_idle',int(connection.info.transaction_status)==0)
            check('cancel_pool_role_reset',await (await connection.execute('SELECT current_user')).fetchone()==(login,))
            check('cancel_pool_backend_reused',connection.info.backend_pid==backend[0])
            check('cancel_pool_query_usable',await (await connection.execute('SELECT 1')).fetchone()==(1,))
        dead=None
        try:
            async with session.open(alice) as connection:
                dead=connection.info.backend_pid
                admin=await psycopg.AsyncConnection.connect(args.dsn,autocommit=True)
                async with admin:await admin.execute('SELECT pg_catalog.pg_terminate_backend(%s)',(dead,))
                await connection.execute('SELECT 1')
        except psycopg.Error:pass
        else:raise AssertionError('terminated backend reused')
        async with session.open(bob) as connection:
            check('broken_pool_connection_discarded',connection.info.backend_pid!=dead)
            check('replacement_pool_identity',await (await connection.execute('SELECT current_user')).fetchone()==(bob_role,))


asyncio.run(async_tests())
Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
