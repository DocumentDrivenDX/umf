# SPDX-License-Identifier: MIT OR Apache-2.0
"""Isolated PostgreSQL18 legal fixture oracle. No real firm data or managed claims."""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_access.lifecycle import (
    CatalogError,
    apply_concurrent_indexes,
    apply_table_migration,
    inspect_table_history,
    verify_native_catalog,
)
from umf_access.lifecycle.seeds import _binding
from umf_access.unified import (
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
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--fixtures',type=Path,default=Path('fixtures/table-lifecycle/legal'))
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)

prefix='lc_'+uuid4().hex[:12]+'_'
cfg={'module':'legal_lifecycle','schema':prefix+'schema','ownerRole':prefix+'owner',
     'personRole':prefix+'person','batchRole':prefix+'batch','groupRoles':{'billing_admin':prefix+'billing'}}
alice,bob=prefix+'alice',prefix+'bob'
roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],cfg['groupRoles']['billing_admin'],alice,bob]

def source(name):
    text=(args.fixtures/name).read_text().replace('legal_alice',alice).replace('legal_bob',bob)
    return json.loads(text)
def bundle(document):
    result=compile_table_deployment(json.dumps(document,separators=(',',':')),configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']
def plan(identifier,previous,next,predecessor,options=None):
    result=compile_table_migration(migration_id=identifier,previous_bundle=previous,next_bundle=next,predecessor=predecessor,options=options)
    assert result['status']=='compiled',result
    return result['plan']

initial=plan('001',None,bundle(source('initial.json')),None)
forward=plan('002',initial['next'],bundle(source('evolved.json')),{'id':'001','digest':initial['digest']},json.loads((args.fixtures/'evolution-options.json').read_text()))
concurrent=plan('003',forward['next'],bundle(source('indexed.json')),{'id':'002','digest':forward['digest']},json.loads((args.fixtures/'index-options.json').read_text()))
file_digest=hashlib.sha256(b'original fixture plan bytes').hexdigest()
with psycopg.connect(args.dsn,autocommit=True) as admin:
    created=[]
    schema_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        for person in (alice,bob):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(person)))
        admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['groupRoles']['billing_admin']),sql.Identifier(alice)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])));schema_created=True
        def owner_transaction():
            return admin.transaction()
        def apply(current,head,**kwargs):
            with owner_transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
                admin.execute('SET LOCAL search_path=pg_catalog')
                return apply_table_migration(admin,current,approved_digest=current['digest'],expected_head=head,person_roles=(alice,bob),**kwargs)
        first=apply(initial,None,file_digest=file_digest)
        check('initial-commit-ledger',first['generation']==1)
        with tempfile.TemporaryDirectory() as generated:
            result=generate_python_client(initial['next']['source']['utf8'],package='legal_generated')
            for file in result['files']:
                path=Path(generated)/file['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_text(file['text'])
            sys.path.insert(0,generated)
            package=importlib.import_module('legal_generated')
            policy=SessionPolicy({'alice':alice,'bob':bob},{'job':cfg['batchRole']},cfg['schema'],catalog_only=True)
            leases=[]
            @contextmanager
            def factory(_identity):
                with psycopg.connect(args.dsn,autocommit=True) as connection:
                    leases.append('acquired')
                    try:yield connection
                    finally:leases.append('released')
            host=SyncNativeTableBinding(SyncSession(factory,policy),initial['next'],first['installationReference'],_binding(initial['next']),cursor_secret=b'synthetic legal secret 00000000000',outcome_secret=b'synthetic legal secret 00000000000')
            clients=[package.SyncClient(host.for_identity(SessionIdentity('person',name))).modules.legal_lifecycle for name in ('alice','bob')]
            check('generated-sync-page-uses-native-membership',[row.matters_matter_id for row in clients[0].read_matters(size=1).items]==[1])
            changed=clients[0].rename_matter(id=1,title="Synthetic client's matter",idempotency_key='legal-rename')
            check('generated-sync-action-has-affected-count',changed.receipt.effects==(1,))
            check('generated-sync-action-durable-replay',clients[0].rename_matter(id=1,title="Synthetic client's matter",idempotency_key='legal-rename').status=='recovered')
            check('generated-calls-return-every-lease',leases.count('acquired')==leases.count('released')==3)
            sys.path.remove(generated)
        relation=sql.Identifier(cfg['schema'],'matters')
        def visible(role,statement):
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(role)))
                return admin.execute(statement).fetchall()
        for role,expected in [(alice,[(1,)]),(bob,[(2,)]),(cfg['batchRole'],[(1,),(2,)])]:
            check('visible-matters-'+role.split('_')[-1],visible(role,sql.SQL('SELECT matter_id FROM {} ORDER BY matter_id').format(relation))==expected)
        clients=sql.Identifier(cfg['schema'],'clients');timekeepers=sql.Identifier(cfg['schema'],'timekeepers')
        check('public-reference-open-read',visible(alice,sql.SQL('SELECT client_id FROM {} ORDER BY client_id').format(clients))==[(1,)])
        check('trusted-group-select',visible(alice,sql.SQL('SELECT timekeeper_id FROM {} ORDER BY timekeeper_id').format(timekeepers))==[(1,),(2,)])
        check('untrusted-person-group-denied',visible(bob,sql.SQL('SELECT timekeeper_id FROM {}').format(timekeepers))==[])
        check('force-row-level-security',admin.execute('SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid=%s::regclass',(cfg['schema']+'.matters',)).fetchone()==(True,))
        try:visible(alice,sql.SQL('UPDATE {} SET matter_id=99 WHERE matter_id=1 RETURNING matter_id').format(relation))
        except psycopg.errors.InsufficientPrivilege:check('via-old-row-visible-new-row-check-denies',True)
        else:raise AssertionError('via policy accepted update whose new row has no assigned membership')
        for role in (alice,cfg['batchRole']):
            try:visible(role,sql.SQL("INSERT INTO {} VALUES (9,1,1,'forged') RETURNING matter_team_id").format(sql.Identifier(cfg['schema'],'matter_teams')))
            except psycopg.errors.InsufficientPrivilege:check('membership-forgery-denied-'+role.split('_')[-1],True)
            else:raise AssertionError('membership write admitted')
        try:apply(initial,None,file_digest='a'*64)
        except CatalogError as error:check('edited-applied-file-refuses',str(error)=='migration-file-digest-conflict')
        else:raise AssertionError('edited file admitted')
        # A lower source-declared effect bound must roll back the appended column,
        # new check, FK, data change, RLS state and ledger together.
        too_small=source('evolved.json')
        next(c for c in too_small['modules'][0]['extensions']['umf.tables']['commands'] if c['id']=='backfill_review')['body']['maxRows']=1
        failed=plan('002-small',initial['next'],bundle(too_small),{'id':'001','digest':initial['digest']},forward['options'])
        try:apply(failed,first['headDigest'])
        except CatalogError as error:check('overbound-backfill-refuses',str(error) in ('backfill-effect-bound','catalog-verification-failed'))
        else:raise AssertionError('overbound backfill admitted')
        check('failed-backfill-column-rolled-back',admin.execute("SELECT count(*) FROM information_schema.columns WHERE table_schema=%s AND table_name='matters' AND column_name='review_state'",(cfg['schema'],)).fetchone()==(0,))
        second=apply(forward,first['headDigest'])
        check('required-backfill-preserves-protected-rows',admin.execute(sql.SQL('SELECT review_state FROM {} ORDER BY matter_id').format(relation)).fetchall()==[('restricted',),('restricted',)])
        check('forward-replay-has-no-data-effects',apply(forward,first['headDigest'])['status']=='already-applied')
        check('added-fk-and-check-installed',admin.execute("SELECT count(*) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND t.relname='matters' AND c.conname IN ('matters_fk_0','matters_positive_id')",(cfg['schema'],)).fetchone()==(2,))
        try:apply(concurrent,second['headDigest'])
        except CatalogError as error:check('transactional-runner-refuses-concurrent',str(error)=='nontransactional-runner-required')
        else:raise AssertionError('concurrent index ran in transaction')
        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
        admin.execute('SET search_path=pg_catalog')
        try:
            staged=apply_concurrent_indexes(admin,concurrent,approved_digest=concurrent['digest'],expected_head=second['headDigest'],person_roles=(alice,bob),stop_after=1)
            check('first-index-phase-retains-old-ledger',staged['status']=='in-progress' and staged['ledgerAdvanced'] is False)
            check('partial-phase-fences-client-head',not admin.execute("SELECT pg_catalog.has_table_privilege(%s,%s,'SELECT')",(alice,cfg['schema']+'.umf_lifecycle_head')).fetchone()[0])
            try:apply_concurrent_indexes(admin,concurrent,approved_digest=concurrent['digest'],expected_head=second['headDigest'],person_roles=(alice,bob))
            except CatalogError as error:check('unique-build-fails-with-inspect-recovery',str(error)=='index-build-failed-inspect-before-resume')
            else:raise AssertionError('duplicate unique index succeeded')
            try:apply_concurrent_indexes(admin,concurrent,approved_digest=concurrent['digest'],expected_head=second['headDigest'],person_roles=(alice,bob))
            except CatalogError as error:check('invalid-index-needs-explicit-repair',str(error)=='invalid-index-repair-required')
            else:raise AssertionError('invalid index silently repaired')
        finally:
            admin.execute('RESET ROLE');admin.execute('RESET search_path')
        check('failed-phases-do-not-advance-ledger',admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(cfg['schema'],'umf_lifecycle_history'))).fetchone()==(2,))
        visible(bob,sql.SQL("UPDATE {} SET matter_title='Distinct synthetic title' WHERE matter_id=2 RETURNING matter_id").format(relation))
        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])));admin.execute('SET search_path=pg_catalog')
        try:
            third=apply_concurrent_indexes(admin,concurrent,approved_digest=concurrent['digest'],expected_head=second['headDigest'],person_roles=(alice,bob),repair_invalid=True)
            check('explicit-repair-resumes-and-commits',third['status']=='committed' and third['generation']==3)
            check('final-publication-restores-client-head',admin.execute("SELECT pg_catalog.has_table_privilege(%s,%s,'SELECT')",(alice,cfg['schema']+'.umf_lifecycle_head')).fetchone()[0])
            replay=apply_concurrent_indexes(admin,concurrent,approved_digest=concurrent['digest'],expected_head=second['headDigest'],person_roles=(alice,bob))
            check('concurrent-replay-does-not-rebuild',replay['generation']==3)
            with admin.transaction():
                history=inspect_table_history(admin,concurrent['next'],person_roles=(alice,bob))
                check('full-source-and-native-history-correspondence',history['generation']==3)
        finally:
            admin.execute('RESET ROLE');admin.execute('RESET search_path')
        for command,statement in [('update',"UPDATE {} SET matter_title='batch forbidden' RETURNING matter_id"),('delete','DELETE FROM {} RETURNING matter_id')]:
            try:visible(cfg['batchRole'],sql.SQL(statement).format(relation))
            except psycopg.errors.InsufficientPrivilege:check('batch-'+command+'-denied',True)
            else:raise AssertionError('batch '+command+' admitted')
        admin.execute(sql.SQL("COMMENT ON TABLE {} IS 'drift'").format(relation))
        try:
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])));admin.execute('SET LOCAL search_path=pg_catalog')
                verify_native_catalog(admin,concurrent['next'])
        except CatalogError as error:check('native-comment-drift-refuses',str(error)=='catalog-comment-mismatch')
        else:raise AssertionError('comment drift accepted')
    finally:
        admin.execute('RESET ROLE')
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps({'serverMajor':18,'scope':'local fabricated legal lifecycle; no managed/private-consumer or release claim','assertions':checks,'count':len(checks),'planDigests':[p['digest'] for p in (initial,forward,concurrent)]},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'report':str(args.report)}))
