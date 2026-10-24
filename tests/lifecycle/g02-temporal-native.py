# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-cohort G02 date/instant/UUID/boolean backfills on disposable PG."""
from __future__ import annotations

import argparse, hashlib, json
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
fixture=json.loads(args.fixture.read_text())
assert fixture['version']=='umf.g02-temporal-native-fixture/1'
fixture_sha=hashlib.sha256(args.fixture.read_bytes()).hexdigest()
runner_sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
def bundle(source,cfg):
    text=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
    result=compile_table_deployment(text,configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']

column_order=('id','owner','birthDate','birthday','sourceInstant','occurredAt','sourceUuid','externalId','sourceActive','active')
cast={'birthDate':'date','birthday':'date','sourceInstant':'timestamptz','occurredAt':'timestamptz','sourceUuid':'uuid','externalId':'uuid','sourceActive':'bool','active':'bool'}
def table_rows(connection,cfg):
    expr=[]
    for name in column_order:
        expr.append(sql.Identifier(name)+sql.SQL('::pg_catalog.text') if name not in ('id','owner','sourceActive','active') else sql.Identifier(name)+sql.SQL('::pg_catalog.text'))
    # Boolean text output is normalized to PostgreSQL's stable "true"/"false" form.
    query=sql.SQL('SELECT ')+sql.SQL(',').join(expr)+sql.SQL(' FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'people'))
    return connection.execute(query).fetchall()
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

with psycopg.connect(args.dsn,autocommit=True) as admin:
    server=admin.execute('SELECT pg_catalog.version()').fetchone()[0]
    server_num=admin.execute("SELECT current_setting('server_version_num')").fetchone()[0]
    assert 'PostgreSQL 18.' in server,server
    for case in fixture['cases']:
        tag=uuid4().hex[:9];db='g02t_'+tag
        cfg={**fixture['configuration'],'ownerRole':'g02_to_'+tag,'personRole':'g02_tp_'+tag,'batchRole':'g02_tb_'+tag}
        owner,person,batch=cfg['ownerRole'],cfg['personRole'],cfg['batchRole']
        individuals=('g02_ta_'+tag,'g02_tz_'+tag)
        role_by_fixture={'g02_alice':individuals[0],'g02_bob':individuals[1]}
        roles=(owner,person,batch,*individuals);created_roles=[];made_db=False
        try:
            for role in roles:
                admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created_roles.append(role)
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
                    before_rows=table_rows(connection,cfg);before_catalog=catalog_snapshot(connection,cfg);before_meta=metadata_snapshot(connection,cfg)
                    before_witness=_capture_witness(connection,next_bundle)
                    try:
                        apply_migration_on_host(host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence,approval_id=approval.receipt_id)
                    except CatalogError as error:
                        check(case['id']+'-private-null-result-error',str(error)=='derived-backfill-native-error' and error.sqlstate=='22012')
                    except HostOutcomeUnknown:
                        raise AssertionError('Known NULL row-expression failure was reported as an unknown outcome')
                    else:
                        raise AssertionError('Matched NULL date result unexpectedly committed')
                    connection.execute('RESET ROLE')
                    after_rows=table_rows(connection,cfg);after_catalog=catalog_snapshot(connection,cfg);after_meta=metadata_snapshot(connection,cfg)
                    check(case['id']+'-full-row-snapshot-unchanged',before_rows==after_rows and len(before_rows)==3)
                    check(case['id']+'-catalog-snapshot-unchanged',before_catalog==after_catalog and next(column for column in after_catalog[0] if column[0]=='birthday')[1]=='YES')
                    check(case['id']+'-history-unchanged-and-no-prefailure-progress',before_meta[0]==after_meta[0] and before_meta[1] is None)
                    progress=after_meta[1]
                    check(case['id']+'-failed-phase-keeps-ready-receipt',progress is not None and len(progress)==1 and progress[0][0]==plan['id'] and progress[0][1]==plan['digest'] and progress[0][2]==head and progress[0][3]==file_digest and progress[0][4]==0 and progress[0][5]=='ready' and progress[0][6]==hashlib.sha256(b'').hexdigest() and progress[0][7]==[] and progress[0][8]==before_witness)
                    connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(individuals[0])))
                    try:connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(cfg['schema'],'umf_lifecycle_head'))).fetchall()
                    except psycopg.errors.InsufficientPrivilege as error:check(case['id']+'-clients-remain-fenced-after-failed-phase',error.sqlstate=='42501')
                    else:raise AssertionError('Failed matched-NULL phase released the generation fence')
                    finally:connection.execute('RESET ROLE')
                    continue
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
        finally:
            cleanup_error=None
            if made_db:
                try:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
                except Exception as error:cleanup_error=error
            for role in reversed(created_roles):
                try:admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
                except Exception as error:
                    if cleanup_error is None:cleanup_error=error
            if cleanup_error is not None:raise cleanup_error
report={'server':server,'serverVersionNum':server_num,'cases':len(fixture['cases']),'fixtureSha256':fixture_sha,'runnerSha256':runner_sha,'provenance':fixture['provenance'],'packages':{name:version(name) for name in ('umf-access','umf-codegen','weft-sql','umf-core')},'checks':checks}
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'serverVersionNum':server_num,'cases':len(fixture['cases']),'checks':checks},separators=(',',':')))
