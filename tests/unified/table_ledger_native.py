# SPDX-License-Identifier: MIT OR Apache-2.0
"""Original-plan native ledger application/replay on disposable PG18 objects."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import queue
import threading
import time
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg import sql
from umf_access.lifecycle import CatalogError, apply_table_migration, inspect_table_history
from umf_access.lifecycle import ledger as implementation

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',required=True)
parser.add_argument('--plans',required=True,type=Path)
parser.add_argument('--report',required=True,type=Path)
args=parser.parse_args()
plans=json.loads(args.plans.read_text())
initial,forward=plans['initial'],plans['forward']
cfg=initial['next']['configuration']
schema,owner,person,batch=(cfg[k] for k in ('schema','ownerRole','personRole','batchRole'))
groups=list(cfg['groupRoles'].values())
assert all(re.fullmatch(r'p3_[a-f0-9]{12}_(schema|owner|person|batch|readers|z|aa)',n) for n in (schema,owner,person,batch,*groups))
alice,bob=owner+'_alice',owner+'_bob'
roles=[owner,person,batch,*groups,alice,bob]
observations=[]


def check(name,condition):
    assert condition,name
    observations.append(name)


def context(connection):
    connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
    connection.execute('SET LOCAL search_path=pg_catalog')


def apply(connection,plan,head=None,approved=None):
    return apply_table_migration(connection,plan,approved_digest=approved or plan['digest'],
                                 expected_head=head,person_roles=(alice,bob))


def inspect(connection,bundle):
    return inspect_table_history(connection,bundle,person_roles=(alice,bob))


def refuses(name,operation,reason):
    try:operation()
    except CatalogError as error:check(name,str(error) in reason)
    else:raise AssertionError(name)


with psycopg.connect(args.dsn,autocommit=True) as admin:
    created=[]
    schema_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)))
            created.append(role)
        for role in (alice,bob):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(person),sql.Identifier(role)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
        schema_created=True
        with admin.transaction(force_rollback=True):
            context(admin)
            admin.execute(sql.SQL('CREATE TABLE {}(value text)').format(sql.Identifier(schema,'unrelated')))
            refuses('initial-requires-empty-schema',lambda:apply(admin,initial),{'initial-schema-not-empty'})
        with admin.transaction(force_rollback=True):
            context(admin)
            admin.execute(sql.SQL('CREATE TABLE {}(value text)').format(sql.Identifier(schema,'umf_lifecycle_history')))
            refuses('same-name-is-not-ledger-authority',lambda:apply(admin,initial),{'ledger-catalog-mismatch'})
        with admin.transaction(force_rollback=True):
            context(admin)
            refuses('wrong-approval-refuses',lambda:apply(admin,initial,approved='0'*64),{'approval-required'})
            check('approval-refusal-no-effects',admin.execute('SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace=%s::pg_catalog.regnamespace',(schema,)).fetchone()==(0,))
            result=apply(admin,initial)
            check('initial-application-pending-caller-commit',result['status']=='applied-in-transaction' and result['commitResponsibility']=='caller' and result['lifecycleAdmission'] is False)
            check('uncommitted-history-visible-to-own-transaction',inspect(admin,initial['next'])['generation']==1)
        check('caller-rollback-removes-ddl-and-ledger',admin.execute('SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace=%s::pg_catalog.regnamespace',(schema,)).fetchone()==(0,))
        with admin.transaction():
            context(admin)
            first=apply(admin,initial)
            check('jsonb-group-map-order-preserves-original-source-plan',first['generation']==1)
            started=queue.Queue()
            completed=queue.Queue()
            def competing_migrator():
                try:
                    with psycopg.connect(args.dsn,autocommit=True) as other,other.transaction():
                        context(other)
                        started.put(other.info.backend_pid)
                        value=apply(other,initial)
                    completed.put(value)
                except BaseException as error:
                    completed.put(error)
            worker=threading.Thread(target=competing_migrator,daemon=True)
            worker.start()
            pid=started.get(timeout=10)
            deadline=time.monotonic()+10
            waiting=False
            with psycopg.connect(args.dsn,autocommit=True) as monitor:
                while time.monotonic()<deadline:
                    state=monitor.execute('SELECT wait_event_type,wait_event FROM pg_catalog.pg_stat_activity WHERE pid=%s',(pid,)).fetchone()
                    if state==('Lock','advisory'):
                        waiting=True
                        break
                    if not worker.is_alive():break
                    threading.Event().wait(.02)
            check('competing-migrator-actually-waits-for-native-lock',waiting)
        worker.join(timeout=15)
        check('competing-migrator-completes-after-owner-commit',not worker.is_alive())
        competitor=completed.get(timeout=1)
        if isinstance(competitor,BaseException):raise competitor
        check('competing-identical-migration-replays-once',competitor['status']=='already-applied' and competitor['generation']==1 and competitor['entryDigest']==first['entryDigest'])
        with admin.transaction():
            context(admin)
            check('durable-history-observed-after-caller-commit',inspect(admin,initial['next'])['headDigest']==first['entryDigest'])
            check('initial-replay-does-not-add-history',apply(admin,initial)['status']=='already-applied')
            for label,command in [('row-security','SET LOCAL row_security=off'),('replica','SET LOCAL session_replication_role=replica')]:
                with admin.transaction(force_rollback=True):
                    if label=='replica':admin.execute('SET LOCAL ROLE NONE')
                    admin.execute(command)
                    context(admin)
                    refuses('unsafe-install-context-'+label,lambda:apply(admin,initial),{'install-authority-required'})
            original=implementation._execute
            def fail_after_history_insert(connection,statement,parameters=()):
                original(connection,statement,parameters)
                if statement.startswith('INSERT INTO '):
                    connection.execute('SELECT 1/0')
            with patch.object(implementation,'_execute',side_effect=fail_after_history_insert):
                refuses('native-error-after-history-insert-rolls-back-plan',lambda:apply(admin,forward,first['entryDigest']),{'catalog-verification-failed'})
            check('failed-forward-keeps-caller-healthy',admin.execute('SELECT 1').fetchone()==(1,))
            check('failed-forward-keeps-old-history',inspect(admin,initial['next'])['generation']==1)
            check('failed-forward-removes-new-relation',admin.execute('SELECT pg_catalog.to_regclass(%s)',(schema+'.extras',)).fetchone()==(None,))
        with admin.transaction():
            context(admin)
            second=apply(admin,forward,first['entryDigest'])
            check('forward-application-increments-generation',second['generation']==2)
        with admin.transaction():
            context(admin)
            check('forward-replay-does-not-repeat-ddl',apply(admin,forward,first['entryDigest'])['status']=='already-applied')
            check('historical-initial-replay-verifies-current-cohort',apply(admin,initial)['installedBundleDigest']==forward['toBundleDigest'])
            from psycopg.rows import dict_row
            previous_factory=admin.row_factory
            try:
                admin.row_factory=dict_row
                check('ledger-private-cursors-support-caller-dict-factory',inspect(admin,forward['next'])['generation']==2 and apply(admin,forward,first['entryDigest'])['status']=='already-applied')
                check('ledger-preserves-caller-row-factory',admin.execute('SELECT 1 AS value').fetchone()=={'value':1})
            finally:
                admin.row_factory=previous_factory
            refuses('edited-applied-id-refuses',lambda:apply(admin,plans['edited']),{'ledger-digest-conflict'})
            refuses('divergent-forward-head-refuses',lambda:apply(admin,plans['divergent'],first['entryDigest']),{'ledger-head-mismatch'})
            refuses('stale-cohort-inspection-refuses',lambda:inspect(admin,initial['next']),{'installed-generation-mismatch'})
            for label,statement in [
                ('entry-digest',sql.SQL("UPDATE {} SET entry_digest=repeat('0',64) WHERE position=1").format(sql.Identifier(schema,'umf_lifecycle_history'))),
                ('predecessor-digest',sql.SQL("UPDATE {} SET predecessor_entry_digest=repeat('0',64) WHERE position=2").format(sql.Identifier(schema,'umf_lifecycle_history'))),
                ('source-plan',sql.SQL("UPDATE {} SET payload=pg_catalog.jsonb_set(payload,'{{plan,steps,0,sql}}','\"DROP SCHEMA public CASCADE\"'::pg_catalog.jsonb) WHERE position=1").format(sql.Identifier(schema,'umf_lifecycle_history'))),
            ]:
                with admin.transaction(force_rollback=True):
                    admin.execute(statement)
                    refuses('altered-history-refuses-'+label,lambda:inspect(admin,forward['next']),{'ledger-digest-conflict'})
                    check('history-refusal-keeps-caller-'+label,admin.execute('SELECT 1').fetchone()==(1,))
            for label,statement in [
                ('metadata-grant',sql.SQL('GRANT SELECT ON {} TO {}').format(sql.Identifier(schema,'umf_lifecycle_history'),sql.Identifier(person))),
                ('metadata-column',sql.SQL('ALTER TABLE {} ALTER COLUMN plan_digest TYPE pg_catalog.varchar(64)').format(sql.Identifier(schema,'umf_lifecycle_history'))),
                ('metadata-extra-index',sql.SQL('CREATE INDEX extra_metadata ON {}(plan_digest)').format(sql.Identifier(schema,'umf_lifecycle_history'))),
                ('data-default',sql.SQL("ALTER TABLE {} ALTER COLUMN owner SET DEFAULT 'changed'").format(sql.Identifier(schema,'notes'))),
            ]:
                with admin.transaction(force_rollback=True):
                    admin.execute(statement)
                    refuses('native-ledger-drift-refuses-'+label,lambda:inspect(admin,forward['next']),{'ledger-privilege-mismatch','ledger-catalog-mismatch','catalog-mismatch'})
                    check('drift-refusal-keeps-caller-'+label,admin.execute('SELECT 1').fetchone()==(1,))
            check('final-history-restores-after-controls',inspect(admin,forward['next'])['headDigest']==second['entryDigest'])
            with admin.transaction(force_rollback=True):
                admin.execute(sql.SQL("INSERT INTO {} SELECT g,'opaque-'||g,NULL,repeat('a',64),repeat('b',64),'{{}}'::pg_catalog.jsonb FROM pg_catalog.generate_series(3,131) g").format(sql.Identifier(schema,'umf_lifecycle_history')))
                refuses('bounded-history-count-before-payload-load',lambda:inspect(admin,forward['next']),{'ledger-capacity'})
            with admin.transaction(force_rollback=True):
                admin.execute(sql.SQL("UPDATE {} SET payload=pg_catalog.jsonb_build_object('oversize',repeat('x',33554432)) WHERE position=1").format(sql.Identifier(schema,'umf_lifecycle_history')))
                refuses('bounded-history-bytes-before-payload-load',lambda:inspect(admin,forward['next']),{'ledger-capacity'})
        with admin.transaction():
            admin.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
            context(admin)
            refuses('unsupported-install-snapshot-refuses',lambda:apply(admin,initial),{'install-authority-required'})
        for identity in (alice,batch):
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(identity)))
                admin.execute('SET LOCAL search_path=pg_catalog')
                refuses('ordinary-identity-cannot-install-'+identity,lambda:apply(admin,initial),{'install-authority-required'})
                with admin.transaction(force_rollback=True):
                    denied=False
                    try:admin.execute(sql.SQL('SELECT payload FROM {}').format(sql.Identifier(schema,'umf_lifecycle_history')))
                    except psycopg.errors.InsufficientPrivilege:denied=True
                    check('ordinary-identity-cannot-read-ledger-'+identity,denied)
        report={'scope':'approved initial/append native administrative ledger; no complete lifecycle data admission',
                'serverVersion':admin.info.server_version,'psycopg':psycopg.__version__,
                'plansSha256':hashlib.sha256(args.plans.read_bytes()).hexdigest(),
                'initialPlanDigest':initial['digest'],'forwardPlanDigest':forward['digest'],
                'observations':observations,'nativeLifecycleReleaseQualified':False}
    finally:
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'nativeAssertions':len(observations),'releaseQualified':False}))
