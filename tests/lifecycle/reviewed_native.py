# SPDX-License-Identifier: MIT OR Apache-2.0
"""PostgreSQL acceptance for source-reviewed table migration v0.2."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_access.lifecycle import CatalogError, apply_mixed_migration, apply_table_migration
from umf_codegen import compile_table_deployment, compile_table_migration, verify_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--fixture',type=Path,default=Path('/private/tmp/umf-reviewed-native-fixture.json'))
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
fixture=json.loads(args.fixture.read_text())
assert fixture['version']=='umf.praxis.reviewed-native-fixture/1'
checks=[]
def check(name,condition):
    assert isinstance(name,str) and type(condition) is bool,(name,condition)
    assert condition,name
    checks.append(name)

principal_data=fixture['principals'];alice=principal_data['alice'];bob=principal_data['bob'];persons=(alice,bob)
first_cfg=fixture['cases'][0]['configuration'] if fixture['cases'] else fixture['negativeCases'][0]['configuration']
owner=first_cfg['ownerRole'];person=first_cfg['personRole'];batch=first_cfg['batchRole'];billing=first_cfg['groupRoles']['billing_admin']
def deploy(source,cfg):
    result=compile_table_deployment(json.dumps(source,separators=(',',':')),configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']
def compile_plan(identifier,predecessor,previous,next_bundle,options=None):
    result=compile_table_migration(migration_id=identifier,predecessor=predecessor,
        previous_bundle=previous,next_bundle=next_bundle,**({'options':options} if options is not None else {}))
    return result

roles=[owner,person,batch,billing,alice,bob]
with psycopg.connect(args.dsn,autocommit=True) as admin:
    server_version=admin.execute('SELECT pg_catalog.version()').fetchone()[0]
    created=[];schemas=[]
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        for individual in persons:
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(person),sql.Identifier(individual)))
        admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(billing),sql.Identifier(alice)))

        for case in fixture['cases']:
            cfg=case['configuration'];schema=cfg['schema'];initial_bundle=deploy(case['initialSource'],cfg)
            initial_result=compile_plan(case['id']+'-001',None,None,initial_bundle)
            assert initial_result['status']=='compiled',initial_result
            initial_plan=initial_result['plan']
            admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
            schemas.append(schema)
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                admin.execute('SET LOCAL search_path=pg_catalog')
                applied=apply_table_migration(admin,initial_plan,approved_digest=initial_plan['digest'],
                    expected_head=None,person_roles=persons)
            check(case['id']+'-initial-generation-installed',applied['generation']==1)
            initial_head=applied['headDigest']
            current_bundle=initial_bundle;predecessor={'id':initial_plan['id'],'digest':initial_plan['digest']};head=applied['headDigest']
            admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)));admin.execute('SET search_path=pg_catalog')
            try:
                for index,transition in enumerate(case['transitions']):
                    print('native-case',case['id'],transition['id'],flush=True)
                    next_bundle=deploy(transition['source'],cfg)
                    result=compile_plan(transition['id'],predecessor,current_bundle,next_bundle,transition['options'])
                    assert result['status']=='compiled',result
                    plan=result['plan']
                    verified=verify_table_migration(plan)
                    check(case['id']+'-'+transition['id']+'-embedded-plan-roundtrip',verified==plan)

                    if case['id'] in ('remove-index','check-lifecycle','foreign-key-lifecycle'):
                        unreviewed_options=copy.deepcopy(transition['options']);unreviewed_options['reviewedChanges']=[]
                        unreviewed=compile_plan(transition['id']+'-unreviewed',predecessor,current_bundle,next_bundle,unreviewed_options)
                        check(case['id']+'-'+transition['id']+'-missing-review-marker-refuses',unreviewed['status']=='blocked' and any(d['code']=='destructive_change_unreviewed' for d in unreviewed.get('diagnostics',[])))

                    if case['id']=='policy-drop-court' and index==0:
                        policy_step=next((i for i,step in enumerate(plan['steps']) if step['sql'].startswith('ALTER POLICY "umf_person_select"')),None)
                        drop_step=next((i for i,step in enumerate(plan['steps']) if 'DROP COLUMN "court"' in step['sql']),None)
                        check('successor-policy-rewrite-precedes-native-column-drop',policy_step is not None and drop_step is not None and policy_step<drop_step)
                        try:
                            with admin.transaction():
                                admin.execute(sql.SQL('ALTER TABLE {} DROP COLUMN court').format(sql.Identifier(schema,'matters')))
                        except psycopg.errors.DependentObjectsStillExist:
                            check('unchanged-native-policy-dependency-blocks-column-drop',True)
                        else:
                            raise AssertionError('PostgreSQL allowed DROP COLUMN while the old RLS policy still referenced court')

                    if case['id']=='drop-court' and index==0:
                        unreviewed=compile_plan('drop-unreviewed',{**predecessor,'digest':'a'*64},current_bundle,next_bundle)
                        # v0.2 refuses unmarked destructive changes before any native action.
                        check('drop-without-review-marker-refuses',unreviewed['status']=='blocked' and any(d['code']=='destructive_change_unreviewed' for d in unreviewed.get('diagnostics',[])))
                        wrong=copy.deepcopy(transition['options']);wrong['reviewedChanges'][0]['newDigest']='0'*64
                        stale_marker=compile_plan(transition['id']+'-wrong-marker',predecessor,current_bundle,next_bundle,wrong)
                        check('wrong-reviewed-marker-refuses',stale_marker['status']=='blocked')
                        try:apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head='a'*64,person_roles=persons,file_digest='c'*64)
                        except CatalogError as error:check('wrong-history-head-refuses',str(error)=='ledger-head-mismatch')
                        else:raise AssertionError('wrong history head accepted')
                        forged=copy.deepcopy(plan);forged['digest']='f'*64
                        try:verify_table_migration(forged)
                        except (ValueError,TypeError):check('stale-plan-digest-refuses',True)
                        else:raise AssertionError('stale migration digest accepted')
                        staged=apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head=head,
                            person_roles=persons,file_digest='c'*64,stop_after_phase=1)
                        check('reviewed-drop-prefix-is-durable-but-unpublished',staged['status']=='in-progress' and staged['ledgerAdvanced'] is False)
                        try:apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head=head,person_roles=persons,file_digest='d'*64)
                        except CatalogError as error:
                            check('changed-migration-file-digest-refuses',str(error) in ('migration-file-digest-conflict','progress-binding-mismatch'))
                            check('changed-file-refusal-keeps-durable-prefix',admin.execute(sql.SQL('SELECT count(*) FROM {} WHERE migration_id=%s').format(sql.Identifier(schema,'umf_lifecycle_progress')),(plan['id'],)).fetchone()==(1,))
                        else:raise AssertionError('changed source file digest accepted during resume')
                        outcome=apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head=head,person_roles=persons,file_digest='c'*64)
                    elif case.get('nativeFailure'):
                        if case['nativeFailure']=='not-null':
                            admin.execute('RESET ROLE')
                            injected=admin.execute(sql.SQL('UPDATE {} SET close_date=NULL WHERE matter_id=1').format(sql.Identifier(schema,'matters')))
                            check('not-null-failure-injected-real-null-row',injected.rowcount==1)
                            admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        try:apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head=head,person_roles=persons,file_digest='e'*64)
                        except CatalogError as error:
                            check(case['id']+'-native-failure-observed',str(error) in ('migration-outcome-unknown-observe-progress','catalog-verification-failed'))
                            check(case['id']+'-failed-phase-not-published',admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'umf_lifecycle_history'))).fetchone()==(1,))
                            check(case['id']+'-failed-phase-keeps-original-head',admin.execute(sql.SQL('SELECT entry_digest FROM {} WHERE position=1').format(sql.Identifier(schema,'umf_lifecycle_history'))).fetchone()==(initial_head,))
                            if case['nativeFailure']=='not-null':
                                admin.execute('RESET ROLE')
                                null_row=admin.execute(sql.SQL('SELECT close_date IS NULL FROM {} WHERE matter_id=1').format(sql.Identifier(schema,'matters'))).fetchone()
                                admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                                check('not-null-null-row-retained-after-rollback',null_row==(True,))
                                check('not-null-null-failure-kept-column-nullable',admin.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name='matters' AND column_name='close_date'",(schema,)).fetchone()==('YES',))
                            else:
                                admin.execute('RESET ROLE')
                                team_count=admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'matter_teams'))).fetchone()[0]
                                admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                                check('invalid-primary-key-data-retained',team_count==2)
                                check('invalid-primary-key-old-key-retained',admin.execute("SELECT count(*) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND t.relname='matter_teams' AND c.contype='p' AND pg_catalog.pg_get_constraintdef(c.oid) LIKE 'PRIMARY KEY (matter_team_id%%)'",(schema,)).fetchone()==(1,))
                            outcome={'status':'failed-rolled-back'}
                        else:raise AssertionError(case['id']+' native failure did not occur')
                    else:
                        if case['id']=='not-null' and transition['id'].endswith('002'):
                            from umf_access.lifecycle import mixed as mixed_module
                            original_phase=mixed_module._run_required_phase
                            def phase_lock_probe(*phase_args,**phase_kwargs):
                                witness=original_phase(*phase_args,**phase_kwargs)
                                phase=phase_args[2]
                                if any('SET NOT NULL' in step['sql'] for step in plan['steps'] if step['id'] in phase['steps']):
                                    with psycopg.connect(args.dsn,autocommit=True) as writer:
                                        writer.execute("SET lock_timeout='100ms'")
                                        try:writer.execute(sql.SQL('UPDATE {} SET close_date=NULL WHERE matter_id=1').format(sql.Identifier(schema,'matters')))
                                        except psycopg.errors.LockNotAvailable:check('not-null-activation-holds-exclusive-lock-during-required-phase',True)
                                        else:raise AssertionError('second-session writer crossed the NOT NULL activation lock')
                                return witness
                            mixed_module._run_required_phase=phase_lock_probe
                            try:
                                outcome=apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head=head,
                                    person_roles=persons,file_digest=(case['id']+'-'+str(index)).encode().hex()[:64].ljust(64,'0'))
                            finally:mixed_module._run_required_phase=original_phase
                        else:
                            outcome=apply_mixed_migration(admin,plan,approved_digest=plan['digest'],expected_head=head,
                                person_roles=persons,file_digest=(case['id']+'-'+str(index)).encode().hex()[:64].ljust(64,'0'))
                    check(case['id']+'-'+transition['id']+'-mixed-apply-completes',outcome['status'] in ('committed','failed-rolled-back'))
                    if outcome['status']=='committed':
                        head=outcome['headDigest'];predecessor={'id':plan['id'],'digest':plan['digest']};current_bundle=next_bundle
                    if case['id']=='drop-court':
                        check('reviewed-drop-physically-removes-column',admin.execute("SELECT count(*) FROM information_schema.columns WHERE table_schema=%s AND table_name='matters' AND column_name='court'",(schema,)).fetchone()==(0,))
                        admin.execute('RESET ROLE')
                        matter_count=admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'matters'))).fetchone()[0]
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('reviewed-drop-preserves-unrelated-matter-rows='+str(matter_count),matter_count==2)
                    elif case['id']=='rename-court':
                        admin.execute('RESET ROLE')
                        renamed_values=admin.execute(sql.SQL('SELECT court_name FROM {} ORDER BY matter_id').format(sql.Identifier(schema,'matters'))).fetchall()
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('reviewed-rename-preserves-existing-values',renamed_values==[('demonstration',),('demonstration',)])
                    elif case['id']=='widen-types':
                        rows=admin.execute("SELECT table_name,column_name,data_type,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=%s AND ((table_name='timekeepers' AND column_name IN ('billing_rate','internal_sequence'))) ORDER BY column_name",(schema,)).fetchall()
                        check('safe-numeric-and-integer-widenings-installed',rows==[('timekeepers','billing_rate','numeric',12,2),('timekeepers','internal_sequence','bigint',64,0)])
                        admin.execute('RESET ROLE')
                        widened_values=admin.execute(sql.SQL('SELECT billing_rate,internal_sequence FROM {} ORDER BY timekeeper_id').format(sql.Identifier(schema,'timekeepers'))).fetchall()
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('safe-type-widening-preserves-data',widened_values==[(125,7),(250,7)])
                    elif case['id']=='not-null':
                        nullable=admin.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name='matters' AND column_name='close_date'",(schema,)).fetchone()[0]
                        check('tighten-or-relax-not-null-observed',transition['id'].endswith('002') and nullable=='NO' or transition['id'].endswith('003') and nullable=='YES')
                        if transition['id'].endswith('002'):
                            admin.execute('RESET ROLE')
                            try:admin.execute(sql.SQL('UPDATE {} SET close_date=NULL WHERE matter_id=1').format(sql.Identifier(schema,'matters')))
                            except psycopg.errors.NotNullViolation:check('published-not-null-rejects-second-session-null-write',True)
                            else:raise AssertionError('published NOT NULL accepted a NULL writer')
                            admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                    elif case['id']=='replace-index' and transition['id'].endswith('003'):
                        check('reviewed-index-replacement-installed',admin.execute("SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname='matters_client_lookup_v2' AND i.indisvalid",(schema,)).fetchone()==(1,))
                        check('replaced-index-old-name-removed',admin.execute("SELECT to_regclass(%s)",(schema+'.matters_client_lookup',)).fetchone()==(None,))
                    elif case['id']=='remove-index':
                        check('reviewed-standalone-index-physically-removed',admin.execute("SELECT to_regclass(%s)",(schema+'.matters_client_lookup',)).fetchone()==(None,))
                        admin.execute('RESET ROLE')
                        matter_rows=admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'matters'))).fetchone()[0]
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('standalone-index-removal-preserves-rows',matter_rows==2)
                    elif case['id']=='check-lifecycle':
                        expected={
                            'check_lifecycle-002':('matters_positive_id',"matter_id > '-1'::numeric"),
                            'check_lifecycle-003':('matters_positive_id_v2',"matter_id > '-1'::numeric"),
                            'check_lifecycle-004':None,
                        }[transition['id']]
                        native_checks=admin.execute("SELECT c.conname,pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND t.relname='matters' AND c.contype='c' ORDER BY c.conname",(schema,)).fetchall()
                        if expected is None:check('reviewed-check-constraint-removal-observed',native_checks==[])
                        else:check('reviewed-check-native-name-and-definition-observed',len(native_checks)==1 and native_checks[0][0]==expected[0] and expected[1] in native_checks[0][1])
                        admin.execute('RESET ROLE')
                        matter_rows=admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'matters'))).fetchone()[0]
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('check-constraint-evolution-preserves-rows',matter_rows==2)
                    elif case['id']=='foreign-key-lifecycle':
                        fk_rows=admin.execute("SELECT c.conname,pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND t.relname='matter_teams' AND c.contype='f' ORDER BY c.conname",(schema,)).fetchall()
                        target={
                            'foreign_key_lifecycle-002':('matter_teams_fk_0',('ON UPDATE NO ACTION','ON DELETE CASCADE')),
                            'foreign_key_lifecycle-003':('matter_teams_fk_renamed',('ON UPDATE NO ACTION','ON DELETE CASCADE')),
                            'foreign_key_lifecycle-004':('matter_teams_fk_successor',('ON UPDATE CASCADE','ON DELETE CASCADE')),
                            'foreign_key_lifecycle-005':None,
                        }[transition['id']]
                        if target is None:ok=fk_rows==[]
                        else:
                            chosen=[definition for name,definition in fk_rows if name==target[0]]
                            other_names={name for name,_ in fk_rows}-{target[0]}
                            ok=len(chosen)==1 and all(action in chosen[0] for action in target[1]) and other_names=={'matter_teams_fk_1'}
                        check('reviewed-foreign-key-native-name-definition-and-action-observed',ok)
                        admin.execute('RESET ROLE')
                        team_rows=admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'matter_teams'))).fetchone()[0]
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('foreign-key-evolution-preserves-rows',team_rows==2)
                    elif case['id']=='replace-pk':
                        definition=admin.execute("SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=%s AND t.relname='matter_teams' AND c.contype='p'",(schema,)).fetchone()[0]
                        check('independent-primary-key-replacement-installed','matter_id' in definition and 'database_role' in definition and 'matter_team_id' not in definition)
                        admin.execute('RESET ROLE')
                        team_count=admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'matter_teams'))).fetchone()[0]
                        admin.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
                        check('primary-key-replacement-preserves-team-rows',team_count==2)
                    elif case['id']=='policy':
                        client=sql.Identifier(schema,'clients')
                        def person_read(role):
                            with admin.transaction():
                                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(role)))
                                return admin.execute(sql.SQL('SELECT client_id FROM {} ORDER BY client_id').format(client)).fetchall()
                        check('reviewed-policy-group-principal-reads',person_read(alice)==[(1,)])
                        check('reviewed-policy-untrusted-person-sees-no-row',person_read(bob)==[])
                        check('reviewed-policy-grant-change-visible-in-catalog',admin.execute('SELECT pg_catalog.has_table_privilege(%s,%s,\'INSERT\')',(alice,schema+'.clients')).fetchone()==(True,))
                    elif case['id']=='policy-drop-court':
                        matter=sql.Identifier(schema,'matters')
                        def matter_read(role):
                            with admin.transaction():
                                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(role)))
                                return admin.execute(sql.SQL('SELECT matter_id FROM {} ORDER BY matter_id').format(matter)).fetchall()
                        check('rewritten-row-policy-preserves-alice-visibility',matter_read(alice)==[(1,)])
                        check('rewritten-row-policy-preserves-bob-visibility',matter_read(bob)==[(2,)])
            finally:
                admin.execute('RESET ROLE');admin.execute('RESET search_path')
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)));schemas.remove(schema)

        for negative in fixture['negativeCases']:
            cfg=negative['configuration'];before=deploy(negative['previousSource'],cfg);after=deploy(negative['nextSource'],cfg)
            refusal=compile_plan(negative['id']+'-negative',{'id':'previous','digest':'a'*64},before,after,negative['options'])
            check(negative['id']+'-embedded-compiler-refuses',refusal['status']=='blocked')
            if negative['id']=='inbound-pk':
                check('primary-key-inbound-dependency-refused',any('inbound foreign-key dependents' in d['message'] for d in refusal.get('diagnostics',[])))
            elif negative['id']=='narrow-numeric':
                check('unsafe-numeric-narrowing-refused',bool(refusal.get('diagnostics')))
        invalid_pk=next((case for case in fixture['cases'] if case['id']=='invalid-pk'),None)
        if invalid_pk is not None:
            cfg=invalid_pk['configuration'];before=deploy(invalid_pk['initialSource'],cfg)
            next_source=invalid_pk['transitions'][0]['source'];after=deploy(next_source,cfg)
            options=copy.deepcopy(invalid_pk['transitions'][0]['options']);options['reviewedChanges'][0]['newDigest']='0'*64
            stale=compile_plan('invalid-pk-stale-marker',{'id':'previous','digest':'b'*64},before,after,options)
            check('invalid-primary-key-stale-marker-refused',stale['status']=='blocked')
    finally:
        admin.execute('RESET ROLE')
        for schema in reversed(schemas):admin.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))

root=Path(__file__).resolve().parents[2]
def sha256(path):return hashlib.sha256(path.read_bytes()).hexdigest()
source_hashes={
    'fixture':sha256(args.fixture),
    'fixture_builder':sha256(root/'tests/lifecycle/reviewed-native-fixture.ts'),
    'domain_fixture':sha256(root/'tests/lifecycle/legal-fixture.ts'),
    'native_runner':sha256(Path(__file__).resolve()),
    'row_scope_normalizer':sha256(root/'src/table-authoring/row-scope.ts'),
    'migration_compiler':sha256(root/'src/table-migration/index.ts'),
    'mixed_migration_runtime':sha256(root/'python/umf_access/src/umf_access/lifecycle/mixed.py'),
    'native_catalog_runtime':sha256(root/'python/umf_access/src/umf_access/lifecycle/catalog.py'),
    'ledger_runtime':sha256(root/'python/umf_access/src/umf_access/lifecycle/ledger.py'),
    'privilege_runtime':sha256(root/'python/umf_access/src/umf_access/lifecycle/privileges.py'),
    'codegen_build_script':sha256(root/'scripts/build-codegen.ts'),
    'embedded_asset_manifest':sha256(root/'python/umf_codegen/src/umf_codegen/_assets/manifest.json'),
    'embedded_asset':sha256(root/'python/umf_codegen/src/umf_codegen/_assets/generator.js.gz'),
}
args.report.write_text(json.dumps({'fixtureVersion':fixture['version'],'serverVersion':server_version,
    'scope':'fabricated legal source-derived reviewed migration v0.2; no managed/private-consumer or release claim',
    'sourceSha256':source_hashes,'assertionCount':len(checks),'assertions':checks},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'report':str(args.report)}))
