# SPDX-License-Identifier: MIT OR Apache-2.0
"""Atomic typed source snapshots through generated clients on disposable PG18."""
from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import sys
import tempfile
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg_pool import AsyncConnectionPool, ConnectionPool
from umf_access.lifecycle import apply_table_migration
from umf_access.unified import (
    AsyncSession,
    NativeTableBinding,
    SessionIdentity,
    SessionPolicy,
    SyncNativeTableBinding,
    SyncSession,
)
from umf_codegen import (
    compile_table_deployment,
    compile_table_migration,
    generate_python_client,
)

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',required=True)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
source=json.loads(args.source.read_text());module=source['modules'][0];payload=module['extensions']['umf.tables']
prefix='pr_'+uuid4().hex[:12]+'_'
cfg={'module':'demo','schema':prefix+'schema','ownerRole':prefix+'owner','personRole':prefix+'person','batchRole':prefix+'batch','groupRoles':{}}
alice,bob=prefix+'alice',prefix+'bob';roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],alice,bob]
policy=SessionPolicy({'alice':alice,'bob':bob},{'job':cfg['batchRole']},cfg['schema'],catalog_only=True)
a,b,job=SessionIdentity('person','alice'),SessionIdentity('person','bob'),SessionIdentity('batch','job')
text=json.dumps(source,separators=(',',':'));deployment=compile_table_deployment(text=text,configuration=cfg)
assert deployment['status']=='compiled',deployment
bundle=deployment['bundle'];planned=compile_table_migration(migration_id='001',predecessor=None,previous_bundle=None,next_bundle=bundle)
assert planned['status']=='compiled',planned
plan=planned['plan'];fields={e['id']:e for e in module['elements'] if e['kind']=='field'}
records={e['id']:e for e in module['elements'] if e['kind']=='record'}
binding={'version':'umf.raw-read-binding/0.1','schema':cfg['schema'],'modelJson':text,'modelSha256':bundle['sourceDigest'],'tables':[],'relationships':[],
         'nativeLifecycle':{'version':'umf.table-lifecycle/0.1','module':'demo','configurationDigest':bundle['configurationDigest'],'deploymentDigest':bundle['bundleDigest']}}
for table in payload['tables']:
    record=records[table['record']['element']];key=next(k for k in record['keys'] if k.get('primary'))
    binding['tables'].append({'logical':['demo',record['id']],'native':table['name'],'key':[f['element'] for f in key['fields']],
                             'columns':[{'logical':c['field']['element'],'native':c['name'],'carrier':fields[c['field']['element']]['scalarType'],
                                         'nullable':fields[c['field']['element']]['nullability']=='absent-allowed'} for c in table['columns']]})
observations=[];leases={'sync':{'acquired':0,'released':0},'async':{'acquired':0,'released':0}}
secret=b'public synthetic association test secret 0000'
def check(name,condition):
    assert condition,name
    observations.append(name)

def seed(admin):
    # Excluded synthetic data setup, not UMF seed execution.
    with admin.transaction(),admin.cursor() as cursor:
        cursor.executemany(sql.SQL('INSERT INTO {}(id,owner,"sourceAmount","sourceMemo") VALUES (%s,%s,%s,%s)').format(sql.Identifier(cfg['schema'],'notes')),
                           [('a',alice,Decimal('0.123'),None),('a2',alice,Decimal('0.777'),'memo'),('b',bob,None,'other')])


def source_rows(admin):
    return admin.execute(sql.SQL('SELECT "snapshotId","actor","savedAmount","savedMemo" FROM {} ORDER BY "snapshotId"').format(sql.Identifier(cfg['schema'],'snapshots'))).fetchall()


def sync_cases(client,foreign,batch):
    applied=client.capture(snapshot_id='sync-a',source_id='a',comment=None,idempotency_key='sync-a')
    row=applied.items[0].rows[0]
    check('sync-single-atomic-source-copy',applied.receipt.effects==(1,) and row.source_id=='a' and row.saved_owner==alice)
    check('sync-current-principal-not-caller-input',row.actor==alice)
    check('sync-exact-numeric-and-null-source-copy',row.saved_amount==Decimal('0.123') and row.saved_memo is None and row.comment is None)
    check('sync-native-instant',row.observed_at.text.endswith('Z'))
    check('sync-replay-does-not-copy-again',client.capture(snapshot_id='sync-a',source_id='a',comment=None,idempotency_key='sync-a').status=='recovered')
    hidden=foreign.capture(snapshot_id='sync-hidden',source_id='a',comment=None,idempotency_key='sync-hidden')
    check('sync-source-rls-hidden-is-zero-effects',hidden.receipt.effects==(0,) and hidden.items[0].rows==())
    missing=client.capture(snapshot_id='sync-missing',source_id='missing',comment=None,idempotency_key='sync-missing')
    check('sync-source-missing-is-zero-effects',missing.receipt.effects==(0,))
    null=foreign.capture(snapshot_id='sync-b',source_id='b',comment='text',idempotency_key='sync-b')
    check('sync-null-numeric-and-text-source',null.items[0].rows[0].saved_amount is None and null.items[0].rows[0].saved_memo=='other')
    result=batch.capture(snapshot_id='sync-job',source_id='a',comment='job',idempotency_key='sync-job')
    check('sync-batch-principal-separate',result.items[0].rows[0].actor==cfg['batchRole'])
    try:client.capture_all(comment=None,idempotency_key='sync-overflow')
    except generated.AccessError as error:check('sync-source-overflow-rolls-back',error.code=='LIMIT_EXCEEDED')
    else:raise AssertionError('source overflow admitted')
    check('sync-overflow-has-no-receipt',client.capture_all_observe(comment=None,idempotency_key='sync-overflow').status=='not-observed')
    try:client.capture(snapshot_id='spoof',source_id='a',comment=None,actor=bob,idempotency_key='spoof')
    except TypeError:check('sync-actor-cannot-be-overridden',True)
    else:raise AssertionError('actor input admitted')


