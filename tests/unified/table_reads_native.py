# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent synthetic PG18 acceptance for SDK-owned declared read execution.

The source fixture is shared with Weft's public operation compiler corpus. No
Praxis source, declarations, data or SQL are included in this fixture.
"""
from __future__ import annotations
import argparse
import asyncio
import copy
import hashlib
from contextlib import contextmanager, asynccontextmanager
import json
from pathlib import Path
import uuid
import time

import psycopg
from psycopg import sql
from psycopg_pool import ConnectionPool, AsyncConnectionPool
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extensions import parse_dsn
from sqlalchemy import create_engine, URL
from sqlalchemy.ext.asyncio import create_async_engine
from umf_codegen import compile_table_deployment, compile_table_migration
from umf_access.lifecycle import apply_table_migration
from umf_access.unified import (SyncTableReader, AsyncTableReader, SyncSession, AsyncSession,
    Psycopg2Session, SQLAlchemySession, AsyncSQLAlchemySession, SessionIdentity, SessionPolicy, SessionError)

parser = argparse.ArgumentParser()
parser.add_argument('--dsn', required=True)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
source = json.loads(Path(__file__).with_name('table-operation-model.json').read_text())
module = source['modules'][0]; content = {'module':'demo','element':'content'}
module['elements'].insert(2, {'id':'content','kind':'field','scalarType':'string','cardinality':'one',
                            'nullability':'absent-allowed','extensions':{}})
module['elements'][3]['members'].append(content)
payload = module['extensions']['umf.tables']
payload['tables'][0]['columns'].append({'field':content,'name':'content','nativeType':{'kind':'text'}})
commands = payload['commands']
for command in commands:
    if command['id'] == 'read_page': command['body']['maxRows'] = 1
    if command['id'] == 'read_many': command['body']['maxRows'] = 2
for name, fields in [('read_hidden_order',[content]), ('read_content',[content])]:
    declaration = copy.deepcopy(commands[0]); declaration['id'] = name
    declaration['body'].update(fields=fields,maxRows=10)
    commands.append(declaration)
all_count = copy.deepcopy(next(c for c in commands if c['id']=='read_count'))
all_count.update(id='read_all_count',parameters=[])
all_count['body']['where']={'op':'all'}
commands.append(all_count)
prefix = 'p5_'+uuid.uuid4().hex[:12]+'_'
cfg = {'module':'demo','schema':prefix+'schema%','ownerRole':prefix+'owner',
       'personRole':prefix+'person','batchRole':prefix+'batch','groupRoles':{}}
alice, bob = prefix+'alice', prefix+'bob'
roles = [cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],alice,bob]
policy = SessionPolicy({'alice':alice,'bob':bob},{'job':cfg['batchRole']},cfg['schema'],catalog_only=True)
a, b, job = SessionIdentity('person','alice'), SessionIdentity('person','bob'), SessionIdentity('batch','job')
compiled = compile_table_deployment(text=json.dumps(source,separators=(',',':')),configuration=cfg)
assert compiled['status'] == 'compiled', compiled
bundle = compiled['bundle']
planned = compile_table_migration(migration_id='001',predecessor=None,previous_bundle=None,next_bundle=bundle)
assert planned['status'] == 'compiled', planned
plan = planned['plan']
binding = {'version':'umf.raw-read-binding/0.1','schema':cfg['schema'],
    'modelJson':bundle['source']['utf8'],'modelSha256':bundle['sourceDigest'],
    'tables':[{'logical':['demo','Note'],'native':'notes','key':['id'],
               'columns':[{'logical':name,'native':name,'carrier':'string','nullable':name=='content'}
                          for name in ('id','owner','content')]}], 'relationships':[],
    'nativeLifecycle':{'version':'umf.table-lifecycle/0.1','module':'demo',
        'configurationDigest':bundle['configurationDigest'],'deploymentDigest':bundle['bundleDigest']}}
observations = []; leases = {}; secret = b'independent synthetic test secret 000000'


def check(name, condition):
    assert condition, name
    observations.append(name)


def inputs(role): return {'owner':{'string':role}}


def reader(kind, session): return kind(session,bundle,reference,binding,cursor_secret=secret)


def refused(name, call, message=None):
    try: call()
    except SessionError as error:
        check(name, message is None or str(error) == message)
    else: raise AssertionError(name)


def sync_cases(label, factory, adapter):
    session = adapter(factory,policy)
    r = reader(SyncTableReader,session)
    first = r.read(a,'read_page',inputs(alice))
    check(label+'-first-page', first['rows'] == [{'id':'a1','owner':alice}] and first['cursor'] is not None)
    second = r.read(a,'read_page',inputs(alice),cursor=first['cursor'])
    check(label+'-second-page', second['rows'] == [{'id':'a2','owner':alice}] and second['cursor'] is None)
    check(label+'-native-person-rls', r.read(b,'read_many',inputs(alice))['rows'] == [])
    check(label+'-batch-grant', r.read(job,'read_count',inputs(alice))['count'] == {'integerToken':'2'})
    check(label+'-empty-parameter-tuple', r.read(job,'read_all_count',{})['count'] == {'integerToken':'3'})
    check(label+'-single-row', r.read(b,'read_one',inputs(bob))['rows'] == [{'id':'b1','owner':bob}])
    check(label+'-optional-absent', r.read(b,'read_optional',inputs(alice))['rows'] == [])
    refused(label+'-required-absent', lambda:r.read(b,'read_one',inputs(alice)), 'required row not found')
    refused(label+'-single-row-overflow', lambda:r.read(a,'read_one',inputs(alice)), 'native single-row cardinality exceeded')
    refused(label+'-many-lookahead-overflow', lambda:r.read(a,'read_many',inputs(alice),size=1), 'native result row bound exceeded')
    check(label+'-hidden-sort-not-returned', r.read(a,'read_hidden_order',inputs(alice))['rows'] == [{'content':'a1'},{'content':'a2'}])
    before = leases[label]['acquired']
    for suffix, identity, name, params, token in [
        ('person',b,'read_page',inputs(alice),first['cursor']),
        ('batch',job,'read_page',inputs(alice),first['cursor']),
        ('inputs',a,'read_page',inputs(bob),first['cursor']),
        ('operation',a,'read_many',inputs(alice),first['cursor']),
        ('tamper',a,'read_page',inputs(alice),first['cursor'][:-1]+('1' if first['cursor'][-1]!='1' else '2'))]:
        refused(label+'-cursor-'+suffix, lambda:r.read(identity,name,params,cursor=token))
    refused(label+'-raw-sql-refused',lambda:r.read(a,'SELECT arbitrary',{}))
    refused(label+'-write-gated',lambda:r.read(a,'create',{}),'writes require the durable outcome executor')
    check(label+'-invalid-call-no-lease',leases[label]['acquired'] == before)
    with factory(a) as c:
        native = isinstance(c,psycopg.Connection)
        p2 = hasattr(c,'get_transaction_status')
        if native: tx = c.transaction()
        elif p2:
            @contextmanager
            def p2tx():
                c.autocommit=False
                try: yield
                finally: c.rollback();c.autocommit=True
            tx = p2tx()
        else: tx = c.begin()
        with tx:
            if native:
                c.execute('SET TRANSACTION READ ONLY')
                before_role = c.execute('SELECT current_user').fetchone()
            elif p2:
                with c.cursor() as cur:
                    cur.execute('SET TRANSACTION READ ONLY');cur.execute('SELECT current_user');before_role=cur.fetchone()
            else:
                c.exec_driver_sql('SET TRANSACTION READ ONLY')
                before_role=tuple(c.exec_driver_sql('SELECT current_user').one())
            @contextmanager
            def borrowed(_): yield c
            borrowed_reader = reader(SyncTableReader,adapter(borrowed,policy,transaction_owner='caller'))
            check(label+'-caller-read',borrowed_reader.read(a,'read_count',inputs(alice))['count']=={'integerToken':'2'})
            refused(label+'-caller-failure',lambda:borrowed_reader.read(a,'read_one',inputs(alice)))
            if native: after_role = c.execute('SELECT current_user').fetchone(); active=int(c.info.transaction_status)==2
            elif p2:
                with c.cursor() as cur:cur.execute('SELECT current_user');after_role=cur.fetchone()
                active=c.get_transaction_status()==2
            else:after_role=tuple(c.exec_driver_sql('SELECT current_user').one());active=c.in_transaction()
            check(label+'-caller-owned-healthy-and-restored',active and after_role==before_role)
    check(label+'-leases-balanced',leases[label]['acquired']==leases[label]['released'])


async def async_cases(label, factory, adapter):
    r=reader(AsyncTableReader,adapter(factory,policy))
    first=await r.read(a,'read_page',inputs(alice))
    second=await r.read(a,'read_page',inputs(alice),cursor=first['cursor'])
    check(label+'-pages',first['rows'][0]['id']=='a1' and second['rows'][0]['id']=='a2' and second['cursor'] is None)
    check(label+'-person-rls',(await r.read(b,'read_many',inputs(alice)))['rows']==[])
    check(label+'-batch',(await r.read(job,'read_count',inputs(alice)))['count']=={'integerToken':'2'})
    check(label+'-empty-parameter-tuple',(await r.read(job,'read_all_count',{}))['count']=={'integerToken':'3'})
    try: await r.read(a,'read_one',inputs(alice))
    except SessionError as error:check(label+'-cardinality-rollback',str(error)=='native single-row cardinality exceeded')
    else:raise AssertionError(label)
    check(label+'-usable-after-failure',(await r.read(b,'read_one',inputs(bob)))['rows'][0]['id']=='b1')
    async with factory(a) as c:
        native = isinstance(c,psycopg.AsyncConnection)
        async with (c.transaction() if native else c.begin()):
            if native:
                await c.execute('SET TRANSACTION READ ONLY')
                before=await (await c.execute('SELECT current_user')).fetchone()
            else:
                await c.exec_driver_sql('SET TRANSACTION READ ONLY')
                before=tuple((await c.exec_driver_sql('SELECT current_user')).one())
            @asynccontextmanager
            async def borrowed(_):yield c
            caller=reader(AsyncTableReader,adapter(borrowed,policy,transaction_owner='caller'))
            check(label+'-caller-owned-read',(await caller.read(a,'read_count',inputs(alice)))['count']=={'integerToken':'2'})
            try:await caller.read(a,'read_one',inputs(alice))
            except SessionError:pass
            else:raise AssertionError('caller cardinality accepted')
            if native:
                after=await (await c.execute('SELECT current_user')).fetchone()
                active=int(c.info.transaction_status)==2
            else:
                after=tuple((await c.exec_driver_sql('SELECT current_user')).one());active=c.in_transaction()
            check(label+'-caller-owned-failure-restores',active and before==after)
    lock=int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\0'+cfg['schema']).encode()).digest()[:8],'big',signed=True)
    for stage in ('advisory','relation'):
        with admin.transaction():
            if stage=='advisory':admin.execute('SELECT pg_catalog.pg_advisory_xact_lock(%s)',(lock,))
            else:admin.execute(sql.SQL('LOCK TABLE {} IN ACCESS EXCLUSIVE MODE').format(sql.Identifier(cfg['schema'],'notes')))
            previous=leases[label]['acquired']
            task=asyncio.create_task(r.read(a,'read_page',inputs(alice)))
            waiting=False
            try:
                async with await psycopg.AsyncConnection.connect(args.dsn,autocommit=True) as monitor:
                    deadline=time.monotonic()+15
                    while time.monotonic()<deadline:
                        if leases[label]['acquired']>previous:
                            row=await (await monitor.execute('SELECT wait_event_type,wait_event,query FROM pg_catalog.pg_stat_activity WHERE pid=%s',(leases[label]['pid'],))).fetchone()
                            if row and row[:2]==('Lock',stage):
                                waiting=True
                                leases[label][stage+'CancellationPhase']='read-statement' if row[2].startswith('WITH umf_read AS MATERIALIZED') else 'admission'
                                break
                        if task.done():await task;break
                        await asyncio.sleep(.01)
                check(label+'-actual-native-'+stage+'-wait',waiting)
            finally:
                task.cancel();await asyncio.sleep(0);task.cancel()
                try:await task
                except asyncio.CancelledError:check(label+'-repeated-'+stage+'-cancellation-propagates',True)
        check(label+'-usable-after-'+stage+'-cancellation',(await r.read(job,'read_all_count',{}))['count']=={'integerToken':'3'})
    check(label+'-leases-balanced',leases[label]['acquired']==leases[label]['released'])


async def run_async():
    async with AsyncConnectionPool(args.dsn,min_size=1,max_size=1,open=False) as pool:
        await pool.wait()
        label='psycopg3-async';leases[label]={'acquired':0,'released':0}
        @asynccontextmanager
        async def factory(_):
            async with pool.connection() as c:
                leases[label]['acquired']+=1
                leases[label]['pid']=c.info.backend_pid
                try:yield c
                finally:leases[label]['released']+=1
        await async_cases(label,factory,AsyncSession)
    engine=create_async_engine(URL.create('postgresql+psycopg',query=parse_dsn(args.dsn)),pool_size=1,max_overflow=0)
    try:
        label='sqlalchemy-async';leases[label]={'acquired':0,'released':0}
        @asynccontextmanager
        async def factory(_):
            async with engine.connect() as c:
                leases[label]['acquired']+=1
                leases[label]['pid']=c.sync_connection.connection.driver_connection.info.backend_pid
                try:yield c
                finally:leases[label]['released']+=1
        await async_cases(label,factory,AsyncSQLAlchemySession)
    finally:await engine.dispose()


with psycopg.connect(args.dsn,autocommit=True) as admin:
    created=[];schema_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        for role in (alice,bob):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(role)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])));schema_created=True
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
            admin.execute('SET LOCAL search_path=pg_catalog')
            installed=apply_table_migration(admin,plan,approved_digest=plan['digest'],expected_head=None,person_roles=(alice,bob))
        reference=installed['installationReference']
        bound_table=sql.SQL(sql.Identifier(cfg['schema'],'notes').as_string(admin).replace('%','%%'))
        for key,role in [('a2',alice),('a1',alice),('b1',bob)]:
            admin.execute(sql.SQL('INSERT INTO {} (id,owner,content) VALUES (%s,%s,%s)').format(bound_table),(key,role,key))
        with ConnectionPool(args.dsn,min_size=1,max_size=1) as pool:
            pool.wait();label='psycopg3';leases[label]={'acquired':0,'released':0}
            @contextmanager
            def factory(_):
                with pool.connection() as c:
                    leases[label]['acquired']+=1
                    try:yield c
                    finally:leases[label]['released']+=1
            sync_cases(label,factory,SyncSession)
        pool2=ThreadedConnectionPool(1,1,args.dsn)
        try:
            label='psycopg2';leases[label]={'acquired':0,'released':0}
            @contextmanager
            def factory(_):
                c=pool2.getconn();leases[label]['acquired']+=1
                try:yield c
                finally:pool2.putconn(c);leases[label]['released']+=1
            sync_cases(label,factory,Psycopg2Session)
        finally:pool2.closeall()
        for driver in ('psycopg','psycopg2'):
            engine=create_engine(URL.create('postgresql+'+driver,query=parse_dsn(args.dsn)),pool_size=1,max_overflow=0)
            try:
                label='sqlalchemy-'+driver;leases[label]={'acquired':0,'released':0}
                @contextmanager
                def factory(_):
                    with engine.connect() as c:
                        leases[label]['acquired']+=1
                        try:yield c
                        finally:leases[label]['released']+=1
                sync_cases(label,factory,SQLAlchemySession)
            finally:engine.dispose()
        asyncio.run(run_async())
        with psycopg.connect(args.dsn,autocommit=True) as c:
            @contextmanager
            def direct(_):yield c
            r=reader(SyncTableReader,SyncSession(direct,policy))
            first=r.read(a,'read_page',inputs(alice))
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT FALSE,SET FALSE').format(sql.Identifier(bob),sql.Identifier(alice)))
            refused('member-closure-change-refuses-cursor',lambda:r.read(a,'read_page',inputs(alice),cursor=first['cursor']),'cursor authority changed')
            admin.execute(sql.SQL('REVOKE {} FROM {}').format(sql.Identifier(bob),sql.Identifier(alice)))
            admin.execute(sql.SQL('UPDATE {} SET content=repeat(%s,9437184) WHERE id=%s').format(bound_table),('x','a1'))
            size=admin.execute(sql.SQL('SELECT pg_column_size(content),octet_length(content) FROM {} WHERE id=%s').format(bound_table),('a1',)).fetchone()
            check('oversize-fixture-is-actually-compressed',size[0]<8388608 and size[1]>8388608)
            refused('compressed-oversize-frame-is-atomic-refusal',lambda:r.read(a,'read_content',inputs(alice)))
            check('oversize-refusal-restores-session',r.read(b,'read_count',inputs(bob))['count']=={'integerToken':'1'})
        report={'postgresql':admin.info.server_version,'sourceDigest':bundle['sourceDigest'],'observations':observations,
                'leases':leases,'scope':'SDK-owned declared reads; six native driver/pool configurations',
                'remaining':['durable write outcomes','generated native module methods','remaining lifecycle codecs and evolution','private Praxis and managed Lakebase acceptance','prerelease publication']}
    finally:
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
        for role in reversed(created):admin.execute(sql.SQL('DROP OWNED BY {}').format(sql.Identifier(role)))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'assertions':len(observations),'leases':leases}))
