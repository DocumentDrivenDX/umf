# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual per-call head probes across supported native drivers and real pools.

Only independent synthetic source is installed. Head observation is not data
admission; no generated data-method, cursor/replay or managed-engine claim.
"""
from __future__ import annotations
import argparse
import asyncio
from contextlib import contextmanager,asynccontextmanager,nullcontext
import hashlib
from importlib.metadata import version
import json
import re
from pathlib import Path
import time

import psycopg
from psycopg import sql
from psycopg.rows import dict_row,tuple_row
from psycopg_pool import ConnectionPool,AsyncConnectionPool
import psycopg2
from psycopg2.extensions import parse_dsn,cursor as cursor2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from sqlalchemy import create_engine,URL
from sqlalchemy.ext.asyncio import create_async_engine
from umf_access.lifecycle import CatalogError,apply_table_migration
from umf_access.unified import (SyncSession,AsyncSession,Psycopg2Session,SQLAlchemySession,AsyncSQLAlchemySession,
    SessionIdentity,SessionPolicy,SessionError,observe_table_head,observe_table_head_async)

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',required=True)
parser.add_argument('--plans',required=True,type=Path)
parser.add_argument('--report',required=True,type=Path)
args=parser.parse_args()
plans=json.loads(args.plans.read_text());initial,forward=plans['initial'],plans['forward']
cfg=initial['next']['configuration'];schema,owner,person,batch=(cfg[k] for k in ('schema','ownerRole','personRole','batchRole'))
assert re.fullmatch(r'p3_[a-f0-9]{12}_schema%?',schema)
alice,bob=owner+'_alice',owner+'_bob'
roles=[owner,person,batch,*cfg['groupRoles'].values(),alice,bob]
policy=SessionPolicy({'alice':alice,'bob':bob},{'job':batch},schema,catalog_only=True)
identities=[SessionIdentity('person','alice'),SessionIdentity('person','bob'),SessionIdentity('batch','job')]
observations=[];leases={}
connection_args=parse_dsn(args.dsn)


def check(name,value):
    assert value,name
    observations.append(name)


def refuses(name,call,reason):
    try:call()
    except (CatalogError,SessionError) as error:check(name,str(error)==reason)
    else:raise AssertionError(name)


def native_row(c,query):
    if isinstance(c,psycopg.Connection):
        with c.cursor(row_factory=tuple_row) as cur:cur.execute(query);return cur.fetchone()
    if hasattr(c,'get_transaction_status'):
        with c.cursor(cursor_factory=cursor2) as cur:cur.execute(query);return cur.fetchone()
    return tuple(c.exec_driver_sql(query).one())


def sync_cases(label,kind,factory,checkout):
    counts={'acquired':0,'released':0};leases[label]=counts
    @contextmanager
    def lease(identity):
        with factory(identity) as c:
            counts['acquired']+=1
            try:yield c
            finally:counts['released']+=1
    session=kind(lease,policy)
    for identity in identities:
        result=observe_table_head(session,identity,forward['next'],reference)
        check(label+'-'+identity.kind+'-'+identity.subject,result['observedPrincipal']==policy.role(identity) and result['headDigest']==reference['headDigest'] and result['lifecycleAdmission'] is False)
    check(label+'-pool-returned-after-success',checkout()==0)
    before=dict(counts)
    refuses(label+'-unknown-person-before-lease',lambda:observe_table_head(session,SessionIdentity('person','missing'),forward['next'],reference),'subject has no grant for this session kind')
    check(label+'-denial-never-acquires',counts==before)
    refuses(label+'-stale-source-rollback',lambda:observe_table_head(session,identities[0],initial['next'],old_reference),'installed-generation-mismatch')
    check(label+'-pool-returned-after-stale',checkout()==0 and counts['acquired']==counts['released'])
    with factory(identities[0]) as c:
        # Start a genuine read-only caller transaction in the driver's own API.
        tx=c.transaction() if isinstance(c,psycopg.Connection) else c.begin() if hasattr(c,'begin') else c
        with tx:
            if isinstance(c,psycopg.Connection):c.execute('SET TRANSACTION READ ONLY')
            elif hasattr(c,'get_transaction_status'):
                with c.cursor() as cur:cur.execute('SET TRANSACTION READ ONLY')
            else:c.exec_driver_sql('SET TRANSACTION READ ONLY')
            before=native_row(c,"SELECT current_user,current_setting('search_path')")
            caller=kind(lambda _:nullcontext(c),policy,transaction_owner='caller')
            result=observe_table_head(caller,identities[0],forward['next'],reference)
            status=int(c.info.transaction_status) if isinstance(c,psycopg.Connection) else c.get_transaction_status() if hasattr(c,'get_transaction_status') else int(c.connection.driver_connection.info.transaction_status) if c.dialect.driver=='psycopg' else c.connection.driver_connection.get_transaction_status()
            check(label+'-caller-remains-active',status==2 and result['observedPrincipal']==alice)
            check(label+'-caller-role-and-settings-restored',native_row(c,"SELECT current_user,current_setting('search_path')")==before)
            if isinstance(c,psycopg.Connection):check(label+'-caller-dict-row-factory-preserved',c.row_factory is dict_row)
            elif hasattr(c,'get_transaction_status'):check(label+'-caller-dict-row-factory-preserved',c.cursor_factory is RealDictCursor)
    check(label+'-all-leases-complete',counts['acquired']==counts['released'] and checkout()==0)


async def async_cases(label,kind,factory,checkout,admin):
    # The synchronous API must also work while a host loop is already running.
    synchronous=SyncSession(lambda _:nullcontext(admin),policy)
    result=observe_table_head(synchronous,identities[0],forward['next'],reference)
    check(label+'-sync-api-inside-running-loop',result['observedPrincipal']==alice and int(admin.info.transaction_status)==0)
    counts={'acquired':0,'released':0,'pids':[]};leases[label]=counts
    @asynccontextmanager
    async def lease(identity):
        async with factory(identity) as c:
            counts['acquired']+=1
            driver=c if isinstance(c,psycopg.AsyncConnection) else c.sync_connection.connection.driver_connection
            counts['pids'].append(driver.info.backend_pid)
            try:yield c
            finally:counts['released']+=1
    session=kind(lease,policy)
    for identity in identities:
        result=await observe_table_head_async(session,identity,forward['next'],reference)
        check(label+'-'+identity.kind+'-'+identity.subject,result['observedPrincipal']==policy.role(identity) and result['headDigest']==reference['headDigest'] and result['lifecycleAdmission'] is False)
    check(label+'-pool-returned-after-success',checkout()==0)
    try:await observe_table_head_async(session,identities[0],initial['next'],old_reference)
    except CatalogError as error:check(label+'-stale-source-rollback',str(error)=='installed-generation-mismatch')
    else:raise AssertionError('async stale accepted')
    check(label+'-pool-returned-after-stale',checkout()==0 and counts['acquired']==counts['released'])
    async with factory(identities[0]) as c:
        native=isinstance(c,psycopg.AsyncConnection)
        async with (c.transaction() if native else c.begin()):
            if native:
                await c.execute('SET TRANSACTION READ ONLY')
                before=await (await c.execute("SELECT current_user AS name,current_setting('search_path') AS path")).fetchone()
            else:
                await c.exec_driver_sql('SET TRANSACTION READ ONLY')
                before=tuple((await c.exec_driver_sql("SELECT current_user,current_setting('search_path')")).one())
            @asynccontextmanager
            async def borrowed(_):yield c
            caller=kind(borrowed,policy,transaction_owner='caller')
            result=await observe_table_head_async(caller,identities[0],forward['next'],reference)
            driver=c if native else c.sync_connection.connection.driver_connection
            check(label+'-caller-remains-active',int(driver.info.transaction_status)==2 and result['observedPrincipal']==alice)
            after=await (await c.execute("SELECT current_user AS name,current_setting('search_path') AS path")).fetchone() if native else tuple((await c.exec_driver_sql("SELECT current_user,current_setting('search_path')")).one())
            check(label+'-caller-restored',after==before)
            if native:check(label+'-caller-dict-row-factory-preserved',c.row_factory is dict_row)
    # Block the actual shared advisory query, not an artificial callback/sleep.
    lock=int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\0'+schema).encode()).digest()[:8],'big',signed=True)
    with admin.transaction():
        admin.execute('SELECT pg_catalog.pg_advisory_xact_lock(%s)',(lock,))
        old_count=counts['acquired']
        task=asyncio.create_task(observe_table_head_async(session,identities[0],forward['next'],reference))
        waiting=False;deadline=time.monotonic()+10
        async with await psycopg.AsyncConnection.connect(args.dsn,autocommit=True) as monitor:
            while time.monotonic()<deadline:
                if counts['acquired']>old_count:
                    row=await (await monitor.execute('SELECT wait_event_type,wait_event FROM pg_catalog.pg_stat_activity WHERE pid=%s',(counts['pids'][-1],))).fetchone()
                    if row==('Lock','advisory'):waiting=True;break
                if task.done():break
                await asyncio.sleep(.01)
        if not waiting:
            if task.done():await task
            else:
                task.cancel()
                try:await task
                except asyncio.CancelledError:pass
        check(label+'-cancellation-observes-real-native-wait',waiting)
        task.cancel();await asyncio.sleep(0);task.cancel()
        try:await task
        except asyncio.CancelledError:check(label+'-repeated-cancellation-propagates',True)
        else:raise AssertionError('cancel did not propagate')
        check(label+'-cancelled-lease-exits-before-return',counts['acquired']==counts['released'] and checkout()==0)
    result=await observe_table_head_async(session,identities[2],forward['next'],reference)
    check(label+'-pool-usable-with-new-batch-identity',result['observedPrincipal']==batch)
    check(label+'-all-leases-complete',counts['acquired']==counts['released'] and checkout()==0)


with psycopg.connect(args.dsn,autocommit=True) as admin:
    created=[];schema_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        for role in (alice,bob):admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(person),sql.Identifier(role)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)));schema_created=True
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)));admin.execute('SET LOCAL search_path=pg_catalog')
            first=apply_table_migration(admin,initial,approved_digest=initial['digest'],expected_head=None,person_roles=(alice,bob));old_reference=first['installationReference']
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)));admin.execute('SET LOCAL search_path=pg_catalog')
            second=apply_table_migration(admin,forward,approved_digest=forward['digest'],expected_head=first['headDigest'],person_roles=(alice,bob));reference=second['installationReference']
        with ConnectionPool(args.dsn,kwargs={'row_factory':dict_row},min_size=1,max_size=1) as pool:
            pool.wait()
            sync_cases('psycopg3',SyncSession,lambda _:pool.connection(),lambda:pool.get_stats()['pool_size']-pool.get_stats()['pool_available'])
        pool2=ThreadedConnectionPool(1,1,args.dsn,cursor_factory=RealDictCursor)
        @contextmanager
        def factory2(_):
            c=pool2.getconn()
            try:yield c
            finally:pool2.putconn(c,close=bool(c.closed))
        try:sync_cases('psycopg2',Psycopg2Session,factory2,lambda:len(pool2._used))
        finally:pool2.closeall()
        for driver in ('psycopg','psycopg2'):
            engine=create_engine(URL.create('postgresql+'+driver),connect_args=connection_args,pool_size=1,max_overflow=0)
            try:sync_cases('sqlalchemy-'+driver,SQLAlchemySession,lambda _:engine.connect(),engine.pool.checkedout)
            finally:engine.dispose()
        async def asynchronous():
            async with AsyncConnectionPool(args.dsn,kwargs={'row_factory':dict_row},min_size=1,max_size=1,open=False) as pool:
                await pool.wait()
                await async_cases('async-psycopg3',AsyncSession,lambda _:pool.connection(),lambda:pool.get_stats()['pool_size']-pool.get_stats()['pool_available'],admin)
            engine=create_async_engine(URL.create('postgresql+psycopg'),connect_args=connection_args,pool_size=1,max_overflow=0)
            try:await async_cases('async-sqlalchemy-psycopg3',AsyncSQLAlchemySession,lambda _:engine.connect(),engine.pool.checkedout,admin)
            finally:await engine.dispose()
        asyncio.run(asynchronous())
        report={'scope':'installed shared native-head observation through per-call session adapters and real pools; no data admission',
            'postgresql':admin.info.server_version,'versions':{p:version(p) for p in ('umf_access','umf_codegen','psycopg','psycopg2-binary','SQLAlchemy','greenlet','psycopg-pool','pydantic')},
            'plansSha256':hashlib.sha256(args.plans.read_bytes()).hexdigest(),'observations':observations,'leases':leases,'lifecycleAdmission':False,
            'unqualified':['live data-operation native admission','generated native table methods','authenticated cursors','durable replay','managed Lakebase','full Praxis release']}
    finally:
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'nativeAssertions':len(observations),'lifecycleAdmission':False}))
