# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-cohort G02 date/instant/UUID/boolean backfills on disposable PG."""
from __future__ import annotations

import argparse, hashlib, json, time, traceback
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextlib import contextmanager
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import CatalogError, MigrationRequest, PsycopgMigrationHost, apply_migration_on_host, apply_table_migration
from umf_access.lifecycle.host import HostOutcomeUnknown
from umf_access.unified import SessionIdentity, SessionPolicy, SyncSession, SyncTableWriter
from umf_codegen import compile_table_deployment, compile_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--fixture',type=Path,required=True)
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
deadline=time.monotonic()+180.0
fixture=json.loads(args.fixture.read_text())
assert fixture['version']=='umf.g02-temporal-native-fixture/1'
fixture_sha=hashlib.sha256(args.fixture.read_bytes()).hexdigest()
runner_sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
def bundle(source,cfg):
    text=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
    result=compile_table_deployment(text,configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']
def source_text(source):
    return source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))

def bounded_failure(error):
    frames=traceback.extract_tb(error.__traceback__)[-6:]
    return {'failedCheck':'case-assertion' if isinstance(error,AssertionError) else 'worker-exception',
            'sourceFrames':[{'file':Path(frame.filename).name,'line':frame.lineno,'function':frame.name} for frame in frames]}

column_order=('id','owner','birthDate','birthday','sourceInstant','occurredAt','sourceUuid','externalId','sourceActive','active')
cast={'birthDate':'date','birthday':'date','sourceInstant':'timestamptz','occurredAt':'timestamptz','sourceUuid':'uuid','externalId':'uuid','sourceActive':'bool','active':'bool'}
def table_rows(connection,cfg):
    expr=[]
    for name in column_order:
        expr.append(sql.Identifier(name)+sql.SQL('::pg_catalog.text') if name not in ('id','owner','sourceActive','active') else sql.Identifier(name)+sql.SQL('::pg_catalog.text'))
    # Boolean text output is normalized to PostgreSQL's stable "true"/"false" form.
    query=sql.SQL('SELECT ')+sql.SQL(',').join(expr)+sql.SQL(' FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'people'))
    return connection.execute(query).fetchall()
def observer_context(connection):
    return connection.execute("SELECT session_user,current_user,current_setting('row_security'),current_setting('role'),rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user").fetchone()
def matched_null_initial_rows(individuals):
    # Independent handwritten full-row oracle for the rollback fixture. Keep in
    # lockstep with the human-authored fixture values, never AST evaluation.
    alice,bob=individuals
    return [
        ('p1',alice,'2012-03-04',None,None,None,None,None,None,None),
        ('p2',bob,None,None,None,None,None,None,None,None),
        ('p3',alice,'1999-12-31',None,None,None,None,None,None,None),
    ]
def catalog_snapshot(connection,cfg):
    columns=connection.execute("SELECT column_name,is_nullable,column_default,data_type,udt_name,ordinal_position FROM information_schema.columns WHERE table_schema=%s AND table_name='people' ORDER BY ordinal_position",(cfg['schema'],)).fetchall()
    relation=connection.execute("SELECT c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relfilenode,c.relowner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname='people'",(cfg['schema'],)).fetchone()
    return columns,relation
def metadata_snapshot(connection,cfg):
    schema=sql.Identifier(cfg['schema'])
    history=connection.execute(sql.SQL('SELECT position,migration_id,predecessor_entry_digest,plan_digest,entry_digest,payload FROM {} ORDER BY position').format(sql.Identifier(cfg['schema'],'umf_lifecycle_history'))).fetchall()
    progress_relation=connection.execute('SELECT pg_catalog.to_regclass(%s)',(cfg['schema']+'.umf_lifecycle_progress',)).fetchone()[0]
    progress=None
    if progress_relation is not None:
        progress=connection.execute(sql.SQL('SELECT migration_id,plan_digest,expected_head,file_digest,phase_index,state,phase_digest,completed_steps,prefix_witness FROM {} ORDER BY migration_id').format(sql.Identifier(cfg['schema'],'umf_lifecycle_progress'))).fetchall()
    return history,progress

def run_case(index,case_input,cfg_input,individuals_input,role_by_fixture_input,initial_bundle_input,initial_input,database_name):
    case=json.loads(json.dumps(case_input))
    cfg=json.loads(json.dumps(cfg_input))
    individuals=tuple(individuals_input)
    role_by_fixture=json.loads(json.dumps(role_by_fixture_input))
    initial_bundle=json.loads(json.dumps(initial_bundle_input))
    initial=json.loads(json.dumps(initial_input))
    owner,person,batch=cfg['ownerRole'],cfg['personRole'],cfg['batchRole']
    checks=[]
    def check(name,condition):
        assert condition,name
        checks.append(name)
    db=database_name;made_db=False;create_attempted=False;connection=None;cleanup_verified=False
    try:
        with psycopg.connect(args.dsn,autocommit=True) as admin:
            try:
                create_attempted=True
                admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db)));made_db=True
                dsn=conninfo.make_conninfo(args.dsn,dbname=db)
                connection=psycopg.connect(dsn,autocommit=True)
                connection.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(owner)))
                with connection.transaction():
                    connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                    connection.execute('SET LOCAL search_path=pg_catalog')
                    installed=apply_table_migration(connection,initial,approved_digest=initial['digest'],expected_head=None,person_roles=individuals)
                connection.execute('SET TIME ZONE UTC')
                for row in case['initialRows']:
                    names=list(column_order)
                    placeholders=[sql.SQL('%s::pg_catalog.')+sql.Identifier(cast[name]) if name in cast else sql.SQL('%s::pg_catalog.text') for name in names]
                    values=[role_by_fixture[row['owner']] if name=='owner' else row[name] for name in names]
                    connection.execute(sql.SQL('INSERT INTO {} ({}) VALUES ({})').format(sql.Identifier(cfg['schema'],'people'),sql.SQL(',').join(map(sql.Identifier,names)),sql.SQL(',').join(placeholders)),values)
                next_bundle=bundle(case['source'],cfg);spec=case['plan']
                compiled=compile_table_migration(migration_id=spec['id'],predecessor={'id':initial['id'],'digest':initial['digest']},previous_bundle=initial_bundle,next_bundle=next_bundle,options=spec['options'])
                assert compiled['status']=='compiled',compiled
                plan=compiled['plan'];check(case['id']+'-verified-0.4-plan',plan['version']=='umf.table-migration/0.4' and plan['executionProfile']['version']=='umf.table-migration-execution/0.3')
                old_commands=json.loads(case['initialSource']['utf8'])['modules'][0]['extensions']['umf.tables']['commands']
                new_commands=json.loads(case['source']['utf8'])['modules'][0]['extensions']['umf.tables']['commands']
                check(case['id']+'-unchanged-explicit-target-.1-create',len(old_commands)==1 and old_commands==new_commands[:1] and old_commands[0]['id']=='create_person')
                selected=spec['options']['backfills'][0]['operation']
                check(case['id']+'-selected-0.2-backfill-only',new_commands[1]['id']==selected and len(spec['options']['backfills'])==1)
                head=installed['headDigest'];file_digest=hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                evidence=hashlib.sha256(('g02-temporal-native:'+case['id']+':postgresql18/0.1').encode()).hexdigest()
                connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)));connection.execute('SET search_path=pg_catalog')
                host=PsycopgMigrationHost(connection,person_roles=individuals,target_profile='postgresql18/0.1',installation_id='g02-temporal-'+case['id'])
                approval=host.record_approval(MigrationRequest(plan,head,file_digest),decision='approved',qualification_profile='postgresql18/0.1',evidence_digest=evidence)
                if case.get('expectedFailure')=='null-result':
                    from umf_access.lifecycle.witness import _capture_witness
                    # A separate trusted observer bypasses FORCE RLS for both
                    # snapshots. The host connection remains under the owner
                    # role and pg_catalog search_path for all lifecycle effects.
                    with psycopg.connect(dsn,autocommit=True) as observer:
                        observer.execute('SET TIME ZONE UTC')
                        observer.execute('SET default_transaction_read_only=on')
                        observer.execute('SET row_security=on')
                        before_identity=observer_context(observer)
                        check(case['id']+'-trusted-observer-before',before_identity[0]==before_identity[1] and (before_identity[4] or before_identity[5]) and before_identity[2]=='on' and before_identity[3]=='none')
                        before_rows=table_rows(observer,cfg);before_catalog=catalog_snapshot(observer,cfg);before_meta=metadata_snapshot(observer,cfg)
                        expected_before=matched_null_initial_rows(individuals)
                        check(case['id']+'-initial-full-row-manual-oracle',before_rows==expected_before and len(before_rows)==3)
                        before_witness=_capture_witness(observer,next_bundle)
                        host_identity_before=connection.execute("SELECT session_user,current_user,current_setting('role')").fetchone()
                        check(case['id']+'-host-remains-owner-before-effect',host_identity_before[0]==before_identity[0] and host_identity_before[1]==owner and host_identity_before[2]==owner)
                        try:
                            apply_migration_on_host(host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence,approval_id=approval.receipt_id)
                        except CatalogError as error:
                            check(case['id']+'-private-null-result-error',str(error)=='derived-backfill-native-error' and error.sqlstate=='22012')
                        except HostOutcomeUnknown:
                            raise AssertionError('Known NULL row-expression failure was reported as an unknown outcome')
                        else:
                            raise AssertionError('Matched NULL date result unexpectedly committed')
                        host_identity_after=connection.execute("SELECT session_user,current_user,current_setting('role')").fetchone()
                        check(case['id']+'-host-remains-owner-after-effect',host_identity_after==host_identity_before)
                        after_identity=observer_context(observer)
                        after_rows=table_rows(observer,cfg);after_catalog=catalog_snapshot(observer,cfg);after_meta=metadata_snapshot(observer,cfg)
                        check(case['id']+'-trusted-observer-same-identity',after_identity==before_identity and after_identity[0]==after_identity[1] and (after_identity[4] or after_identity[5]) and after_identity[3]=='none')
                        check(case['id']+'-full-row-snapshot-unchanged',before_rows==after_rows and after_rows==expected_before and len(after_rows)==3)
                        check(case['id']+'-catalog-snapshot-unchanged',before_catalog==after_catalog and next(column for column in after_catalog[0] if column[0]=='birthday')[1]=='YES')
                        check(case['id']+'-history-unchanged-and-no-prefailure-progress',before_meta[0]==after_meta[0] and before_meta[1] is None)
                        progress=after_meta[1]
                        check(case['id']+'-failed-phase-keeps-ready-receipt',progress is not None and len(progress)==1 and progress[0][0]==plan['id'] and progress[0][1]==plan['digest'] and progress[0][2]==head and progress[0][3]==file_digest and progress[0][4]==0 and progress[0][5]=='ready' and progress[0][6]==hashlib.sha256(b'').hexdigest() and progress[0][7]==[] and progress[0][8]==before_witness)
                        connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(individuals[0])))
                        try:connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(cfg['schema'],'umf_lifecycle_head'))).fetchall()
                        except psycopg.errors.InsufficientPrivilege as error:check(case['id']+'-clients-remain-fenced-after-failed-phase',error.sqlstate=='42501')
                        else:raise AssertionError('Failed matched-NULL phase released the generation fence')
                        finally:connection.execute('RESET ROLE')
                    return {'caseId':case['id'],'database':db,'status':'PASS_EXPECTED_ROLLBACK_AND_CLEANED','databaseCleanup':'VERIFIED','checks':checks}
                applied=apply_migration_on_host(host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence,approval_id=approval.receipt_id)
                check(case['id']+'-public-host-committed',applied['status']=='committed' and applied['generation']==2)
                connection.execute('RESET ROLE')
                observed=table_rows(connection,cfg)
                expected=[tuple(role_by_fixture.get(value,value) if index==1 else ('true' if value is True else 'false' if value is False else value) for index,value in enumerate(row)) for row in case['expectedRows']]
                check(case['id']+'-independent-full-row-oracle',observed==expected and len(observed)==3)
                columns,relation=catalog_snapshot(connection,cfg)
                target=spec['options']['backfills'][0]['column']['element']
                target_column=next(column for column in columns if column[0]==target)
                check(case['id']+'-target-not-null-no-default',target_column[1]=='NO' and target_column[2] is None)
                check(case['id']+'-native-rls-enabled-forced',relation[2:4]==(True,True))
                history,progress=metadata_snapshot(connection,cfg)
                check(case['id']+'-history-generation-advanced-once-and-progress-cleaned',len(history)==2 and progress is None)
                for role,expected_count in ((individuals[0],2),(individuals[1],1),(batch,3)):
                    connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(role)))
                    try:
                        visible=connection.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(cfg['schema'],'people'))).fetchone()[0]
                        check(case['id']+'-native-RLS-'+role,visible==expected_count)
                        try:connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(cfg['schema'],'umf_lifecycle_approvals'))).fetchall()
                        except psycopg.errors.InsufficientPrivilege as error:check(case['id']+'-approval-ACL-'+role,error.sqlstate=='42501')
                        else:raise AssertionError('Non-owner role read lifecycle approval relation')
                    finally:connection.execute('RESET ROLE')
                # Execute the unchanged retained .1 create through the ordinary
                # generated table-writer path. currentPrincipal binds the
                # authenticated role; no fixture value is rewritten at runtime.
                next_source=json.loads(next_bundle['source']['utf8'])
                module=next_source['modules'][0];table_spec=module['extensions']['umf.tables']['tables'][0]
                element_types={element['id']:element.get('scalarType') for element in module['elements'] if element['kind']=='field'}
                binding={'version':'umf.raw-read-binding/0.1','schema':cfg['schema'],
                         'modelJson':next_bundle['source']['utf8'],'modelSha256':next_bundle['sourceDigest'],
                         'tables':[{'logical':['demo','Person'],'native':'people','key':['id'],
                                    'columns':[{'logical':column['field']['element'],'native':column['name'],
                                                'carrier':element_types[column['field']['element']],
                                                'nullable':next(c for c in next_bundle['expectedCatalog']['columns'] if c['name']==column['name'])['nullable']}
                                               for column in table_spec['columns']]}],
                         'relationships':[],
                         'nativeLifecycle':{'version':'umf.table-lifecycle/0.1','module':'demo',
                                            'configurationDigest':next_bundle['configurationDigest'],
                                            'deploymentDigest':next_bundle['bundleDigest']}}
                policy=SessionPolicy({'alice':individuals[0],'bob':individuals[1]},{'batch':batch},cfg['schema'],catalog_only=True)
                @contextmanager
                def factory(_identity):
                    with psycopg.connect(dsn,autocommit=True) as client_connection:yield client_connection
                writer=SyncTableWriter(SyncSession(factory,policy),next_bundle,applied['installationReference'],binding,outcome_secret=b'g02 temporal ordinary write secret 0000')
                create=writer.write(SessionIdentity('person','alice'),'create_person',{},key='create-'+case['id'])
                check(case['id']+'-retained-.1-command-executed-through-ordinary-writer',create['status']=='applied' and create['result']['items']==[{'affectedCount':{'integerToken':'1'},'rows':[]}])
                selected_columns=sql.SQL(',').join(sql.Identifier(name)+sql.SQL('::pg_catalog.text') for name in ('owner','birthday','occurredAt','externalId','active'))
                observed_created_row=connection.execute(sql.SQL('SELECT {} FROM {} WHERE {}=%s').format(selected_columns,sql.Identifier(cfg['schema'],'people'),sql.Identifier('id')),('command-id',)).fetchone()
                check(case['id']+'-ordinary-create-current-principal-and-explicit-targets',observed_created_row==(individuals[0],'2000-01-01','2000-01-02 03:04:05+00','00000000-0000-4000-8000-000000000001','false'))

                return {'caseId':case['id'],'database':db,'status':'PASS_AND_CLEANED','databaseCleanup':'VERIFIED','checks':checks}
            finally:
                cleanup_error=None
                if connection is not None:
                    try:connection.close()
                    except Exception as error:cleanup_error=error
                if made_db:
                    try:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
                    except Exception as error:
                        if cleanup_error is None:cleanup_error=error
                if cleanup_error is not None:raise cleanup_error
                cleanup_verified=made_db
    except BaseException as error:
        return {'caseId':case_input.get('id','unknown'),'database':db,
                'status':'FAILED','errorType':type(error).__name__,
                **bounded_failure(error),
                'databaseCleanup':'VERIFIED' if cleanup_verified else ('UNKNOWN' if create_attempted else 'NOT_CREATED'),
                'checks':checks}


