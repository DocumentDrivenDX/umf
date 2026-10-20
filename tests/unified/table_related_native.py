# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated association-policy methods on disposable PostgreSQL18 objects."""
from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import sys
import tempfile
from contextlib import asynccontextmanager, contextmanager
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
    # Excluded installer fixture setup; no UMF seed-execution claim.
    with admin.transaction():
        for table in reversed(payload['tables']):admin.execute(sql.SQL('DELETE FROM {}').format(sql.Identifier(cfg['schema'],table['name'])))
        with admin.cursor() as cursor:
            cursor.executemany(sql.SQL('INSERT INTO {}(id,owner) VALUES (%s,%s)').format(sql.Identifier(cfg['schema'],'notes')),[('a','unrelated'),('b','unrelated'),('unmatched','unrelated')])
            nested=len(payload['tables'])==3
            cursor.executemany(sql.SQL('INSERT INTO {}(note_id,person) VALUES (%s,%s)').format(sql.Identifier(cfg['schema'],'memberships')),
                               [('ga' if nested else 'a',alice),('gb' if nested else 'b',bob),('future',alice)])
            if nested:cursor.executemany(sql.SQL('INSERT INTO {}("bridgeId","bridgeNote","bridgeGroup") VALUES (%s,%s,%s)').format(sql.Identifier(cfg['schema'],'bridges')),
                                         [('a1','a','ga'),('a2','a','ga'),('b1','b','gb'),('null',None,'ga'),('future','future','future')])

def sync_cases(client,foreign,batch):
    check('sync-person-visible-association',[row.id for row in client.all_notes()]==['a'])
    check('sync-other-person-isolated',[row.id for row in foreign.all_notes()]==['b'])
    check('sync-batch-explicit-grant',[row.id for row in batch.all_notes()]==['a','b','unmatched'])
    result=client.rename(id='a',owner=bob,idempotency_key='rename')
    check('sync-related-update',result.receipt.effects==(1,) and result.items[0].rows[0].owner==bob)
    check('sync-related-replay',client.rename(id='a',owner=bob,idempotency_key='rename').status=='recovered')
    check('sync-changing-unrelated-owner-does-not-grant-access',[row.id for row in foreign.all_notes()]==['b'])
    check('sync-hidden-update-affects-zero',foreign.rename(id='a',owner=bob,idempotency_key='hidden').receipt.effects==(0,))
    try:client.create(id='future',owner=alice,idempotency_key='denied')
    except generated.AccessError as error:check('sync-person-insert-policy-denies',error.code=='DENIED')
    else:raise AssertionError('person insert admitted')
    check('sync-denied-write-no-outcome',client.create_observe(id='future',owner=alice,idempotency_key='denied').status=='not-observed')
    check('sync-batch-insert',batch.create(id='batch',owner=bob,idempotency_key='batch').receipt.effects==(1,))
    check('sync-hidden-delete-affects-zero',foreign.remove(id='a',idempotency_key='hidden-delete').receipt.effects==(0,))
    check('sync-related-delete',client.remove(id='a',idempotency_key='delete').receipt.effects==(1,))

async def async_cases(client,foreign,batch):
    check('async-person-visible-association',[row.id for row in await client.all_notes()]==['a'])
    check('async-other-person-isolated',[row.id for row in await foreign.all_notes()]==['b'])
    check('async-batch-explicit-grant',[row.id for row in await batch.all_notes()]==['a','b','unmatched'])
    result=await client.rename(id='a',owner=bob,idempotency_key='async-rename')
    check('async-related-update',result.receipt.effects==(1,) and result.items[0].rows[0].owner==bob)
    check('async-related-replay',(await client.rename(id='a',owner=bob,idempotency_key='async-rename')).status=='recovered')
    check('async-changing-unrelated-owner-does-not-grant-access',[row.id for row in await foreign.all_notes()]==['b'])
    check('async-hidden-update-affects-zero',(await foreign.rename(id='a',owner=bob,idempotency_key='async-hidden')).receipt.effects==(0,))
    try:await client.create(id='future',owner=alice,idempotency_key='async-denied')
    except generated.AccessError as error:check('async-person-insert-policy-denies',error.code=='DENIED')
    else:raise AssertionError('person insert admitted')
    check('async-denied-write-no-outcome',(await client.create_observe(id='future',owner=alice,idempotency_key='async-denied')).status=='not-observed')
    check('async-batch-insert',(await batch.create(id='batch',owner=bob,idempotency_key='async-batch')).receipt.effects==(1,))
    check('async-hidden-delete-affects-zero',(await foreign.remove(id='a',idempotency_key='async-hidden-delete')).receipt.effects==(0,))
    check('async-related-delete',(await client.remove(id='a',idempotency_key='async-delete')).receipt.effects==(1,))

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

with tempfile.TemporaryDirectory(prefix='umf-related-generated-') as directory:
    for file in generate_python_client(text,package='related_demo')['files']:
        target=Path(directory,file['path']);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(file['text'])
    sys.path.insert(0,directory);generated=importlib.import_module('related_demo')
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
            check('association-install-has-no-foreign-keys',bundle['expectedCatalog']['foreignKeys']==[])
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
            seed(admin);asyncio.run(run_async(reference))
            for label,counts in leases.items():check(label+'-balanced-leases',counts['acquired']==counts['released'])
            check('native-constraint-inventory-unchanged',admin.execute('SELECT count(*) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND c.contype=%s',(cfg['schema'],'f')).fetchone()==(0,))
            report={'scope':'generated typed direct/nested related policies; local PostgreSQL18 only','postgresql':admin.info.server_version,'nested':len(payload['tables'])==3,'sourceDigest':bundle['sourceDigest'],'observations':observations,'leases':leases,'fullPraxisAcceptance':False}
        finally:
            if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
            for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'assertions':len(observations),'leases':leases,'nested':report['nested']}))