async def async_cases(client,foreign,batch):
    applied=await client.capture(snapshot_id='async-a',source_id='a',comment=None,idempotency_key='async-a')
    row=applied.items[0].rows[0]
    check('async-single-atomic-source-copy',applied.receipt.effects==(1,) and row.source_id=='a' and row.saved_owner==alice)
    check('async-current-principal-not-caller-input',row.actor==alice)
    check('async-exact-numeric-and-null-source-copy',row.saved_amount==Decimal('0.123') and row.saved_memo is None)
    check('async-replay-does-not-copy-again',(await client.capture(snapshot_id='async-a',source_id='a',comment=None,idempotency_key='async-a')).status=='recovered')
    check('async-source-rls-hidden-is-zero-effects',(await foreign.capture(snapshot_id='async-hidden',source_id='a',comment=None,idempotency_key='async-hidden')).receipt.effects==(0,))
    check('async-source-missing-is-zero-effects',(await client.capture(snapshot_id='async-missing',source_id='missing',comment=None,idempotency_key='async-missing')).receipt.effects==(0,))
    null=await foreign.capture(snapshot_id='async-b',source_id='b',comment=None,idempotency_key='async-b')
    check('async-null-source-copy',null.items[0].rows[0].saved_amount is None and null.items[0].rows[0].saved_memo=='other')
    result=await batch.capture(snapshot_id='async-job',source_id='a',comment='job',idempotency_key='async-job')
    check('async-batch-principal-separate',result.items[0].rows[0].actor==cfg['batchRole'])
    try:await client.capture_all(comment=None,idempotency_key='async-overflow')
    except generated.AccessError as error:check('async-source-overflow-rolls-back',error.code=='LIMIT_EXCEEDED')
    else:raise AssertionError('source overflow admitted')
    check('async-overflow-has-no-receipt',(await client.capture_all_observe(comment=None,idempotency_key='async-overflow')).status=='not-observed')


async def run_async(reference):
    async with AsyncConnectionPool(args.dsn,min_size=1,max_size=1,open=False,kwargs={'autocommit':True}) as pool:
        await pool.wait(timeout=10)
        @asynccontextmanager
        async def factory(_):
            async with pool.connection() as connection:
                leases['async']['acquired']+=1
                try:yield connection
                finally:leases['async']['released']+=1
        host=NativeTableBinding(AsyncSession(factory,policy),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
        clients=[generated.Client(host.for_identity(identity)).modules.demo for identity in (a,b,job)]
        await async_cases(*clients)
        async with pool.connection() as connection:
            check('async-pool-role-cleanup',(await (await connection.execute('SELECT current_user')).fetchone())[0] not in roles)

with tempfile.TemporaryDirectory(prefix='umf-snapshot-generated-') as directory:
    for file in generate_python_client(text,package='snapshot_demo')['files']:
        target=Path(directory,file['path']);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(file['text'])
    sys.path.insert(0,directory);generated=importlib.import_module('snapshot_demo')
    with psycopg.connect(args.dsn,autocommit=True) as admin:
        created=[];schema_created=False
        try:
            for role in roles:
                admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
            for role in (alice,bob):admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(role)))
            admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])));schema_created=True
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])));admin.execute('SET LOCAL search_path=pg_catalog')
                reference=apply_table_migration(admin,plan,approved_digest=plan['digest'],expected_head=None,person_roles=(alice,bob))['installationReference']
            check('snapshot-install-has-no-foreign-keys',bundle['expectedCatalog']['foreignKeys']==[])
            seed(admin)
            with ConnectionPool(args.dsn,min_size=1,max_size=1,kwargs={'autocommit':True}) as pool:
                pool.wait(timeout=10)
                @contextmanager
                def factory(_):
                    with pool.connection() as connection:
                        leases['sync']['acquired']+=1
                        try:yield connection
                        finally:leases['sync']['released']+=1
                host=SyncNativeTableBinding(SyncSession(factory,policy),bundle,reference,binding,cursor_secret=secret,outcome_secret=secret)
                sync_cases(*(generated.SyncClient(host.for_identity(identity)).modules.demo for identity in (a,b,job)))
                with pool.connection() as connection:check('sync-pool-role-cleanup',connection.execute('SELECT current_user').fetchone()[0] not in roles)
            asyncio.run(run_async(reference))
            for label,counts in leases.items():check(label+'-balanced-leases',counts['acquired']==counts['released'])
            check('native-constraint-inventory-unchanged',admin.execute('SELECT count(*) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND c.contype=%s',(cfg['schema'],'f')).fetchone()==(0,))
            check('overflow-and-hidden-inserts-have-no-native-effects',len(source_rows(admin))==6 and not any(row[0] in ('a','a2') for row in source_rows(admin)))
            report={'scope':'generated atomic source snapshots; local PostgreSQL18 only','postgresql':admin.info.server_version,'atomicInsertSelect':True,'sourceDigest':bundle['sourceDigest'],'observations':observations,'leases':leases,'fullPraxisAcceptance':False}
        finally:
            if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
            for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'assertions':len(observations),'leases':leases}))
