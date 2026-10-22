# SPDX-License-Identifier: MIT OR Apache-2.0
"""G01 fill-plus-NOT-NULL acceptance through the public PostgreSQL host API."""
from __future__ import annotations

import argparse
import hashlib
import json
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import (
    CatalogError,
    MigrationRequest,
    PsycopgMigrationHost,
    apply_migration_on_host,
    apply_table_migration,
)
from umf_access.lifecycle.host import HostOutcomeUnknown
from umf_codegen import compile_table_deployment, compile_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--fixture',type=Path,default=Path('/private/tmp/umf-g01-native-fixture.json'))
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
fixture=json.loads(args.fixture.read_text())
assert fixture['version']=='umf.praxis.g01-native-fixture/1'
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)

def bundle(source,cfg):
    text=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
    result=compile_table_deployment(text,configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']

class _TransactionProxy:
    def __init__(self, transaction, on_data_step=None, before_statement=None):
        self._transaction=transaction
        self._on_data_step=on_data_step
        self._before_statement=before_statement
    def __getattr__(self,name):return getattr(self._transaction,name)
    def execute_statement(self,statement):
        if self._before_statement is not None:self._before_statement(self._transaction,statement)
        return self._transaction.execute_statement(statement)
    def execute_data_step(self,plan,step):
        self._transaction.execute_data_step(plan,step)
        if self._on_data_step is not None:self._on_data_step(plan,step,self._transaction)

class _LeaseProxy:
    def __init__(self,lease,on_data_step=None,before_statement=None,after_phase=None,fail_finalize=False):
        self._lease=lease
        self._on_data_step=on_data_step
        self._before_statement=before_statement
        self._after_phase=after_phase
        self._fail_finalize=fail_finalize
    def __getattr__(self,name):return getattr(self._lease,name)
    @contextmanager
    def required_phase(self,phase,*,prior):
        with self._lease.required_phase(phase,prior=prior) as transaction:
            yield _TransactionProxy(transaction,self._on_data_step,self._before_statement)
        if self._after_phase is not None:self._after_phase(phase)
    def finalize(self,request,approval):
        if self._fail_finalize:
            self._fail_finalize=False
            raise RuntimeError('injected-finalize-interruption')
        return self._lease.finalize(request,approval)

class _HostProxy:
    def __init__(self,host,**kwargs):self._host=host;self._kwargs=kwargs
    @property
    def capabilities(self):return self._host.capabilities
    @contextmanager
    def acquire(self,*args,**kwargs):
        with self._host.acquire(*args,**kwargs) as lease:
            yield _LeaseProxy(lease,**self._kwargs)

def _inject_null_before_tighten(cfg,observations):
    def inject(transaction,statement):
        if 'SET NOT NULL' not in statement:return
        connection=transaction.lease.connection
        elevated=connection.execute('SELECT session_user').fetchone()[0]
        connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(elevated)))
        connection.execute(sql.SQL('INSERT INTO {} (id,owner,summary) VALUES (%s,%s,NULL)').format(sql.Identifier(cfg['schema'],'notes')),('g01_fault_null','g01_alice'))
        observations['rowsAfterFillBeforeTighten']=connection.execute(sql.SQL('SELECT id,summary FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'notes'))).fetchall()
        connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
        try:
            transaction.execute_statement(statement)
        except psycopg.errors.NotNullViolation as error:
            observations['tightenSqlstate']=error.sqlstate
            raise
        raise AssertionError('planned SET NOT NULL accepted an injected NULL row')
    return inject

def _observe_bounded_effect(cfg,observations):
    from umf_access.lifecycle import backfills
    original=backfills._apply_backfill
    def observe(connection,plan,step):
        observations['dataStepAttempt']=step['id']
        try:return original(connection,plan,step)
        except CatalogError as error:
            if str(error)=='backfill-effect-bound':
                observations['boundError']=str(error)
                observations['rowsAfterRejectedBound']=connection.execute(sql.SQL('SELECT id,summary FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'notes'))).fetchall()
                observations['dataStepId']=step['id']
            raise
        except psycopg.Error as error:
            observations['nativeSqlstate']=error.sqlstate
            observations['nativeDataStepId']=step['id']
            raise
    return backfills,original,observe

def _writer_barrier(dsn,cfg,table):
    attempting=threading.Event();finished=threading.Event();outcome=[];pid=[]
    def writer():
        try:
            with psycopg.connect(dsn,autocommit=True) as connection:
                connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier('g01_alice')))
                pid.append(connection.execute('SELECT pg_catalog.pg_backend_pid()').fetchone()[0])
                attempting.set()
                try:
                    connection.execute(sql.SQL('INSERT INTO {} (id,owner,summary) VALUES (%s,%s,NULL)').format(table),('raced','g01_alice'))
                except psycopg.errors.NotNullViolation:
                    outcome.append('not-null-after-pair')
                else:
                    outcome.append('insert-succeeded-in-pair-gap')
        except psycopg.Error as error:outcome.append(type(error).__name__)
        finally:finished.set()
    def after_fill(plan,step,_transaction=None):
        if step['kind']!='backfill' or attempting.is_set():return
        thread=threading.Thread(target=writer,daemon=True);thread.start()
        if not attempting.wait(10):raise AssertionError('writer did not reach the backfill/tighten barrier')
        deadline=time.monotonic()+15
        with psycopg.connect(dsn,autocommit=True) as monitor:
            while time.monotonic()<deadline:
                state=monitor.execute('SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid=%s',(pid[0],)).fetchone()
                if state==('Lock',):return
        raise AssertionError('direct insert was not held while the backfill and NOT NULL step shared a transaction')
    return after_fill,finished,outcome,pid

with psycopg.connect(args.dsn,autocommit=True) as admin:
    server=admin.execute('SELECT pg_catalog.version()').fetchone()[0]
    for case in fixture['cases']:
        print('running '+case['id'],flush=True)
        cfg=case['configuration'];db='g01_'+uuid4().hex[:10]
        owner,person,batch=cfg['ownerRole'],cfg['personRole'],cfg['batchRole']
        individuals=('g01_alice','g01_bob')
        roles=(owner,person,batch,*individuals)
        made_roles=[];made_db=False
        try:
            for role in roles:
                admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));made_roles.append(role)
            for individual in individuals:
                admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(person),sql.Identifier(individual)))
            admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db)));made_db=True
            dsn=conninfo.make_conninfo(args.dsn,dbname=db)
            with psycopg.connect(dsn,autocommit=True) as connection:
                connection.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(owner)))
                initial_bundle=bundle(case['initialSource'],cfg)
                initial_result=compile_table_migration(migration_id=case['id']+'-001',predecessor=None,previous_bundle=None,next_bundle=initial_bundle)
                assert initial_result['status']=='compiled',initial_result
                initial=initial_result['plan']
                with connection.transaction():
                    connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                    connection.execute('SET LOCAL search_path=pg_catalog')
                    installed=apply_table_migration(connection,initial,approved_digest=initial['digest'],expected_head=None,person_roles=individuals)
                for row in case['initialRows']:
                    if 'summary' in row:
                        connection.execute(sql.SQL('INSERT INTO {} (id,owner,summary) VALUES (%s,%s,%s)').format(sql.Identifier(cfg['schema'],'notes')),(row['id'],row['owner'],row['summary']))
                    else:
                        connection.execute(sql.SQL('INSERT INTO {} (id,owner) VALUES (%s,%s)').format(sql.Identifier(cfg['schema'],'notes')),(row['id'],row['owner']))
                next_bundle=bundle(case['source'],cfg)
                result=compile_table_migration(migration_id=case['plan']['id'],predecessor={'id':initial['id'],'digest':initial['digest']},previous_bundle=initial_bundle,next_bundle=next_bundle,options=case['plan']['options'])
                assert result['status']=='compiled',result
                plan=result['plan'];head=installed['headDigest']
                raw=json.dumps(plan,sort_keys=True,separators=(',',':')).encode()
                file_digest=hashlib.sha256(raw).hexdigest()
                evidence_digest=hashlib.sha256(('g01-native:'+case['id']+':postgresql18/0.1').encode()).hexdigest()
                connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                connection.execute('SET search_path=pg_catalog')
                host=PsycopgMigrationHost(connection,person_roles=individuals,target_profile='postgresql18/0.1',installation_id='g01-'+case['id'])
                request=MigrationRequest(plan,head,file_digest)
                approval=host.record_approval(request,decision='approved',qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest)
                check(case['id']+'-host-recorded-source-bound-approval',approval.decision=='approved' and approval.evidence_digest==evidence_digest)
                if case.get('expectedFailure') in ('backfill-effect-bound','native-not-null-violation','native-constraint-violation'):
                    observations={}
                    run_host=host
                    backfill_module=original_backfill=wrapped_backfill=None
                    if case['expectedFailure']=='native-not-null-violation':
                        run_host=_HostProxy(host,before_statement=_inject_null_before_tighten(cfg,observations))
                    else:
                        backfill_module,original_backfill,wrapped_backfill=_observe_bounded_effect(cfg,observations)
                        backfill_module._apply_backfill=wrapped_backfill
                    try:
                        try:apply_migration_on_host(run_host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest,approval_id=approval.receipt_id)
                        except (CatalogError,HostOutcomeUnknown) as error:
                            check(case['id']+'-expected-native-failure-observed',True)
                            checks.append(case['id']+'-outer-error-'+str(error))
                        else:raise AssertionError(f"{case['id']} unexpectedly committed")
                    finally:
                        if backfill_module is not None:backfill_module._apply_backfill=original_backfill
                    if case['expectedFailure']=='native-not-null-violation':
                        check(case['id']+'-real-not-null-sqlstate-reached-after-successful-fill',observations.get('tightenSqlstate')=='23502' and observations.get('rowsAfterFillBeforeTighten')==[('a','filled'),('b','filled'),('g01_fault_null',None)])
                    elif case['expectedFailure']=='native-constraint-violation':
                        sqlstates={'check':'23514','unique':'23505','foreignKey':'23503'}
                        constraint_kind=case['id'].split('-')[0] if case['id'].startswith('check-') else 'unique' if case['id'].startswith('unique-') else 'foreignKey'
                        check(case['id']+'-source-declared-native-constraint-failed-in-backfill',observations.get('nativeSqlstate')==sqlstates[constraint_kind] and observations.get('nativeDataStepId')==plan['steps'][0]['id'] and observations.get('dataStepAttempt')==plan['steps'][0]['id'])
                    else:
                        check(case['id']+'-exact-effect-bound-reached-after-native-update',observations.get('boundError')=='backfill-effect-bound' and observations.get('dataStepId')==plan['steps'][0]['id'] and observations.get('rowsAfterRejectedBound')==[('a','filled'),('b','filled')])
                    connection.execute('RESET ROLE')
                    rows=connection.execute(sql.SQL('SELECT id,summary FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'notes'))).fetchall()
                    check(case['id']+'-paired-fill-and-tighten-roll-back-together',rows==[tuple(row) for row in case['expectedRows']])
                    nullability=connection.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='summary'",(cfg['schema'],)).fetchone()
                    check(case['id']+'-requiredness-ddl-rolls-back-with-fill',nullability==('YES',))
                    continue
                phase_calls=[]
                clock_witnesses=[]
                def count_data_step(_plan,step,transaction,calls=phase_calls):
                    if step['kind']=='backfill':calls.append(step['id'])
                    if step['kind']=='backfill' and case['id']=='clock-unknown-commit':
                        native=transaction.lease.connection
                        elevated=native.execute('SELECT session_user').fetchone()[0]
                        native.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(elevated)))
                        clock_witnesses.extend(native.execute(sql.SQL('SELECT summary,transaction_timestamp() FROM {} WHERE id=%s').format(sql.Identifier(cfg['schema'],'notes')),('a',)).fetchone())
                        native.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                run_host=host
                writer_finished=None;writer_outcome=None
                if case['id']=='all-null':
                    writer_callback,writer_finished,writer_outcome,writer_pid=_writer_barrier(dsn,cfg,sql.Identifier(cfg['schema'],'notes'))
                    def record_step(plan,step,count=count_data_step,callback=writer_callback):count(plan,step);callback(plan,step)
                    run_host=_HostProxy(host,on_data_step=record_step)
                elif case['id']=='clock-unknown-commit':
                    raised=[]
                    def after_commit(phase,raised_once=raised):
                        if phase['kind']=='backfill-tighten' and not raised_once:
                            raised_once.append(True);raise HostOutcomeUnknown('test-required-phase-commit-unknown')
                    run_host=_HostProxy(host,on_data_step=count_data_step,after_phase=after_commit)
                elif case['id']=='paired-finalize-retry':
                    run_host=_HostProxy(host,on_data_step=count_data_step,fail_finalize=True)
                    try:apply_migration_on_host(run_host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest,approval_id=approval.receipt_id)
                    except RuntimeError as error:check(case['id']+'-later-publication-interruption-observed',str(error)=='injected-finalize-interruption')
                    else:raise AssertionError('injected later finalize failure did not escape')
                    check(case['id']+'-fill-committed-once-before-later-failure',len(phase_calls)==1)
                    run_host=host
                if case['id']=='all-null':
                    applied=apply_migration_on_host(run_host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest,approval_id=approval.receipt_id)
                else:
                    applied=apply_migration_on_host(run_host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest,approval_id=approval.receipt_id)
                if case['id']=='all-null':
                    completed=writer_finished.wait(5)
                    if not completed or writer_outcome!=['not-null-after-pair']:
                        with psycopg.connect(dsn,autocommit=True) as monitor:
                            blocked=monitor.execute("SELECT wait_event_type,wait_event,pg_catalog.pg_blocking_pids(pid),state FROM pg_catalog.pg_stat_activity WHERE pid=%s",(writer_pid[0],)).fetchone()
                        raise AssertionError(f'direct writer did not resume with NOT NULL after pair: {writer_outcome!r}, blocked={blocked!r}')
                    check('all-null-direct-writer-held-until-atomic-pair-commit',True)
                if case['id'] in ('clock-unknown-commit','paired-finalize-retry'):
                    check(case['id']+'-paired-backfill-dispatched-once',len(phase_calls)==1)
                check(case['id']+'-public-host-runner-published',applied['status']=='committed' and applied['generation']==2)
                connection.execute('RESET ROLE')
                rows=connection.execute(sql.SQL('SELECT id,summary FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'notes'))).fetchall()
                expected_rows=[tuple(row) for row in case['expectedRows']]
                if case['id']=='clock-unknown-commit':
                    check(case['id']+'-transaction-clock-witness-captured-once',len(clock_witnesses)==2 and clock_witnesses[0]==clock_witnesses[1])
                    check(case['id']+'-clock-value-not-repeated-after-unknown-commit',len(phase_calls)==1 and rows[0][1]==clock_witnesses[0])
                elif case['id']=='date-literal':
                    expected_rows=[(row_id,value.isoformat() if hasattr(value,'isoformat') else value) for row_id,value in expected_rows]
                    rows=[(row_id,value.isoformat() if hasattr(value,'isoformat') else value) for row_id,value in rows]
                    if rows!=expected_rows:raise AssertionError(f"{case['id']} rows {rows!r} != {expected_rows!r}")
                else:
                    if rows!=expected_rows:raise AssertionError(f"{case['id']} rows {rows!r} != {expected_rows!r}")
                check(case['id']+'-native-existing-rows-match-fill-semantics',True)
                nullability=connection.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='summary'",(cfg['schema'],)).fetchone()
                check(case['id']+'-native-column-is-required-after-pair',nullability==('NO',))
                default=connection.execute("SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='summary'",(cfg['schema'],)).fetchone()
                check(case['id']+'-historical-fill-does-not-create-a-future-default',default==(None,))
                connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier('g01_alice')))
                try:connection.execute(sql.SQL('INSERT INTO {} (id,owner,summary) VALUES (%s,%s,NULL)').format(sql.Identifier(cfg['schema'],'notes')),('blocked-'+case['id'],'g01_alice'))
                except psycopg.errors.NotNullViolation:check(case['id']+'-second-session-null-writer-rejected',True)
                else:raise AssertionError('published G01 NOT NULL allowed a NULL insert')
        finally:
            if made_db:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
            for role in reversed(made_roles):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps({'server':server,'cases':len(fixture['cases']),'checks':checks},indent=2)+'\n')
print(json.dumps({'cases':len(fixture['cases']),'checks':checks},separators=(',',':')))
