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
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import uuid
import time
import sys
import tempfile
import importlib
from datetime import date
from decimal import Decimal

import psycopg
from psycopg import sql
from psycopg_pool import ConnectionPool, AsyncConnectionPool
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extensions import parse_dsn
from sqlalchemy import create_engine, URL
from sqlalchemy.ext.asyncio import create_async_engine
from umf_codegen import compile_table_deployment, compile_table_migration, generate_python_client
from umf_access.lifecycle import apply_table_migration
from umf_access.lifecycle import prepare_table_correspondence, inspect_table_history, read_table_head
from umf_access.unified import (SyncTableReader, AsyncTableReader, SyncSession, AsyncSession,
    Psycopg2Session, SQLAlchemySession, AsyncSQLAlchemySession, SessionIdentity, SessionPolicy, SessionError,
    SyncTableWriter, AsyncTableWriter, WriteOutcomeUnknown, SyncNativeTableBinding, NativeTableBinding)
from umf_access.unified.outcome_values import outcome_slot
from umf_access.unified.operation_values import native_arguments

parser = argparse.ArgumentParser()
parser.add_argument('--dsn', required=True)
parser.add_argument('--report', required=True, type=Path)
parser.add_argument('--mutations',action='store_true')
parser.add_argument('--generated',action='store_true')
parser.add_argument('--temporal',action='store_true')
parser.add_argument('--domains',action='store_true')
parser.add_argument('--source',type=Path)
args = parser.parse_args()
if args.domains:args.temporal=True
if args.temporal:args.generated=True;args.mutations=True
source = json.loads((args.source or Path(__file__).with_name('table-operation-model.json')).read_text())
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
if args.mutations:
    for command in ('insert','update','delete'):
        payload['tables'][0]['policy']['batch'][command]={'kind':'allow'}
    bounded=copy.deepcopy(next(c for c in commands if c['id']=='remove'))
    bounded.update(id='remove_all_bounded',parameters=[])
    bounded['body'].update(where={'op':'all'},maxRows=1)
    commands.append(bounded)
    returning=copy.deepcopy(next(c for c in commands if c['id']=='rename'))
    returning['id']='return_large'
    returning['body']['returning']=[content]
    commands.append(returning)
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
               'columns':[{'logical':name,'native':name,'carrier':next(e['scalarType'] for e in module['elements'] if e['id']==name),'nullable':name=='content'}
                          for name in [column['field']['element'] for column in payload['tables'][0]['columns']]]}], 'relationships':[],
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


def write_inputs(key,role):return {'id':{'string':key},'owner':{'string':role}}


def write_sync_cases(label,factory,adapter):
    session=adapter(factory,policy)
    w=SyncTableWriter(session,bundle,reference,binding,outcome_secret=secret)
    key=label+'-create';data=write_inputs(key,alice)
    result=w.write(a,'create',data,key=key)
    check(label+'-native-write',result['status']=='applied' and result['durability']=='committed'
          and result['result']['items']==[{'affectedCount':{'integerToken':'1'},'rows':[{'id':key,'owner':alice}]}])
    replay=w.write(a,'create',data,key=key)
    check(label+'-repeat-recovers-without-reinsert',replay['status']=='recovered' and 'result' not in replay
          and replay['receipt']==result['receipt'])
    check(label+'-observe-committed',w.observe(a,'create',data,key=key)['receipt']==result['receipt'])
    refused(label+'-changed-inputs-refuse',lambda:w.write(a,'create',write_inputs(key+'changed',alice),key=key))
    rotated=SyncTableWriter(session,bundle,reference,binding,outcome_secret=b'z'*32)
    refused(label+'-rotated-verifier-cannot-miss-occupied-slot',lambda:rotated.write(a,'create',data,key=key))
    check(label+'-wrong-person-cannot-observe',w.observe(b,'create',data,key=key)['status']=='not-observed')
    foreign=write_inputs(label+'-foreign',bob)
    refused(label+'-person-rls-write-denial',lambda:w.write(a,'create',foreign,key='foreign-'+key))
    check(label+'-failed-write-has-no-receipt',w.observe(a,'create',foreign,key='foreign-'+key)['status']=='not-observed')
    check(label+'-batch-role-write',w.write(job,'create',write_inputs(label+'-batch',bob),key='batch-'+key)['receipt']['effects']==[{'integerToken':'1'}])
    mixed=[write_inputs(label+'-mixed-own',alice),write_inputs(label+'-mixed-foreign',bob)]
    refused(label+'-mixed-person-batch-rolls-back',lambda:w.write_batch(a,'create_batch',mixed,key='mixed-'+key))
    check(label+'-failed-batch-has-no-receipt',w.observe_batch(a,'create_batch',mixed,key='mixed-'+key)['status']=='not-observed')
    batch=[write_inputs(label+'-bulk1',alice),write_inputs(label+'-bulk2',bob)]
    first=w.write_batch(job,'create_batch',batch,key='bulk-'+key)
    check(label+'-atomic-batch',first['receipt']['effects']==[{'integerToken':'1'},{'integerToken':'1'}])
    check(label+'-batch-replay',w.write_batch(job,'create_batch',batch,key='bulk-'+key)['status']=='recovered')
    check(label+'-upsert-ignore',w.write(a,'put_ignore',data,key='ignore-'+key)['receipt']['effects']==[{'integerToken':'0'}])
    check(label+'-upsert-update',w.write(a,'put_update',data,key='update-'+key)['receipt']['effects']==[{'integerToken':'1'}])
    refused(label+'-effect-bound-rolls-back',lambda:w.write(a,'remove_all_bounded',{},key='bound-'+key))
    check(label+'-bound-failure-has-no-receipt',w.observe(a,'remove_all_bounded',{},key='bound-'+key)['status']=='not-observed')
    deleted=w.write(a,'remove',{'id':{'string':key}},key='delete-'+key)
    check(label+'-native-delete-count-without-invented-business-rows',deleted['receipt']['effects']==[{'integerToken':'1'}]
          and deleted['result']['items']==[{'affectedCount':{'integerToken':'1'},'rows':[]}])
    check(label+'-deleted-row-recovery-retains-no-business-data',w.observe(a,'create',data,key=key)['status']=='recovered' and key not in canonical_receipt(result))
    write_sync_caller(label,factory,adapter,w)
    check(label+'-all-mutation-leases-returned',leases[label]['acquired']==leases[label]['released'])


