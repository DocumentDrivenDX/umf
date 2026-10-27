# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-cohort G02 append-without-default public-host qualification."""
from __future__ import annotations
import argparse, hashlib, json
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4
import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import MigrationRequest, PsycopgMigrationHost, apply_migration_on_host, apply_table_migration
from umf_codegen import compile_table_deployment, compile_table_migration

p=argparse.ArgumentParser();p.add_argument('--dsn',default='dbname=postgres');p.add_argument('--fixture',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
fixture_sha=hashlib.sha256(a.fixture.read_bytes()).hexdigest();runner_sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();receipt={}
f=json.loads(a.fixture.read_text());assert f['version']=='umf.praxis.g02-no-default-native-fixture/1'
cfg=f['configuration'];checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
def bundle(source):
 text=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
 result=compile_table_deployment(text,configuration=cfg);assert result['status']=='compiled',result
 return result['bundle']
with psycopg.connect(a.dsn,autocommit=True) as admin:
 server=admin.execute('SELECT pg_catalog.version()').fetchone()[0]
 assert 'PostgreSQL 18.6' in server,server
 tag=uuid4().hex[:9];db='g02nd_'+tag;receipt.update(disposableDatabase=db,disposableSchema=cfg['schema']);cfg={**f['configuration'],'ownerRole':'g02_ndo_'+tag,'personRole':'g02_ndp_'+tag,'batchRole':'g02_ndb_'+tag};owner,person,batch=cfg['ownerRole'],cfg['personRole'],cfg['batchRole'];individuals=('g02_nd_a_'+tag,'g02_nd_b_'+tag);roles=(owner,person,batch,*individuals);role_by_fixture={'g02_alice':individuals[0],'g02_bob':individuals[1]};made=[];made_db=False
 try:
  for role in roles:
   admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));made.append(role)
  for individual in individuals:admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(person),sql.Identifier(individual)))
  admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db)));made_db=True
  dsn=conninfo.make_conninfo(a.dsn,dbname=db)
  with psycopg.connect(dsn,autocommit=True) as connection:
   connection.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(owner)))
   initial_bundle=bundle(f['initialSource']);initial_result=compile_table_migration(migration_id='g02-no-default-001',predecessor=None,previous_bundle=None,next_bundle=initial_bundle)
   assert initial_result['status']=='compiled',initial_result;initial=initial_result['plan']
   with connection.transaction():
    connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)));connection.execute('SET LOCAL search_path=pg_catalog')
    installed=apply_table_migration(connection,initial,approved_digest=initial['digest'],expected_head=None,person_roles=individuals)
   table=sql.Identifier(cfg['schema'],'notes')
   for row in f['initialRows']:
    connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax) VALUES (%s,%s,%s,%s)').format(table),(row['id'],role_by_fixture[row['owner']],row['amount'],row['tax']))
   next_bundle=bundle(f['source']);spec=f['plan']
   compiled=compile_table_migration(migration_id=spec['id'],predecessor={'id':initial['id'],'digest':initial['digest']},previous_bundle=initial_bundle,next_bundle=next_bundle,options=spec['options'])
   assert compiled['status']=='compiled',compiled;plan=compiled['plan'];check('command-free predecessor and selected derived command compile',not json.loads(f['initialSource']['utf8'])['modules'][0]['extensions']['umf.tables']['commands'] and [c['id'] for c in json.loads(f['source']['utf8'])['modules'][0]['extensions']['umf.tables']['commands']]==['derive_total'])
   target_column=next(c for c in json.loads(f['source']['utf8'])['modules'][0]['extensions']['umf.tables']['tables'][0]['columns'] if c['name']=='total')
   check('appended target declares no default','default' not in target_column)
   head=installed['headDigest'];file_digest=hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest();evidence=hashlib.sha256(('g02-no-default-native:'+spec['id']+':postgresql18/0.1').encode()).hexdigest()
   connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)));connection.execute('SET search_path=pg_catalog')
   host=PsycopgMigrationHost(connection,person_roles=individuals,target_profile='postgresql18/0.1',installation_id='g02-no-default-'+spec['id'])
   approval=host.record_approval(MigrationRequest(plan,head,file_digest),decision='approved',qualification_profile='postgresql18/0.1',evidence_digest=evidence)
   applied=apply_migration_on_host(host,plan,expected_head=head,file_digest=file_digest,qualification_profile='postgresql18/0.1',evidence_digest=evidence,approval_id=approval.receipt_id)
   receipt.update(planDigest=plan['digest'],initialBundleDigest=initial_bundle['bundleDigest'],nextBundleDigest=next_bundle['bundleDigest'],approvalReceiptId=approval.receipt_id,approvalBindingDigest=approval.binding_digest,installationReference=applied.get('installationReference'))
   check('public host commits approved append/fill/tighten phase',applied['status']=='committed' and applied['generation']==2)
   connection.execute('RESET ROLE')
   # The observer is a separate privileged session, and the complete historical
   # rows are nonempty before evaluating the hand-authored output oracle.
   with psycopg.connect(dsn,autocommit=True) as observer:
    observer_identity=observer.execute('SELECT session_user,current_user,rolsuper FROM pg_roles WHERE rolname=current_user').fetchone()
    rows=observer.execute(sql.SQL('SELECT id,total::pg_catalog.text FROM {} ORDER BY id').format(table)).fetchall()
   receipt['observer']={'sessionUser':observer_identity[0],'currentUser':observer_identity[1],'superuser':observer_identity[2]}
   check('privileged observer session identity',observer_identity[0]==observer_identity[1] and observer_identity[2] is True)
   check('observer sees all three historical rows',len(rows)==len(f['initialRows'])==3)
   check('manual per-row output oracle',rows==[tuple(x) for x in f['expectedRows']])
   rls=connection.execute('SELECT relrowsecurity,relforcerowsecurity FROM pg_catalog.pg_class WHERE oid=%s::regclass',(cfg['schema']+'.notes',)).fetchone()
   check('target retains enabled and forced RLS',rls==(True,True))
   receipt['roleNames']=list(roles)
   for role,expected_count in ((individuals[0],2),(individuals[1],1),(batch,3)):
    connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(role)))
    try:
     visible=connection.execute(sql.SQL('SELECT count(*) FROM {}').format(table)).fetchone()[0]
     check('native RLS row visibility '+role,visible==expected_count)
     try:connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(cfg['schema'],'umf_lifecycle_approvals'))).fetchall()
     except psycopg.errors.InsufficientPrivilege as error:check('approval relation remains owner-only '+role,error.sqlstate=='42501')
     else:raise AssertionError('non-owner read approval relation')
    finally:connection.execute('RESET ROLE')
   nullable=connection.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='total'",(cfg['schema'],)).fetchone()
   check('derived target is NOT NULL',nullable==('NO',))
   default=connection.execute("SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='total'",(cfg['schema'],)).fetchone()
   check('future default remains absent',default==(None,))
   before=connection.execute(sql.SQL('SELECT count(*) FROM {}').format(table)).fetchone()[0]
   future=f['futureInsert'];future_owner=role_by_fixture[future['owner']];probe_id='g02_rollback_probe'
   try:
    with psycopg.connect(dsn) as future_connection:
     with future_connection.transaction():
      future_connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax,total) VALUES (%s,%s,%s,%s,%s)').format(table),(probe_id,future_owner,future['amount'],future['tax'],'1.00'))
      future_connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax) VALUES (%s,%s,%s,%s)').format(table),(future['id'],future_owner,future['amount'],future['tax']))
   except psycopg.Error as error:
    check('future omitted-target insert raises native 23502',error.sqlstate=='23502')
   else:raise AssertionError('future insert omitting required no-default target unexpectedly succeeded')
   after=connection.execute(sql.SQL('SELECT count(*) FROM {}').format(table)).fetchone()[0]
   probe=connection.execute(sql.SQL('SELECT count(*) FROM {} WHERE id=%s').format(table),(probe_id,)).fetchone()[0]
   check('omitted-target failure rolls back earlier writes in its transaction',after==before and probe==0)
   future=f['futureInsert'];explicit=connection.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax,total) VALUES (%s,%s,%s,%s,%s) RETURNING total::pg_catalog.text').format(table),(future['id'],future_owner,future['amount'],future['tax'],future['explicitTotal'])).fetchone()
   check('future explicit target is accepted without recomputation',explicit==(future['explicitTotal'],))
   check('explicit future row remains the supplied value',connection.execute(sql.SQL('SELECT total::pg_catalog.text FROM {} WHERE id=%s').format(table),(future['id'],)).fetchone()==(future['explicitTotal'],))
 finally:
  if made_db:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
  for role in reversed(made):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
report={'server':server,'cases':1,'packages':{'umf-access':version('umf-access'),'umf-codegen':version('umf-codegen'),'umf-weft':version('umf-weft'),'umf-core':version('umf-core')},'fixtureSha256':fixture_sha,'runnerSha256':runner_sha,'receipt':receipt,'checks':checks}
a.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'server':server,'cases':1,'checks':checks},separators=(',',':')))
