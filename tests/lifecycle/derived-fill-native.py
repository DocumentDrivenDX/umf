# SPDX-License-Identifier: MIT OR Apache-2.0
"""Synthetic G02 host-path acceptance against disposable local PostgreSQL databases."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import (
    CatalogError, MigrationRequest, PsycopgMigrationHost,
    apply_migration_on_host, apply_table_migration,
)
from umf_access.lifecycle.host import HostOutcomeUnknown
from umf_codegen import compile_table_deployment, compile_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--fixture',type=Path,default=Path('/private/tmp/umf-g02-derived-fill-native-fixture.json'))
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
fixture=json.loads(args.fixture.read_text())
assert fixture['version'] in ('umf.praxis.g02-derived-fill-native-fixture/1','umf.praxis.g02-null-semantics-native-fixture/1')
checks=[]
compile_only=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
def bundle(source,cfg):
    text=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
    result=compile_table_deployment(text,configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']

# These controls exercise carrier inference only; they must be refused before
# migration planning or any database side effect. Keep them in the same native
# qualification runner so the report binds the installed compiler used for the
# accepted row-expression cases below.
for control in fixture.get('compileOnlyControls',[]):
    source=control['source']
    text=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
    result=compile_table_deployment(text,configuration=fixture['configuration'])
    diagnostics=result.get('diagnostics',[])
    if control['expected']=='compiled':
        check(control['id']+'-compatible-carrier-accepted',result.get('status')=='compiled')
    else:
        check(control['id']+'-wrong-intrinsic-carrier-refused',result.get('status')!='compiled' and any(item.get('code')=='TABLES_OPERATION_DOMAIN' for item in diagnostics))
    compile_only.append({'id':control['id'],'expected':control['expected'],'status':result.get('status'),'diagnostics':diagnostics})

with psycopg.connect(args.dsn,autocommit=True) as admin:
    server=admin.execute('SELECT pg_catalog.version()').fetchone()[0]
    assert 'PostgreSQL 18.' in server,server
    for case in fixture['cases']:
        cfg=fixture['configuration'];db='g02_'+uuid4().hex[:10]
        owner,person,batch=cfg['ownerRole'],cfg['personRole'],cfg['batchRole']
        individuals=('g02_alice','g02_bob');roles=(owner,person,batch,*individuals)
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
                initial_source=case['initialSource'] if 'initialSource' in case else fixture['initialSource']
                initial_bundle=bundle(initial_source,cfg)
                initial_result=compile_table_migration(migration_id=case['id']+'-001',predecessor=None,previous_bundle=None,next_bundle=initial_bundle)
                assert initial_result['status']=='compiled',initial_result
                initial=initial_result['plan']
                with connection.transaction():
                    connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                    connection.execute('SET LOCAL search_path=pg_catalog')
                    installed=apply_table_migration(connection,initial,approved_digest=initial['digest'],expected_head=None,person_roles=individuals)
                for row in case['initialRows']:
                    if 'total' in row:
                        connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax,total) VALUES (%s,%s,%s,%s,%s)').format(sql.Identifier(cfg['schema'],'notes')),
                                           (row['id'],row['owner'],row['amount'],row['tax'],row['total']))
                    else:
                        connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax) VALUES (%s,%s,%s,%s)').format(sql.Identifier(cfg['schema'],'notes')),
                                           (row['id'],row['owner'],row['amount'],row['tax']))
                case_source=case['source'] if 'source' in case else fixture['source']
                case_plan=case['plan'] if 'plan' in case else fixture['plan']
                next_bundle=bundle(case_source,cfg)
                compiled=compile_table_migration(migration_id=case_plan['id'],predecessor={'id':initial['id'],'digest':initial['digest']},
                    previous_bundle=initial_bundle,next_bundle=next_bundle,options=case_plan['options'])
                assert compiled['status']=='compiled',compiled
                plan=compiled['plan'];assert plan['version']=='umf.table-migration/0.4'
                assert plan['executionProfile']['version']=='umf.table-migration-execution/0.3'
                head=installed['headDigest'];raw=json.dumps(plan,sort_keys=True,separators=(',',':')).encode();file_digest=hashlib.sha256(raw).hexdigest()
                evidence_digest=hashlib.sha256(('g02-derived-fill-native:'+case['id']+':postgresql18/0.1').encode()).hexdigest()
                connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)));connection.execute('SET search_path=pg_catalog')
                host=PsycopgMigrationHost(connection,person_roles=individuals,target_profile='postgresql18/0.1',installation_id='g02-'+case['id'])
                approval=host.record_approval(MigrationRequest(plan,head,file_digest),decision='approved',qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest)
                check(case['id']+'-approved-source-bound-plan',approval.decision=='approved' and approval.evidence_digest==evidence_digest)
                if case.get('expectedFailure')=='null-result':
                    try:
                        apply_migration_on_host(host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest,approval_id=approval.receipt_id)
                    except CatalogError as error:
                        check(case['id']+'-native-null-guard-sanitized',str(error)=='derived-backfill-native-error' and error.sqlstate=='22012')
                    except HostOutcomeUnknown:
                        raise AssertionError('Known row-expression error must be reported as a known rolled-back failure')
                    else:
                        raise AssertionError('NULL derived result unexpectedly committed')
                    connection.execute('RESET ROLE')
                    has_existing_target=any('total' in row for row in case['initialRows'])
                    projection='id,amount::pg_catalog.text,tax,total::pg_catalog.text' if has_existing_target else 'id,amount::pg_catalog.text,tax'
                    unchanged=connection.execute(sql.SQL('SELECT '+projection+' FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'notes'))).fetchall()
                    expected_unchanged=[(row['id'],row['amount'],row['tax'],row['total']) if has_existing_target else (row['id'],row['amount'],row['tax']) for row in case['initialRows']]
                    check(case['id']+'-all-data-and-derived-phase-rolled-back',unchanged==expected_unchanged)
                    exists=connection.execute("SELECT EXISTS(SELECT FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='total')",(cfg['schema'],)).fetchone()[0]
                    check(case['id']+'-new-column-rolled-back',exists is has_existing_target)
                    continue
                applied=apply_migration_on_host(host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence_digest,approval_id=approval.receipt_id)
                check(case['id']+'-public-host-committed',applied['status']=='committed' and applied['generation']==2)
                connection.execute('RESET ROLE')
                rows=connection.execute(sql.SQL('SELECT id,total::pg_catalog.text FROM {} ORDER BY id').format(sql.Identifier(cfg['schema'],'notes'))).fetchall()
                expected=[tuple(row) for row in case['expectedRows']]
                check(case['id']+'-manual-per-row-decimal-oracle',rows==expected)
                nullable=connection.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='total'",(cfg['schema'],)).fetchone()
                check(case['id']+'-target-is-required',nullable==('NO',))
                default=connection.execute("SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='total'",(cfg['schema'],)).fetchone()
                check(case['id']+'-future-default-remains-installed-after-fill',default is not None)
                inserted=connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax) VALUES (%s,%s,%s,%s) RETURNING total::pg_catalog.text').format(sql.Identifier(cfg['schema'],'notes')),('future','g02_alice','5.00',1)).fetchone()
                check(case['id']+'-future-default-applies-to-later-omitted-target',inserted==('0.00',))
        finally:
            if made_db:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
            for role in reversed(made_roles):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps({'server':server,'cases':len(fixture['cases']),'compileOnlyControls':compile_only,'checks':checks},indent=2)+'\n')
print(json.dumps({'cases':len(fixture['cases']),'compileOnlyControls':compile_only,'checks':checks},separators=(',',':')))