def main():
    expected_case_ids=[
        'temporal-birthday-date-coalesce',
        'temporal-instant-copy-coalesce',
        'temporal-uuid-copy-coalesce',
        'temporal-boolean-copy-coalesce',
        'temporal-matched-null-date-rollback',
    ]
    cases=fixture['cases']
    case_ids=[case.get('id') for case in cases]
    database_names=['g02t_'+uuid4().hex[:9] for _ in expected_case_ids]
    case_results=[{'caseId':case_id,'database':database_names[index],'status':'UNRUN','databaseCleanup':'NOT_CREATED','checks':[]} for index,case_id in enumerate(expected_case_ids)]
    server=None;server_num=None;created_roles=[];role_cleanup='NOT_NEEDED';role_cleanup_error=None
    executor=None;active={};next_index=0;stop_submission=False;deadline_hit=False;unknown_active=False
    fatal_type=None
    try:
        assert len(cases)==5 and case_ids==expected_case_ids and len(set(case_ids))==5, 'G02 original five-case roster differs'
        assert len(database_names)==5 and len(set(database_names))==5, 'G02 worker database names are not unique'
        tag=uuid4().hex[:9]
        cfg={**fixture['configuration'],'ownerRole':'g02_to_'+tag,'personRole':'g02_tp_'+tag,'batchRole':'g02_tb_'+tag}
        owner,person,batch=cfg['ownerRole'],cfg['personRole'],cfg['batchRole']
        individuals=('g02_ta_'+tag,'g02_tz_'+tag)
        role_by_fixture={'g02_alice':individuals[0],'g02_bob':individuals[1]}
        roles=(owner,person,batch,*individuals)
        initial_texts=[source_text(case['initialSource']).encode('utf-8') for case in cases]
        assert all(case['initialSource'] is not None for case in cases), 'G02 case is missing its initial source'
        assert initial_texts and all(text==initial_texts[0] for text in initial_texts), 'G02 cases do not share exact initial source bytes'
        with psycopg.connect(args.dsn,autocommit=True) as admin:
            server=admin.execute('SELECT pg_catalog.version()').fetchone()[0]
            server_num=admin.execute("SELECT current_setting('server_version_num')").fetchone()[0]
            assert 'PostgreSQL 18.' in server,server
            for role in roles:
                admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)))
                created_roles.append(role)
            for individual in individuals:
                admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(person),sql.Identifier(individual)))
            initial_bundle=bundle(cases[0]['initialSource'],cfg)
            initial_result=compile_table_migration(migration_id='g02-temporal-initial-001',predecessor=None,previous_bundle=None,next_bundle=initial_bundle)
            assert initial_result['status']=='compiled',initial_result
            initial=initial_result['plan']

        work_remaining=lambda:max(0.0,deadline-time.monotonic()-5.0)
        if work_remaining()<=0:
            deadline_hit=True
            stop_submission=True
        else:
            executor=ThreadPoolExecutor(max_workers=2,thread_name_prefix='g02-temporal-case')
        while executor is not None and (active or (next_index<len(cases) and not stop_submission)):
            while not stop_submission and len(active)<2 and next_index<len(cases):
                if work_remaining()<=0:
                    deadline_hit=True;stop_submission=True
                    break
                index=next_index;next_index+=1
                case_results[index].update({'database':database_names[index],'status':'RUNNING'})
                case_json=json.loads(json.dumps(cases[index]))
                cfg_json=json.loads(json.dumps(cfg))
                bundle_json=json.loads(json.dumps(initial_bundle))
                plan_json=json.loads(json.dumps(initial))
                roles_json=json.loads(json.dumps(role_by_fixture))
                future=executor.submit(run_case,index,case_json,cfg_json,list(individuals),roles_json,bundle_json,plan_json,database_names[index])
                active[future]=index
            if stop_submission and next_index<len(cases):
                for index in range(next_index,len(cases)):
                    case_results[index].update({'status':'UNRUN_AFTER_FAILURE' if not deadline_hit else 'UNRUN_DEADLINE'})
                next_index=len(cases)
            if not active:
                break
            timeout=work_remaining()
            if timeout<=0:
                deadline_hit=True;stop_submission=True
                for future,index in list(active.items()):
                    if not future.done() and not future.running() and future.cancel():
                        case_results[index].update({'status':'UNRUN_CANCELLED','databaseCleanup':'NOT_CREATED'})
                        del active[future]
                    else:
                        case_results[index].update({'status':'UNKNOWN_ACTIVE_AFTER_DEADLINE','databaseCleanup':'UNKNOWN'})
                        unknown_active=True
                for index in range(next_index,len(cases)):
                    case_results[index].update({'status':'UNRUN_DEADLINE'})
                next_index=len(cases)
                break
            done,_=wait(tuple(active),timeout=timeout,return_when=FIRST_COMPLETED)
            if not done:
                deadline_hit=True;stop_submission=True
                for future,index in list(active.items()):
                    if not future.done() and not future.running() and future.cancel():
                        case_results[index].update({'status':'UNRUN_CANCELLED','databaseCleanup':'NOT_CREATED'})
                        del active[future]
                    else:
                        case_results[index].update({'status':'UNKNOWN_ACTIVE_AFTER_DEADLINE','databaseCleanup':'UNKNOWN'})
                        unknown_active=True
                for index in range(next_index,len(cases)):
                    case_results[index].update({'status':'UNRUN_DEADLINE'})
                next_index=len(cases)
                break
            failed_this_batch=False
            for future in done:
                index=active.pop(future)
                try:
                    outcome=future.result()
                except BaseException as error:
                    outcome={'caseId':case_ids[index],'database':database_names[index],
                             'status':'FAILED_WORKER_EXCEPTION','errorType':type(error).__name__,
                             **bounded_failure(error),
                             'databaseCleanup':'UNKNOWN','checks':[]}
                case_results[index]=outcome
                if outcome.get('status') not in ('PASS_AND_CLEANED','PASS_EXPECTED_ROLLBACK_AND_CLEANED'):
                    failed_this_batch=True
            if failed_this_batch:
                stop_submission=True
                for index in range(next_index,len(cases)):
                    case_results[index].update({'status':'UNRUN_AFTER_FAILURE'})
                next_index=len(cases)
                for future,index in list(active.items()):
                    if not future.done() and not future.running() and future.cancel():
                        case_results[index].update({'status':'UNRUN_CANCELLED','databaseCleanup':'NOT_CREATED'})
                        del active[future]

        if executor is not None and not unknown_active:
            executor.shutdown(wait=True,cancel_futures=True)
            executor=None
    except BaseException as error:
        fatal_type=type(error).__name__
        fatal_failure=bounded_failure(error)
        stop_submission=True
        for index in range(next_index,len(case_results)):
            if case_results[index]['status']=='UNRUN':case_results[index]['status']='UNRUN_AFTER_SETUP_FAILURE'
        if executor is not None:
            active_indices=set(active.values())
            for future,index in list(active.items()):
                if not future.done() and not future.running() and future.cancel():
                    case_results[index].update({'status':'UNRUN_CANCELLED','databaseCleanup':'NOT_CREATED'})
                    del active[future]
                else:
                    case_results[index].update({'status':'UNKNOWN_ACTIVE_AFTER_FAILURE','databaseCleanup':'UNKNOWN'})
                    unknown_active=True
            for index,item in enumerate(case_results):
                if item.get('status')=='RUNNING' and index not in active_indices:
                    item.update({'status':'UNRUN_SUBMISSION_FAILURE','databaseCleanup':'NOT_CREATED'})
            if not unknown_active:
                executor.shutdown(wait=True,cancel_futures=True)
                executor=None

    all_workers_terminal=not unknown_active and not active
    databases_cleanup_known=all(item.get('databaseCleanup') in ('VERIFIED','NOT_CREATED') for item in case_results)
    if created_roles:
        if not all_workers_terminal or not databases_cleanup_known:
            role_cleanup='SKIPPED_UNKNOWN_WORKER_OR_DATABASE_CLEANUP'
        elif deadline-time.monotonic()<=5.0:
            role_cleanup='SKIPPED_DEADLINE'
        else:
            try:
                with psycopg.connect(args.dsn,autocommit=True) as cleanup_admin:
                    remaining_ms=max(1,min(120000,int((deadline-time.monotonic()-1.0)*1000)))
                    cleanup_admin.execute('SELECT pg_catalog.set_config(\'statement_timeout\',%s,false)',(str(remaining_ms)+'ms',))
                    cleanup_admin.execute(sql.SQL('DROP ROLE {}').format(sql.SQL(',').join(sql.Identifier(role) for role in reversed(created_roles))))
                role_cleanup='VERIFIED'
            except BaseException as error:
                role_cleanup='FAILED_OR_UNKNOWN';role_cleanup_error=type(error).__name__
                role_cleanup_failure=bounded_failure(error)
    elif fatal_type is not None:
        role_cleanup='NO_SHARED_ROLES_CREATED'

    all_pass=(fatal_type is None and not deadline_hit and not unknown_active
              and len(case_results)==5 and [item.get('caseId') for item in case_results]==expected_case_ids
              and all(item.get('status') in ('PASS_AND_CLEANED','PASS_EXPECTED_ROLLBACK_AND_CLEANED')
                      and item.get('databaseCleanup')=='VERIFIED' for item in case_results)
              and role_cleanup in ('VERIFIED','NOT_NEEDED'))
    flattened_checks=[check_name for item in case_results for check_name in item.get('checks',[])]
    report={'profile':'umf.g02-temporal-five-case-parallel-native/1',
            'status':'PASS_G02_TEMPORAL_FIVE_CASES' if all_pass else 'FAIL_OR_UNKNOWN',
            'server':server,'serverVersionNum':server_num,'cases':len(case_results),
            'caseIds':expected_case_ids,'caseResults':case_results,
            'maxWorkers':2,'peakOverlappingCodegenVmHardMemoryBytes':2*512*1024*1024,
            'sharedRolesCleanup':role_cleanup,'sharedRolesCleanupErrorType':role_cleanup_error,
            'githubRunnerEnvironmentCapUnchanged':True,
            'deadlineSeconds':180,'schedulingDeadlineReserveSeconds':5,'deadlineExceeded':deadline_hit,
            'cleanupUnknown':unknown_active or not databases_cleanup_known or (bool(created_roles) and role_cleanup!='VERIFIED'),
            'setupErrorType':fatal_type,'fixtureSha256':fixture_sha,'runnerSha256':runner_sha,
            'provenance':fixture['provenance'],'packages':{name:version(name) for name in ('umf-access','umf-codegen','umf-weft','umf-core')},
            'checks':flattened_checks}
    if fatal_type is not None:
        report['setupFailure']=fatal_failure
    if role_cleanup=='FAILED_OR_UNKNOWN':
        report['sharedRolesCleanupFailure']=role_cleanup_failure
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2)+'\n')
    if unknown_active and executor is not None:
        # Thread cancellation does not stop running work. Keep the failure receipt
        # durable, then let the existing outer TERM/KILL bound end this process.
        executor.shutdown(wait=True,cancel_futures=True)
    if not all_pass:
        raise SystemExit(1)

main()