def canonical_receipt(response):return json.dumps(response['receipt'],sort_keys=True)


@contextmanager
def rollback_caller(c):
    if isinstance(c,psycopg.Connection):
        with c.transaction(force_rollback=True):
            c.execute('SELECT current_user')
            yield
    elif hasattr(c,'get_transaction_status'):
        original=c.autocommit;c.autocommit=False
        try:
            with c.cursor() as cur:cur.execute('SELECT current_user')
            yield
        finally:c.rollback();c.autocommit=original
    else:
        tx=c.begin()
        try:
            c.exec_driver_sql('SELECT current_user')
            yield
        finally:tx.rollback()


def write_sync_caller(label,factory,adapter,w):
    key=label+'-caller';data=write_inputs(key,alice)
    with factory(a) as c,rollback_caller(c):
        @contextmanager
        def borrowed(_):yield c
        caller=SyncTableWriter(adapter(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,outcome_secret=secret)
        result=caller.write(a,'create',data,key=key)
        check(label+'-caller-write-pending',result['durability']=='pending-caller-commit')
        check(label+'-caller-observation-is-pending',caller.observe(a,'create',data,key=key)['durability']=='pending-caller-commit')
    check(label+'-caller-rollback-removes-receipt',w.observe(a,'create',data,key=key)['status']=='not-observed')


async def write_async_cases(label,factory,adapter):
    w=AsyncTableWriter(adapter(factory,policy),bundle,reference,binding,outcome_secret=secret)
    key=label+'-create';data=write_inputs(key,alice)
    first=await w.write(a,'create',data,key=key)
    check(label+'-async-native-write',first['status']=='applied' and first['receipt']['effects']==[{'integerToken':'1'}])
    check(label+'-async-replay',(await w.write(a,'create',data,key=key))['status']=='recovered')
    check(label+'-async-observe',(await w.observe(a,'create',data,key=key))['receipt']==first['receipt'])
    batch=[write_inputs(label+'-bulk1',alice),write_inputs(label+'-bulk2',bob)]
    check(label+'-async-batch',(await w.write_batch(job,'create_batch',batch,key='bulk-'+key))['receipt']['effects']==[{'integerToken':'1'},{'integerToken':'1'}])
    check(label+'-async-batch-observe',(await w.observe_batch(job,'create_batch',batch,key='bulk-'+key))['status']=='recovered')
    try:await w.write(a,'create',write_inputs(label+'-foreign',bob),key='foreign-'+key)
    except SessionError:check(label+'-async-person-rls-denial',True)
    else:raise AssertionError('person foreign write accepted')
    check(label+'-async-failed-receipt-absent',(await w.observe(a,'create',write_inputs(label+'-foreign',bob),key='foreign-'+key))['status']=='not-observed')
    pending=write_inputs(label+'-caller',alice)
    async with factory(a) as c:
        native=isinstance(c,psycopg.AsyncConnection)
        @asynccontextmanager
        async def borrowed(_):yield c
        caller=AsyncTableWriter(adapter(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,outcome_secret=secret)
        tx=c.transaction(force_rollback=True) if native else c.begin()
        async with tx:
            if native:await c.execute('SELECT current_user')
            else:await c.exec_driver_sql('SELECT current_user')
            check(label+'-async-caller-pending',(await caller.write(a,'create',pending,key=label+'-caller'))['durability']=='pending-caller-commit')
            check(label+'-async-caller-observation-pending',(await caller.observe(a,'create',pending,key=label+'-caller'))['durability']=='pending-caller-commit')
            if not native:await tx.rollback()
    check(label+'-async-caller-rollback-removes-receipt',(await w.observe(a,'create',pending,key=label+'-caller'))['status']=='not-observed')
    await write_cancellation_cases(label,w)
    await write_boundary_cancellation_cases(label,factory,adapter,w)
    check(label+'-async-pool-cleanup',leases[label]['acquired']==leases[label]['released'])


async def write_cancellation_cases(label,w):
    principal=admin.execute('SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(alice,)).fetchone()[0]
    probe=prepare_table_correspondence(bundle,reference,principal_role=alice,audience='person')
    for stage in ('outcome-slot','mutation'):
        key=label+'-cancel-'+stage
        operation='create' if stage=='outcome-slot' else 'rename'
        data=write_inputs(key,alice) if stage=='outcome-slot' else write_inputs('a1',alice)
        with admin.transaction():
            if stage=='outcome-slot':
                lock=next(probe.outcome_steps('lock',principal,outcome_slot(a,principal,cfg,operation,key)))
                admin.execute(lock.statement,lock.parameters)
            else:admin.execute(sql.SQL('SELECT id FROM {} WHERE id=%s FOR UPDATE').format(bound_table),('a1',))
            previous=leases[label]['acquired']
            task=asyncio.create_task(w.write(a,operation,data,key=key));waiting=False
            try:
                async with await psycopg.AsyncConnection.connect(args.dsn,autocommit=True) as monitor:
                    deadline=time.monotonic()+15
                    while time.monotonic()<deadline:
                        if leases[label]['acquired']>previous:
                            row=await (await monitor.execute('SELECT wait_event_type,wait_event,query FROM pg_catalog.pg_stat_activity WHERE pid=%s',(leases[label]['pid'],))).fetchone()
                            if row and row[:2]==('Lock','advisory' if stage=='outcome-slot' else 'transactionid'):
                                waiting=('pg_advisory_xact_lock(' in row[2]) if stage=='outcome-slot' else row[2].startswith('WITH umf_effects AS')
                                if waiting:break
                        if task.done():await task;break
                        await asyncio.sleep(.01)
                check(label+'-actual-'+stage+'-cancellation-wait',waiting)
            finally:
                task.cancel();await asyncio.sleep(0);task.cancel()
                try:await task
                except asyncio.CancelledError:check(label+'-repeated-'+stage+'-cancel-propagates',True)
        check(label+'-cancelled-'+stage+'-leaves-no-receipt',(await w.observe(a,operation,data,key=key))['status']=='not-observed')


async def write_boundary_cancellation_cases(label,factory,adapter,w):
    reached=asyncio.Event();release=asyncio.Event()
    class Cursor:
        def __init__(self,inner):self.inner=inner;self.statement=''
        def __getattr__(self,name):return getattr(self.inner,name)
        async def __aenter__(self):await self.inner.__aenter__();return self
        async def __aexit__(self,*args):return await self.inner.__aexit__(*args)
        async def execute(self,statement,parameters=None):
            self.statement=statement
            return await self.inner.execute(statement,parameters)
        async def fetchall(self):
            rows=await self.inner.fetchall()
            if self.statement.startswith('WITH umf_effects AS'):
                reached.set();await release.wait()
            return rows
    class Paused(adapter):
        def _control_cursor(self,connection):return Cursor(super()._control_cursor(connection))
    paused=AsyncTableWriter(Paused(factory,policy),bundle,reference,binding,outcome_secret=secret)
    key=label+'-after-effect';data=write_inputs(key,alice)
    task=asyncio.create_task(paused.write(a,'create',data,key=key))
    try:
        await asyncio.wait_for(reached.wait(),15)
        row=admin.execute('SELECT backend_xid IS NOT NULL FROM pg_catalog.pg_stat_activity WHERE pid=%s',(leases[label]['pid'],)).fetchone()
        check(label+'-native-effect-precedes-injected-cancel-boundary',row==(True,))
    finally:
        task.cancel();await asyncio.sleep(0);task.cancel();release.set()
        try:await task
        except asyncio.CancelledError:check(label+'-after-effect-cancellation-propagates',True)
    check(label+'-after-effect-cancel-rolls-back-row-and-receipt',(await w.observe(a,'create',data,key=key))['status']=='not-observed'
          and admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE id=%s').format(bound_table),(key,)).fetchone()==(0,))
    committed=asyncio.Event();lease_release=asyncio.Event()
    @asynccontextmanager
    async def delayed(identity):
        async with factory(identity) as c:
            yield c
            committed.set();await lease_release.wait()
    delayed_writer=AsyncTableWriter(adapter(delayed,policy),bundle,reference,binding,outcome_secret=secret)
    key=label+'-after-commit';data=write_inputs(key,alice)
    task=asyncio.create_task(delayed_writer.write(a,'create',data,key=key))
    try:
        await asyncio.wait_for(committed.wait(),15)
        check(label+'-actual-commit-precedes-injected-lease-cancel',admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE id=%s').format(bound_table),(key,)).fetchone()==(1,))
    finally:
        task.cancel();await asyncio.sleep(0);task.cancel();lease_release.set()
        try:await task
        except asyncio.CancelledError:check(label+'-post-commit-cancellation-propagates',True)
    check(label+'-cancel-is-not-a-rollback-promise',(await w.observe(a,'create',data,key=key))['status']=='recovered')


def write_fault_cases():
    @contextmanager
    def fresh(_):
        with psycopg.connect(args.dsn,autocommit=True) as c:yield c
    w=SyncTableWriter(SyncSession(fresh,policy),bundle,reference,binding,outcome_secret=secret)
    pending=write_inputs('caller-pending',alice)
    with admin.transaction(force_rollback=True):
        @contextmanager
        def borrowed(_):yield admin
        caller=SyncTableWriter(SyncSession(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,outcome_secret=secret)
        value=caller.write(a,'create',pending,key='caller-pending')
        check('caller-write-remains-pending',value['durability']=='pending-caller-commit')
        check('caller-can-observe-pending-without-claiming-durability',caller.observe(a,'create',pending,key='caller-pending')['durability']=='pending-caller-commit')
    check('outer-rollback-discards-effect-and-receipt',w.observe(a,'create',pending,key='caller-pending')['status']=='not-observed'
          and admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE id=%s').format(bound_table),('caller-pending',)).fetchone()==(0,))
    @contextmanager
    def lost(_):
        with psycopg.connect(args.dsn,autocommit=True) as c:
            yield c
            raise RuntimeError('synthetic post-commit lease response fault')
    losing=SyncTableWriter(SyncSession(lost,policy),bundle,reference,binding,outcome_secret=secret)
    data=write_inputs('lost-response',alice)
    try:losing.write(a,'create',data,key='lost-response')
    except WriteOutcomeUnknown as error:check('lost-post-commit-response-is-explicit',error.key=='lost-response')
    else:raise AssertionError('lost commit response not reported')
    check('fresh-observation-recovers-actual-committed-outcome',w.observe(a,'create',data,key='lost-response')['status']=='recovered')
    check('explicit-repeat-does-not-reinsert',w.write(a,'create',data,key='lost-response')['status']=='recovered')
    principal=admin.execute('SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(alice,)).fetchone()[0]
    probe=prepare_table_correspondence(bundle,reference,principal_role=alice,audience='person')
    slot=outcome_slot(a,principal,cfg,'create','concurrent')
    lock=next(probe.outcome_steps('lock',principal,slot))
    pids=[]
    @contextmanager
    def concurrent_factory(_):
        with psycopg.connect(args.dsn,autocommit=True) as c:
            pids.append(c.info.backend_pid)
            yield c
    concurrent=SyncTableWriter(SyncSession(concurrent_factory,policy),bundle,reference,binding,outcome_secret=secret)
    executor=ThreadPoolExecutor(max_workers=2)
    futures=[]
    try:
        with admin.transaction():
            admin.execute(lock.statement,lock.parameters)
            futures=[executor.submit(concurrent.write,a,'create',write_inputs('concurrent',alice),key='concurrent') for _ in range(2)]
            with psycopg.connect(args.dsn,autocommit=True) as monitor:
                deadline=time.monotonic()+20;waiting=False
                while time.monotonic()<deadline:
                    if any(f.done() for f in futures):
                        for f in futures:
                            if f.done():f.result()
                    if len(pids)==2:
                        waits=monitor.execute('SELECT wait_event_type,wait_event,query FROM pg_catalog.pg_stat_activity WHERE pid=ANY(%s)',(pids,)).fetchall()
                        waiting=len(waits)==2 and all(row[:2]==('Lock','advisory') and 'pg_advisory_xact_lock(' in row[2] for row in waits)
                        if waiting:break
                    time.sleep(.01)
                check('two-native-attempts-contend-on-exact-outcome-slot',waiting)
        responses=[f.result(timeout=30) for f in futures]
    finally:executor.shutdown(wait=True,cancel_futures=True)
    check('concurrent-attempts-have-one-applied-and-one-recovered-outcome',sorted(r['status'] for r in responses)==['applied','recovered'] and responses[0]['receipt']==responses[1]['receipt'])
    check('concurrent-attempts-insert-exactly-one-business-row',admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE id=%s').format(bound_table),('concurrent',)).fetchone()==(1,))
    outcome_table=sql.SQL(sql.Identifier(cfg['schema'],'umf_lifecycle_outcomes').as_string(admin).replace('%','%%'))
    poisoned='poisoned-slot';poison_slot=outcome_slot(a,principal,cfg,'create',poisoned)
    with admin.transaction():
        admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(alice)))
        admin.execute(sql.SQL('INSERT INTO {} VALUES (%s,%s,%s,%s,%s,%s)').format(outcome_table),
                      (principal,poison_slot,'0'*64,'0'*64,'{}','0'*64))
    refused('forged-own-principal-receipt-refuses-before-mutation',lambda:w.write(a,'create',write_inputs(poisoned,alice),key=poisoned),'stored outcome cannot be authenticated')
    check('forged-receipt-cannot-cause-business-effect',admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE id=%s').format(bound_table),(poisoned,)).fetchone()==(0,))
    try:
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(bob)))
            admin.execute(sql.SQL('INSERT INTO {} VALUES (%s,%s,%s,%s,%s,%s)').format(outcome_table),
                          (principal,'f'*64,'0'*64,'0'*64,'{}','0'*64))
    except psycopg.errors.InsufficientPrivilege:check('outcome-rls-refuses-forged-other-principal',True)
    else:raise AssertionError('foreign receipt accepted')
    with admin.transaction():
        admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(bob)))
        check('outcome-rls-hides-other-principal',admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE principal_oid=%s').format(outcome_table),(principal,)).fetchone()==(0,))
    admin.execute(sql.SQL('UPDATE {} SET content=repeat(%s,9437184) WHERE id=%s').format(bound_table),('x','a1'))
    large={'id':{'string':'a1'},'owner':{'string':bob}}
    program=w._write_prepare(job,'return_large',large,'large-frame',None)[1]
    try:
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['batchRole'])))
            admin.execute(program['dbapiSql'],native_arguments(program)).fetchall()
    except psycopg.errors.DivisionByZero:check('native-returning-byte-guard-has-declared-sqlstate',True)
    else:raise AssertionError('oversize mutation frame accepted')
    refused('sdk-oversize-returning-frame-rolls-back',lambda:w.write(job,'return_large',large,key='large-frame'))
    check('oversize-frame-retains-old-owner-and-no-receipt',admin.execute(sql.SQL('SELECT owner FROM {} WHERE id=%s').format(bound_table),('a1',)).fetchone()==(alice,)
          and w.observe(job,'return_large',large,key='large-frame')['status']=='not-observed')
    drift_cases=[
        ('rls',sql.SQL('ALTER TABLE {} DISABLE ROW LEVEL SECURITY').format(outcome_table),sql.SQL('ALTER TABLE {} ENABLE ROW LEVEL SECURITY').format(outcome_table)),
        ('column',sql.SQL('ALTER TABLE {} ADD COLUMN untrusted text').format(outcome_table),sql.SQL('ALTER TABLE {} DROP COLUMN untrusted').format(outcome_table)),
        ('grant',sql.SQL('GRANT UPDATE ON TABLE {} TO {}').format(outcome_table,sql.Identifier(cfg['personRole'])),sql.SQL('REVOKE UPDATE ON TABLE {} FROM {}').format(outcome_table,sql.Identifier(cfg['personRole']))),
    ]
    for label,alter,restore in drift_cases:
        # These statements have no parameters: retain literal schema percents.
        alter=sql.SQL(alter.as_string(admin).replace('%%','%'))
        restore=sql.SQL(restore.as_string(admin).replace('%%','%'))
        admin.execute(alter)
        try:refused('changed-outcome-'+label+'-refuses-before-recovery',lambda:w.observe(a,'create',data,key='lost-response'))
        finally:admin.execute(restore)
    check('restored-outcome-shape-recovers-again',w.observe(a,'create',data,key='lost-response')['status']=='recovered')
    with admin.transaction(force_rollback=True):
        admin.execute(sql.SQL('DROP TABLE {}').format(sql.Identifier(cfg['schema'],'umf_lifecycle_outcomes')))
        admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
        admin.execute('SET LOCAL search_path=pg_catalog')
        legacy=inspect_table_history(admin,bundle,person_roles=(alice,bob))['installationReference']
        check('legacy-outcome-free-installation-retains-v1-reference',legacy['version']=='umf.table-installation/0.1' and 'outcomeShape' not in legacy)
        check('legacy-v1-head-remains-observable',read_table_head(admin,bundle,legacy)['headDigest']==reference['headDigest'])
        acquired=[]
        @contextmanager
        def forbidden(_):acquired.append(True);yield admin
        old_writer=SyncTableWriter(SyncSession(forbidden,policy),bundle,legacy,binding,outcome_secret=secret)
        refused('legacy-v1-write-requires-explicit-storage-upgrade',lambda:old_writer.write(a,'create',write_inputs('legacy-write',alice),key='legacy-write'))
        check('legacy-write-refusal-acquires-no-lease',not acquired)


if args.generated:
    generated_dir=tempfile.TemporaryDirectory(prefix='umf-generated-native-')
    generated=generate_python_client(text=bundle['source']['utf8'],package='native_demo')
    for file in generated['files']:
        path=Path(generated_dir.name)/file['path'];path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(file['text'])
    sys.path.insert(0,generated_dir.name)
    client_module=importlib.import_module('native_demo')


def generated_sync_cases(label,factory,adapter):
    host=SyncNativeTableBinding(adapter(factory,policy),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
    client=client_module.SyncClient(host.for_identity(a)).modules.demo
    foreign=client_module.SyncClient(host.for_identity(b)).modules.demo
    batch=client_module.SyncClient(host.for_identity(job)).modules.demo
    first=client.read_page(owner=alice)
    check(label+'-generated-page',first.items[0].id=='a1' and first.next_cursor is not None)
    check(label+'-generated-page-next',client.read_page(owner=alice,cursor=first.next_cursor).items[0].id=='a2')
    check(label+'-generated-rls',foreign.read_many(owner=alice)==())
    check(label+'-generated-count',batch.read_count(owner=alice)>=2)
    check(label+'-generated-optional',foreign.read_optional(owner=alice) is None)
    before=leases[label]['acquired']
    try:client.read_many(owner=1)
    except (TypeError,ValueError):check(label+'-generated-invalid-before-lease',leases[label]['acquired']==before)
    else:raise AssertionError('wrong typed argument accepted')
    key=label+'-generated'
    applied=client.create(id=key,owner=alice,idempotency_key=key)
    check(label+'-generated-write',isinstance(applied,client_module.Applied) and applied.items[0].rows[0].id==key and applied.durability=='committed')
    check(label+'-generated-replay',isinstance(client.create(id=key,owner=alice,idempotency_key=key),client_module.Recovered))
    check(label+'-generated-observe',client.create_observe(id=key,owner=alice,idempotency_key=key).receipt==applied.receipt)
    check(label+'-generated-foreign-observe',isinstance(foreign.create_observe(id=key,owner=alice,idempotency_key=key),client_module.NotObserved))
    items=(client_module.DemoCreateBatchInput(id=key+'-1',owner=alice),client_module.DemoCreateBatchInput(id=key+'-2',owner=bob))
    check(label+'-generated-batch',batch.create_batch_batch(items=items,idempotency_key=key+'-bulk').receipt.effects==(1,1))
    check(label+'-generated-upsert',client.put_ignore(id=key,owner=alice,idempotency_key=key+'-ignore').receipt.effects==(0,))
    with factory(a) as c,rollback_caller(c):
        @contextmanager
        def borrowed(_):yield c
        caller_host=SyncNativeTableBinding(adapter(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
        caller=client_module.SyncClient(caller_host.for_identity(a)).modules.demo
        check(label+'-generated-caller-pending',caller.create(id=key+'-caller',owner=alice,idempotency_key=key+'-caller').durability=='pending-caller-commit')
    check(label+'-generated-caller-rollback',isinstance(client.create_observe(id=key+'-caller',owner=alice,idempotency_key=key+'-caller'),client_module.NotObserved))
    check(label+'-generated-cleanup',leases[label]['acquired']==leases[label]['released'])


async def generated_async_cases(label,factory,adapter):
    host=NativeTableBinding(adapter(factory,policy),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
    client=client_module.Client(host.for_identity(a)).modules.demo
    foreign=client_module.Client(host.for_identity(b)).modules.demo
    batch=client_module.Client(host.for_identity(job)).modules.demo
    check(label+'-generated-async-rls',await foreign.read_optional(owner=alice) is None)
    key=label+'-generated'
    applied=await client.create(id=key,owner=alice,idempotency_key=key)
    check(label+'-generated-async-write',isinstance(applied,client_module.Applied) and applied.items[0].rows[0].id==key)
    check(label+'-generated-async-recovery',isinstance(await client.create(id=key,owner=alice,idempotency_key=key),client_module.Recovered))
    items=(client_module.DemoCreateBatchInput(id=key+'-1',owner=alice),client_module.DemoCreateBatchInput(id=key+'-2',owner=bob))
    check(label+'-generated-async-batch',(await batch.create_batch_batch(items=items,idempotency_key=key+'-bulk')).receipt.effects==(1,1))
    async with factory(a) as c:
        native=isinstance(c,psycopg.AsyncConnection)
        @asynccontextmanager
        async def borrowed(_):yield c
        caller_host=NativeTableBinding(adapter(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
        caller=client_module.Client(caller_host.for_identity(a)).modules.demo
        tx=c.transaction(force_rollback=True) if native else c.begin()
        async with tx:
            if native:await c.execute('SELECT current_user')
            else:await c.exec_driver_sql('SELECT current_user')
            check(label+'-generated-async-caller-pending',(await caller.create(id=key+'-caller',owner=alice,idempotency_key=key+'-caller')).durability=='pending-caller-commit')
            if not native:await tx.rollback()
    check(label+'-generated-async-caller-rollback',isinstance(await client.create_observe(id=key+'-caller',owner=alice,idempotency_key=key+'-caller'),client_module.NotObserved))
    lock=int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\0'+cfg['schema']).encode()).digest()[:8],'big',signed=True)
    with admin.transaction():
        admin.execute('SELECT pg_catalog.pg_advisory_xact_lock(%s)',(lock,))
        before=leases[label]['acquired']
        task=asyncio.create_task(client.read_page(owner=alice))
        waiting=False
        try:
            async with await psycopg.AsyncConnection.connect(args.dsn,autocommit=True) as monitor:
                deadline=time.monotonic()+15
                while time.monotonic()<deadline:
                    if leases[label]['acquired']>before:
                        row=await (await monitor.execute('SELECT wait_event_type,wait_event FROM pg_catalog.pg_stat_activity WHERE pid=%s',(leases[label]['pid'],))).fetchone()
                        if row==('Lock','advisory'):waiting=True;break
                    if task.done():await task;break
                    await asyncio.sleep(.01)
            check(label+'-generated-actual-wait',waiting)
        finally:
            task.cancel();await asyncio.sleep(0);task.cancel()
            try:await task
            except asyncio.CancelledError:check(label+'-generated-cancel-propagates',True)
    check(label+'-generated-usable-after-cancel',await batch.read_all_count()>0)
    check(label+'-generated-async-cleanup',leases[label]['acquired']==leases[label]['released'])



def temporal_params(key,role):
    return {'id':key,'owner':role,'day':date(1,1,1),
            'at':client_module.ExactTimestamp('2026-01-01T00:30:00.123456000+01:00'),'amount':Decimal('12.30'),
            **({'status':'draft','rank':2,'active':True,'tag':'é😀'} if args.domains else {})}


def temporal_sync_cases(label,factory,adapter):
    with factory(a) as c:
        statement="SELECT pg_catalog.set_config('DateStyle','SQL, DMY',false),pg_catalog.set_config('TimeZone','Pacific/Kiritimati',false)"
        if isinstance(c,psycopg.Connection):c.execute(statement);c.commit()
        elif hasattr(c,'get_transaction_status'):
            with c.cursor() as cursor:cursor.execute(statement)
            c.commit()
        else:c.exec_driver_sql(statement);c.commit()
    host=SyncNativeTableBinding(adapter(factory,policy),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
    client=client_module.SyncClient(host.for_identity(a)).modules.demo
    batch=client_module.SyncClient(host.for_identity(job)).modules.demo
    key=label+'-temporal';params=temporal_params(key,alice)
    result=client.create(**params,idempotency_key=key)
    row=result.items[0].rows[0]
    check(label+'-temporal-exact-read-write',row.day==date(1,1,1) and row.at.text=='2025-12-31T23:30:00.123456Z' and row.amount==Decimal('12.30'))
    clock={k:v for k,v in params.items() if k!='at'};clock['id']=key+'-clock'
    check(label+'-temporal-source-clock-default',client.create_clock(**clock,idempotency_key=key+'-clock').items[0].rows[0].at.text.endswith('Z'))
    check(label+'-temporal-instant-predicate',any(row.id==key for row in client.read_before(at=client_module.ExactTimestamp('2026-01-01T00:00:00Z'))))
    check(label+'-temporal-date-predicate',any(row.id==key for row in client.read_on_day(day=date(1,1,1))))
    check(label+'-temporal-recovery',isinstance(client.create(**params,idempotency_key=key),client_module.Recovered))
    read=client.read_page(owner=alice,size=1)
    check(label+'-temporal-typed-projection',type(read.items[0].day) is date and type(read.items[0].amount) is Decimal and isinstance(read.items[0].at,client_module.ExactTimestamp))
    before=leases[label]['acquired']
    try:client.create(**{**params,'id':key+'-round','at':client_module.ExactTimestamp('2026-01-01T00:00:00.1234567Z')},idempotency_key=key+'-round')
    except client_module.AccessError:check(label+'-temporal-rounding-before-lease',leases[label]['acquired']==before)
    else:raise AssertionError('submicrosecond rounding accepted')
    items=(client_module.DemoCreateBatchInput(**{**params,'id':key+'-bulk1'}),client_module.DemoCreateBatchInput(**{**params,'id':key+'-bulk2','owner':bob,'day':date(9999,12,31),'at':client_module.ExactTimestamp('9999-12-31T23:59:59.999999Z')}))
    bulk=batch.create_batch_batch(items=items,idempotency_key=key+'-bulk')
    check(label+'-temporal-batch-boundaries',bulk.items[1].rows[0].at.text=='9999-12-31T23:59:59.999999Z')
    with factory(a) as c,rollback_caller(c):
        @contextmanager
        def borrowed(_):yield c
        caller_host=SyncNativeTableBinding(adapter(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
        caller=client_module.SyncClient(caller_host.for_identity(a)).modules.demo
        check(label+'-temporal-caller-pending',caller.create(**{**params,'id':key+'-caller'},idempotency_key=key+'-caller').durability=='pending-caller-commit')
    check(label+'-temporal-caller-rollback',isinstance(client.create_observe(**{**params,'id':key+'-caller'},idempotency_key=key+'-caller'),client_module.NotObserved))
    for column,value in [('amount','NaN'),('day','infinity'),('day','10000-01-01'),('at','infinity'),('at','0001-01-01 00:00:00+01')]:
        try:
            with admin.transaction():
                admin.execute(sql.SQL('UPDATE {} SET {}=%s WHERE id=%s').format(bound_table,sql.Identifier(column)),(value,key))
        except psycopg.errors.CheckViolation:check(label+'-native-finite-'+column+'-'+value,True)
        else:raise AssertionError('native finite domain accepted '+value)
    with factory(a) as c:
        query="SELECT pg_catalog.current_setting('DateStyle'),pg_catalog.current_setting('TimeZone')"
        if isinstance(c,psycopg.Connection):settings=c.execute(query).fetchone();c.commit()
        elif hasattr(c,'get_transaction_status'):
            with c.cursor() as cursor:cursor.execute(query);settings=cursor.fetchone()
            c.commit()
        else:settings=tuple(c.exec_driver_sql(query).one());c.commit()
        check(label+'-temporal-ambient-settings-preserved',settings==('SQL, DMY','Pacific/Kiritimati'))
    if args.domains:domain_sync_controls(label,client,params)
    check(label+'-temporal-leases-balanced',leases[label]['acquired']==leases[label]['released'])


async def temporal_async_cases(label,factory,adapter):
    async with factory(a) as c:
        statement="SELECT pg_catalog.set_config('DateStyle','SQL, DMY',false),pg_catalog.set_config('TimeZone','Pacific/Kiritimati',false)"
        if isinstance(c,psycopg.AsyncConnection):await c.execute(statement)
        else:await c.exec_driver_sql(statement)
        await c.commit()
    host=NativeTableBinding(adapter(factory,policy),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
    client=client_module.Client(host.for_identity(a)).modules.demo
    batch=client_module.Client(host.for_identity(job)).modules.demo
    key=label+'-temporal';params=temporal_params(key,alice)
    result=await client.create(**params,idempotency_key=key)
    check(label+'-temporal-async-exact',result.items[0].rows[0].day==date(1,1,1) and result.items[0].rows[0].at.text=='2025-12-31T23:30:00.123456Z')
    clock={k:v for k,v in params.items() if k!='at'};clock['id']=key+'-clock'
    check(label+'-temporal-async-source-clock-default',(await client.create_clock(**clock,idempotency_key=key+'-clock')).items[0].rows[0].at.text.endswith('Z'))
    check(label+'-temporal-async-predicate',any(row.id==key for row in await client.read_before(at=client_module.ExactTimestamp('2026-01-01T00:00:00Z'))))
    check(label+'-temporal-async-recovery',isinstance(await client.create(**params,idempotency_key=key),client_module.Recovered))
    items=(client_module.DemoCreateBatchInput(**{**params,'id':key+'-bulk1'}),client_module.DemoCreateBatchInput(**{**params,'id':key+'-bulk2','owner':bob}))
    check(label+'-temporal-async-bulk',(await batch.create_batch_batch(items=items,idempotency_key=key+'-bulk')).receipt.effects==(1,1))
    before=leases[label]['acquired']
    try:await client.create(**{**params,'id':key+'-round','at':client_module.ExactTimestamp('2026-01-01T00:00:00.1234567Z')},idempotency_key=key+'-round')
    except client_module.AccessError:check(label+'-temporal-async-rounding-before-lease',leases[label]['acquired']==before)
    else:raise AssertionError('submicrosecond rounding accepted')
    async with factory(a) as c:
        native=isinstance(c,psycopg.AsyncConnection)
        @asynccontextmanager
        async def borrowed(_):yield c
        caller_host=NativeTableBinding(adapter(borrowed,policy,transaction_owner='caller'),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
        caller=client_module.Client(caller_host.for_identity(a)).modules.demo
        tx=c.transaction(force_rollback=True) if native else c.begin()
        async with tx:
            if native:await c.execute('SELECT current_user')
            else:await c.exec_driver_sql('SELECT current_user')
            check(label+'-temporal-async-caller-pending',(await caller.create(**{**params,'id':key+'-caller'},idempotency_key=key+'-caller')).durability=='pending-caller-commit')
            if not native:await tx.rollback()
    check(label+'-temporal-async-caller-rollback',isinstance(await client.create_observe(**{**params,'id':key+'-caller'},idempotency_key=key+'-caller'),client_module.NotObserved))
    async with factory(a) as c:
        query="SELECT pg_catalog.current_setting('DateStyle'),pg_catalog.current_setting('TimeZone')"
        if isinstance(c,psycopg.AsyncConnection):settings=await (await c.execute(query)).fetchone()
        else:settings=tuple((await c.exec_driver_sql(query)).one())
        await c.commit()
        check(label+'-temporal-async-settings-preserved',settings==('SQL, DMY','Pacific/Kiritimati'))
    if args.domains:await domain_async_controls(label,client,params)
    check(label+'-temporal-async-cleanup',leases[label]['acquired']==leases[label]['released'])

def domain_sync_controls(label,client,params):
    before=leases[label]['acquired']
    for field,value in [('status','other'),('rank',10),('active',False),('tag','four'),('amount',Decimal('100.00'))]:
        try:client.create(**{**params,'id':params['id']+'-bad',field:value},idempotency_key='bad-'+field)
        except client_module.AccessError:check(label+'-domain-client-'+field,leases[label]['acquired']==before)
        else:raise AssertionError('invalid domain accepted '+field)
    values={k:v for k,v in params.items() if k!='at'}
    touched=client.touch(**values,idempotency_key='touch-'+params['id'])
    check(label+'-domain-server-clock-assignment',touched.items[0].rows[0].at.text!='2025-12-31T23:30:00.123456Z')
    check(label+'-domain-clock-recovery',isinstance(client.touch(**values,idempotency_key='touch-'+params['id']),client_module.Recovered))
    for column,value in [('status','other'),('rank',10),('active',False),('tag','four'),('amount','100.00')]:
        try:
            with admin.transaction():admin.execute(sql.SQL('UPDATE {} SET {}=%s WHERE id=%s').format(bound_table,sql.Identifier(column)),(value,params['id']))
        except psycopg.errors.CheckViolation:check(label+'-domain-native-'+column,True)
        else:raise AssertionError('native domain accepted '+column)


async def domain_async_controls(label,client,params):
    before=leases[label]['acquired']
    for field,value in [('status','other'),('rank',10),('active',False),('tag','four'),('amount',Decimal('100.00'))]:
        try:await client.create(**{**params,'id':params['id']+'-bad',field:value},idempotency_key='bad-'+field)
        except client_module.AccessError:check(label+'-domain-async-client-'+field,leases[label]['acquired']==before)
        else:raise AssertionError('invalid domain accepted '+field)
    values={k:v for k,v in params.items() if k!='at'}
    touched=await client.touch(**values,idempotency_key='touch-'+params['id'])
    check(label+'-domain-async-server-clock',touched.items[0].rows[0].at.text!='2025-12-31T23:30:00.123456Z')
    check(label+'-domain-async-clock-recovery',isinstance(await client.touch(**values,idempotency_key='touch-'+params['id']),client_module.Recovered))


if args.mutations:
    sync_cases,async_cases=write_sync_cases,write_async_cases
if args.generated:
    sync_cases,async_cases=generated_sync_cases,generated_async_cases
if args.temporal:
    sync_cases,async_cases=temporal_sync_cases,temporal_async_cases


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
            if args.domains:
                admin.execute(sql.SQL('INSERT INTO {} (id,owner,content,day,at,amount,status,rank,active,tag) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)').format(bound_table),(key,role,key,'2000-02-29','2026-01-01T00:00:00Z','12.30','draft',2,True,'é😀'))
            elif args.temporal:
                admin.execute(sql.SQL('INSERT INTO {} (id,owner,content,day,at,amount) VALUES (%s,%s,%s,%s,%s,%s)').format(bound_table),(key,role,key,'2000-02-29','2026-01-01T00:00:00Z','12.30'))
            else:
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
        if args.mutations and not args.generated:write_fault_cases()
        if not args.mutations and not args.generated:
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
                'leases':leases,'scope':('generated typed native temporal module methods' if args.temporal else 'generated typed native module methods' if args.generated else 'SDK-owned declared mutation/outcome component' if args.mutations else 'SDK-owned declared reads')+'; six native driver/pool configurations',
                'remaining':['full mutation race/uncertainty/fault qualification' if args.mutations else 'durable write outcomes',* ([] if args.generated else ['generated native module methods']),'remaining lifecycle codecs and evolution','private Praxis and managed Lakebase acceptance','prerelease publication']}
    finally:
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
        for role in reversed(created):admin.execute(sql.SQL('DROP OWNED BY {}').format(sql.Identifier(role)))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'assertions':len(observations),'leases':leases}))
