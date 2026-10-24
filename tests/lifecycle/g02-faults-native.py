# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native G02 phase atomicity, fencing, and recovery checks on disposable PG18."""
from __future__ import annotations

import argparse, hashlib, json, threading, time, tempfile, importlib, sys
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import CatalogError, MigrationRequest, PsycopgMigrationHost, apply_migration_on_host, apply_table_migration
from umf_access.lifecycle.host import HostOutcomeUnknown
from umf_access.lifecycle import backfills
from umf_codegen import compile_table_deployment, compile_table_migration
from umf_codegen import generate_python_client
from umf_access.unified import SessionIdentity, SessionPolicy, SyncNativeTableBinding, SyncSession
from umf_access.lifecycle.seeds import _binding

p=argparse.ArgumentParser();p.add_argument('--dsn',default='dbname=postgres application_name=umf_g02_faults');p.add_argument('--fixture',type=Path,default=Path('/private/tmp/umf-g02-derived-fill-native-fixture.json'));p.add_argument('--manifest',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--scenario',choices=('fenced-resume','backfill-commit-lost','existing-target-commit-lost'),default='fenced-resume');a=p.parse_args()
f=json.loads(a.fixture.read_text());cfg0=f['configuration'];case=f['cases'][0];checks=[]
manifest=json.loads(a.manifest.read_text());observations={'scenario':a.scenario,'candidate':manifest['candidate'],'manifestPath':str(a.manifest),'manifestSha256':hashlib.sha256(a.manifest.read_bytes()).hexdigest(),'artifactHashes':{name:item['sha256'] for name,item in manifest['artifacts'].items()},'fixturePath':str(a.fixture),'fixtureSha256':hashlib.sha256(a.fixture.read_bytes()).hexdigest(),'runnerPath':str(Path(__file__).resolve()),'runnerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
def ck(n,v):
    assert v,n;checks.append(n)
def bundle(source,cfg):
    t=source['utf8'] if isinstance(source,dict) and set(source)=={'format','utf8'} else json.dumps(source,separators=(',',':'))
    r=compile_table_deployment(t,configuration=cfg);assert r['status']=='compiled',r;return r['bundle']
def source_with_reader(source):
    doc=json.loads(source['utf8']);payload=doc['modules'][0]['extensions']['umf.tables'];payload['commands']=[x for x in payload.get('commands',[]) if x['id']!='read_notes'];payload['commands'].append({'version':'umf.table-operation/0.1','id':'read_notes','parameters':[],'consistency':'statement','replay':'none','body':{'kind':'read','table':'notes','fields':[{'module':'demo','element':'id'},{'module':'demo','element':'owner'}],'where':{'op':'all'},'orderBy':[{'field':{'module':'demo','element':'id'},'direction':'asc'}],'result':'page','maxRows':100,'cursorKey':'primary'}});return {'format':'json','utf8':json.dumps(doc,separators=(',',':'))}
class Tx:
    def __init__(self,x,hook=None,before=None):self.x=x;self.hook=hook;self.before=before
    def __getattr__(self,n):return getattr(self.x,n)
    def execute_statement(self,s):
        if self.before:self.before(self.x,s)
        return self.x.execute_statement(s)
    def execute_data_step(self,p,s):
        self.x.execute_data_step(p,s)
        if self.hook:self.hook(p,s,self.x)
progress_reads=[]
class Lease:
    def __init__(self,x,**kw):self.x=x;self.kw=kw
    def __getattr__(self,n):return getattr(self.x,n)
    def read_progress(self,binding):
        result=self.x.read_progress(binding)
        if result is not None:progress_reads.append((result.phase_index,result.phase_digest,result.state,result.completed_steps))
        return result
    @contextmanager
    def required_phase(self,phase,*,prior):
        with self.x.required_phase(phase,prior=prior) as tx:yield Tx(tx,self.kw.get('hook'),self.kw.get('before'))
        cb=self.kw.get('after')
        if cb:cb(phase)
    def finalize(self,*args):
        cb=self.kw.get('finalize')
        if cb:cb()
        return self.x.finalize(*args)
class Host:
    def __init__(self,x,**kw):self.x=x;self.kw=kw
    @property
    def capabilities(self):return self.x.capabilities
    @contextmanager
    def acquire(self,*args,**kw):
        with self.x.acquire(*args,**kw) as lease:yield Lease(lease,**self.kw)

with psycopg.connect(a.dsn,autocommit=True) as admin:
    server=admin.execute('select version()').fetchone()[0];assert 'PostgreSQL 18.' in server,server
    observations['postgresqlVersion']=server
    tag=uuid4().hex[:9];db='g02f_'+tag;schema='g02fs_'+tag;owner='g02fo_'+tag;person='g02fp_'+tag;batch='g02fb_'+tag;alice='g02fa_'+tag;bob='g02fz_'+tag
    cfg={**cfg0,'schema':schema,'ownerRole':owner,'personRole':person,'batchRole':batch}
    roles=(owner,person,batch,alice,bob);made=[];created=False
    observations.update(disposableDatabase=db,disposableSchema=schema,disposableRoles=list(roles))
    try:
        for r in roles:admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(r)));made.append(r)
        for r in (alice,bob):admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE, SET FALSE').format(sql.Identifier(person),sql.Identifier(r)))
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db)));created=True;dsn=conninfo.make_conninfo(a.dsn,dbname=db)
        with psycopg.connect(dsn,autocommit=True) as c:
            c.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
            initial_source=f['initialSource']
            if a.scenario=='existing-target-commit-lost':
                doc=json.loads(f['source']['utf8']);mod=doc['modules'][0];target=next(x for x in mod['elements'] if x['id']=='total');target['nullability']='absent-allowed';mod['extensions']['umf.tables']['commands']=[];initial_source={'format':'json','utf8':json.dumps(doc,separators=(',',':'))}
            initial_source=source_with_reader(initial_source);next_source=source_with_reader(f['source'])
            ib=bundle(initial_source,cfg);ir=compile_table_migration(migration_id='g02-fault-001',predecessor=None,previous_bundle=None,next_bundle=ib);assert ir['status']=='compiled',ir;ip=ir['plan']
            with c.transaction():c.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)));c.execute('SET LOCAL search_path=pg_catalog');installed=apply_table_migration(c,ip,approved_digest=ip['digest'],expected_head=None,person_roles=(alice,bob))
            for row in case['initialRows']:
                if a.scenario=='existing-target-commit-lost':c.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax,total) VALUES (%s,%s,%s,%s,NULL)').format(sql.Identifier(schema,'notes')),(row['id'],alice if row['owner']=='g02_alice' else bob,row['amount'],row['tax']))
                else:c.execute(sql.SQL('INSERT INTO {} (id,owner,amount,tax) VALUES (%s,%s,%s,%s)').format(sql.Identifier(schema,'notes')),(row['id'],alice if row['owner']=='g02_alice' else bob,row['amount'],row['tax']))
            initial_count=c.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(schema,'notes'))).fetchone()[0]
            ck('fixture-initial-rows-inserted',initial_count==len(case['initialRows']))
            observations['initialFixtureRowCount']=initial_count
            nb=bundle(next_source,cfg);options=json.loads(json.dumps(f['plan']['options']))
            if a.scenario=='existing-target-commit-lost':options['reviewedChanges']=[{'id':'review-1aed57cb8eb827220c5f3017','kind':'tighten-not-null','path':'/modules/0/extensions/umf.tables/tables/0/columns/4','oldDigest':'410890ee5d982523f5cbf88a29a90b5fb2fad88a9ff58c504cab42db3f55883d','newDigest':'3a3f0fbc9ed50d9db7c2e5c21bb9203579aa6cdb65fd3602c9f2e74d46069869'}]
            cr=compile_table_migration(migration_id='g02-fault-002',predecessor={'id':ip['id'],'digest':ip['digest']},previous_bundle=ib,next_bundle=nb,options=options);assert cr['status']=='compiled',cr;plan=cr['plan'];head=installed['headDigest'];fd=hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest();ed=hashlib.sha256(b'g02-fault-native:postgresql18/0.1').hexdigest()
            observations.update(migrationVersion=plan['version'],executionProfile=plan['executionProfile'],approvalDigest=plan['digest'],target=plan['steps'][0].get('phaseTarget'))
            c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)));c.execute('SET search_path=pg_catalog');base=PsycopgMigrationHost(c,person_roles=(alice,bob),target_profile='postgresql18/0.1',installation_id='g02-fault-'+tag);approval=base.record_approval(MigrationRequest(plan,head,fd),decision='approved',qualification_profile='postgresql18/0.1',evidence_digest=ed)
            observations['approvalReceipt']={'receiptId':approval.receipt_id,'bindingDigest':approval.binding_digest,'decision':approval.decision,'qualificationProfile':approval.qualification_profile,'evidenceDigest':approval.evidence_digest}
            run=lambda h=base:apply_migration_on_host(h,plan,expected_head=head,file_digest=fd,qualification_profile='postgresql18/0.1',evidence_digest=ed,approval_id=approval.receipt_id)
            # Approval and source tampering fail before DDL or row changes.
            try:apply_migration_on_host(base,plan,expected_head=head,file_digest=fd,qualification_profile='postgresql18/0.1',evidence_digest=ed,approval_id='forged-'+tag)
            except CatalogError:ck('forged-approval-refused',True)
            else:raise AssertionError('forged approval admitted')
            bad=json.loads(json.dumps(plan));bad['options']['backfills'][0]['operation']='forged_operation'
            try:apply_migration_on_host(base,bad,expected_head=head,file_digest=fd,qualification_profile='postgresql18/0.1',evidence_digest=ed,approval_id=approval.receipt_id)
            except CatalogError:ck('forged-source-refused',True)
            else:raise AssertionError('forged source admitted')
            exists=lambda:c.execute("select exists(select from information_schema.columns where table_schema=%s and table_name='notes' and column_name='total')",(schema,)).fetchone()[0]
            ck('forgeries-have-no-target-ddl',exists() if a.scenario=='existing-target-commit-lost' else not exists())
            original_query='select id,amount::text,tax,total::text from {} order by id' if a.scenario=='existing-target-commit-lost' else 'select id,amount::text,tax from {} order by id'
            def privileged_rows():
                with psycopg.connect(dsn,autocommit=True) as observer:
                    identity=observer.execute('SELECT session_user,current_user,rolsuper FROM pg_roles WHERE rolname=current_user').fetchone()
                    result=observer.execute(sql.SQL(original_query).format(sql.Identifier(schema,'notes'))).fetchall()
                    return identity,result
            rollback_observer_identity,original=privileged_rows()
            observations['rollbackObserver']={'sessionUser':rollback_observer_identity[0],'currentUser':rollback_observer_identity[1],'superuser':rollback_observer_identity[2]}
            ck('rollback-observer-sees-all-fixture-rows',rollback_observer_identity[2] is True and len(original)==initial_count==len(case['initialRows']))
            dbapi_updates=[];original_cursor=backfills._cursor
            @contextmanager
            def observed_cursor(connection):
                with original_cursor(connection) as cursor:
                    class CursorProxy:
                        def __getattr__(self,name):return getattr(cursor,name)
                        def execute(self,statement,params=None):
                            text=str(statement)
                            if 'UPDATE' in text.upper() and (schema+'"."notes') in text:dbapi_updates.append(text)
                            return cursor.execute(statement,params) if params is not None else cursor.execute(statement)
                    yield CursorProxy()
            backfills._cursor=observed_cursor
            # Fail after the real UPDATE, while still inside required atomic phase.
            def bomb(p,s,tx):
                if s['kind']=='backfill':raise RuntimeError('injected-after-native-update')
            try:run(Host(base,hook=bomb))
            except RuntimeError as e:ck('midphase-failure-injected-after-update',str(e)=='injected-after-native-update')
            else:raise AssertionError('midphase fault missed')
            after_identity,after_fault=privileged_rows()
            ck('midphase-ddl-and-data-rolled-back',(exists() if a.scenario=='existing-target-commit-lost' else not exists()) and after_fault==original)
            ck('rollback-test-dispatched-one-real-dbapi-update',len(dbapi_updates)==1)
            committed_dispatch_baseline=len(dbapi_updates)
            observations['rolledBackAttempt']={'targetUpdateDispatches':len(dbapi_updates),'rowsBefore':original,'rowsAfter':after_fault,'targetExistsAfter':exists()}
            # Lost COMMIT response must observe the committed receipt and never UPDATE twice.
            calls=[];unknown=[];writer_attempt=threading.Event();writer_done=threading.Event();writer_result=[];writer_pid=[];barrier=[];interrupted=[]
            actual_apply=backfills._apply_backfill
            def observe_actual_backfill(*args,**kwargs):
                calls.append(args[2]['id'])
                return actual_apply(*args,**kwargs)
            backfills._apply_backfill=observe_actual_backfill
            def writer():
                try:
                    with psycopg.connect(dsn,autocommit=True) as w:
                        writer_pid.append(w.execute('select pg_backend_pid()').fetchone()[0]);writer_attempt.set()
                        writer_result.append(w.execute(sql.SQL('insert into {} (id,owner,amount,tax) values (%s,%s,%s,%s) returning total::text').format(sql.Identifier(schema,'notes')),('g02_writer_'+tag,alice,'2.00',1)).fetchone())
                finally:writer_done.set()
            def count(p,s,tx):
                if s['kind']=='backfill':
                    if not writer_attempt.is_set():
                        threading.Thread(target=writer,daemon=True).start();assert writer_attempt.wait(10),'writer did not start'
                        deadline=time.monotonic()+15
                        with psycopg.connect(dsn,autocommit=True) as m:
                            while time.monotonic()<deadline:
                                state=m.execute('select wait_event_type from pg_stat_activity where pid=%s',(writer_pid[0],)).fetchone()
                                if state==('Lock',):barrier.append(state);return
                        raise AssertionError(f'writer never waited on PostgreSQL lock: {state!r}')
            def interrupt(phase):
                if phase['kind']==plan['phases'][0]['kind'] and not interrupted:
                    interrupted.append(True)
                    if a.scenario in ('backfill-commit-lost','existing-target-commit-lost'):raise HostOutcomeUnknown('injected-lost-required-phase-commit-response')
                    raise RuntimeError('injected-publication-interruption')
            if a.scenario=='fenced-resume':
                try:run(Host(base,hook=count,after=interrupt))
                except RuntimeError as e:ck('publication-interruption-after-atomic-phase',str(e)=='injected-publication-interruption')
                else:raise AssertionError('publication interruption was not injected')
                ck('committed-backfill-phase-and-progress-survive-interruption',exists() and c.execute(sql.SQL('select count(*) from {} where total is null').format(sql.Identifier(schema,'notes'))).fetchone()==(0,))
            else:
                applied=run(Host(base,hook=count,after=interrupt))
                ck('lost-required-phase-commit-response-observed-and-published',applied['status']=='committed' and applied['generation']==2)
                by_id={step['id']:step for step in plan['steps']};phase0=plan['phases'][0];phase_steps=[by_id[x] for x in phase0['steps']]
                expected_digest=__import__('umf_access.lifecycle.progress',fromlist=['_phase_digest'])._phase_digest(phase0,phase_steps)
                receipt_observed=any(x[0]==1 and x[1]==expected_digest and x[2]=='complete' and tuple(x[3])==tuple(phase0['steps']) for x in progress_reads)
                ck('host-read-exact-committed-progress-receipt-after-lost-response',receipt_observed)
                ck('lost-required-phase-response-caused-one-real-update',len(calls)==1)
                ck('lost-commit-observer-counted-one-real-update-dispatch',len(dbapi_updates)-committed_dispatch_baseline==1)
                observations['lostCommitProgressReads']=[{'phaseIndex':x[0],'phaseDigest':x[1],'state':x[2],'completedSteps':list(x[3])} for x in progress_reads]
            ck('second-session-observed-real-postgres-lock-wait',barrier==[('Lock',)])
            ck('blocked-writer-resumed-after-whole-atomic-phase',writer_done.wait(10) and writer_result==[('0.00',)])
            observations['writer']={'waitEventType':barrier[0][0] if barrier else None,'insertReturnedTotal':writer_result[0][0] if writer_result else None,'finished':writer_done.is_set()}
            if a.scenario=='fenced-resume':c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(alice)))
            try:c.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(schema,'umf_lifecycle_head'))).fetchall()
            except psycopg.errors.InsufficientPrivilege as e:ck('clients-remain-fenced-during-interrupted-publication',e.sqlstate=='42501')
            else:
                if a.scenario=='fenced-resume':raise AssertionError('head view remained readable while publication was interrupted')
            c.execute('RESET ROLE');c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
            if a.scenario=='fenced-resume':
             progtable=sql.Identifier(schema,'umf_lifecycle_progress')
             progress=c.execute(sql.SQL('SELECT phase_index,phase_digest,completed_steps,prefix_witness FROM {}').format(progtable)).fetchone();ck('saved-progress-shows-one-committed-required-phase',progress is not None and progress[0]==1)
             observations['interruptedProgress']={'phaseIndex':progress[0],'phaseDigest':progress[1],'completedSteps':progress[2]}
             c.execute(sql.SQL("UPDATE {} SET phase_digest=%s").format(progtable),('0'*64,))
             before_calls=len(calls)
             try:run()
             except CatalogError:ck('forged-progress-guard-refused-before-next-phase',True)
             else:raise AssertionError('forged progress admitted')
             ck('forged-progress-caused-no-backfill-repeat',len(calls)==before_calls)
             ck('forged-progress-caused-no-dbapi-update-dispatch',len(dbapi_updates)-committed_dispatch_baseline==1)
             c.execute(sql.SQL('UPDATE {} SET phase_digest=%s,completed_steps=%s::jsonb,prefix_witness=%s::jsonb').format(progtable),(progress[1],json.dumps(progress[2]),json.dumps(progress[3])))
             def lose_later(phase):
                if phase['kind']=='transaction' and not unknown:unknown.append(True);raise HostOutcomeUnknown('injected-lost-publication-phase-commit-response')
             applied=run(Host(base,after=lose_later))
             ck('lost-later-commit-observed-and-published',applied['status']=='committed' and applied['generation']==2)
             ck('backfill-not-repeated-on-fenced-resume',len(calls)==1)
             ck('fenced-resume-had-exactly-one-committed-update-dispatch',len(dbapi_updates)-committed_dispatch_baseline==1)
            # Separate rerun DB state is used for committed-phase / publication failure and fencing.
            # Here inject loss after the atomic phase, then inspect progress and resume.
            # The prior unknown-commit already advanced all phases; the product path above proves observation.
            c.execute('RESET ROLE')
            rows=c.execute(sql.SQL('select id,total::text from {} order by id').format(sql.Identifier(schema,'notes'))).fetchall()
            expected=[tuple(x) for x in case['expectedRows']]+[('g02_writer_'+tag,'0.00')]
            ck('recovered-phase-has-manual-decimal-results',rows==expected)
            ck('published-target-not-null',c.execute("select is_nullable from information_schema.columns where table_schema=%s and table_name='notes' and column_name='total'",(schema,)).fetchone()==('NO',))
            observations['dbapiUpdateDispatches']={'total':len(dbapi_updates),'afterRollbackBaseline':len(dbapi_updates)-committed_dispatch_baseline,'statementSha256':[hashlib.sha256(x.encode()).hexdigest() for x in dbapi_updates],'statementPrefixes':[x[:96] for x in dbapi_updates]}
            observations['progressReads']=[{'phaseIndex':x[0],'phaseDigest':x[1],'state':x[2],'completedSteps':list(x[3])} for x in progress_reads]
            observations['actualRowsAfterPublication']=rows
            install_ref=applied['installationReference']
            observations['finalInstallation']={'generation':applied['generation'],'migrationVersion':plan['version'],'executionProfile':plan['executionProfile']['version'],'installationVersion':install_ref['version'],'installationReferenceDigest':install_ref['referenceDigest'],'sourceDigest':plan['next']['sourceDigest'],'bundleDigest':plan['next']['bundleDigest'],'planDigest':plan['digest'],'approvalPlanDigest':install_ref.get('approvalPlanDigest')}
            generator=generate_python_client(plan['next']['source']['utf8'],package='g02_generated')
            with tempfile.TemporaryDirectory() as generated:
                for item in generator['files']:
                    path=Path(generated)/item['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_text(item['text'])
                sys.path.insert(0,generated)
                try:
                    package=importlib.import_module('g02_generated')
                    policy=SessionPolicy({alice:alice,bob:bob},{'job':batch},schema,catalog_only=True)
                    @contextmanager
                    def factory(_identity):
                        with psycopg.connect(dsn,autocommit=True) as conn:yield conn
                    bound=SyncNativeTableBinding(SyncSession(factory,policy),plan['next'],applied['installationReference'],_binding(plan['next']),cursor_secret=b'g02 generated reader cursor secret 000000',outcome_secret=b'g02 generated reader outcome secret 000000')
                    people={name:package.SyncClient(bound.for_identity(SessionIdentity('person',name))).modules.demo for name in (alice,bob)}
                    batch_client=package.SyncClient(bound.for_identity(SessionIdentity('batch','job'))).modules.demo
                    ck('generated-final-client-exposes-preserved-reader-and-hides-admin-fill',hasattr(people[alice],'read_notes') and not hasattr(people[alice],'derive_total'))
                    alice_rows=people[alice].read_notes(size=100).items;bob_rows=people[bob].read_notes(size=100).items;batch_rows=batch_client.read_notes(size=100).items
                    ck('generated-person-reads-follow-native-rls',len(alice_rows)==3 and len(bob_rows)==1)
                    ck('generated-batch-read-follows-batch-policy',len(batch_rows)==4)
                    observations['generatedAudienceCounts']={'personAlice':len(alice_rows),'personBob':len(bob_rows),'batch':len(batch_rows),'adminFillMethodExposed':hasattr(people[alice],'derive_total')}
                finally:sys.path.remove(generated);sys.modules.pop('g02_generated',None)
            for role,expected_count in ((alice,3),(bob,1),(batch,4)):
                c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(role)))
                try:
                    direct=c.execute(sql.SQL('SELECT id,total::text FROM {} ORDER BY id').format(sql.Identifier(schema,'notes'))).fetchall()
                    ck('published-target-column-grant-'+role,len(direct)==expected_count)
                    try:c.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(schema,'umf_lifecycle_approvals'))).fetchall()
                    except psycopg.errors.InsufficientPrivilege as e:
                        ck('approval-relation-owner-only-'+role,e.sqlstate=='42501')
                        observations.setdefault('approvalAccessSqlstates',{})[role]=e.sqlstate
                    else:raise AssertionError('non-owner read approval relation')
                finally:c.execute('RESET ROLE');c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(owner)))
            head_cursor=c.execute(sql.SQL('SELECT generation,head_digest,plan_digest,bundle_digest,source_digest,configuration_digest FROM {}').format(sql.Identifier(schema,'umf_lifecycle_head')))
            head_values=head_cursor.fetchone();observations['finalHead']={name:value for name,value in zip((item.name for item in head_cursor.description),head_values)}
            ck('final-head-and-installation-reference-match-published-plan',
               head_values[0]==install_ref['generation']==applied['generation'] and
               head_values[1]==install_ref['headDigest'] and
               head_values[2]==install_ref['planDigest']==plan['digest']==install_ref.get('approvalPlanDigest') and
               head_values[3]==install_ref['bundleDigest']==plan['next']['bundleDigest'] and
               head_values[4]==install_ref['sourceDigest']==plan['next']['sourceDigest'] and
               head_values[5]==install_ref['configurationDigest']==plan['next']['configurationDigest'])
            approval_row=c.execute(sql.SQL('SELECT approval_id::text,binding_digest,decision,qualification_profile,evidence_digest FROM {} ORDER BY decided_at DESC LIMIT 1').format(sql.Identifier(schema,'umf_lifecycle_approvals'))).fetchone()
            observations['latestApproval']={'receiptId':approval_row[0],'bindingDigest':approval_row[1],'decision':approval_row[2],'qualificationProfile':approval_row[3],'evidenceDigest':approval_row[4]}
            ck('final-installation-approval-plan-digest-matches-latest-approval',
               install_ref.get('approvalPlanDigest')==install_ref['planDigest']==plan['digest'] and
               approval_row[1]==approval.binding_digest and approval_row[2]==approval.decision and
               approval_row[3]==approval.qualification_profile and approval_row[4]==approval.evidence_digest)
            observations['finalInstallation'].update(latestApprovalDigest=approval_row[1],publishedPlanDigest=head_values[2],publishedGeneration=head_values[0])
    finally:
        if 'original_cursor' in locals():backfills._cursor=original_cursor
        if 'actual_apply' in locals():backfills._apply_backfill=actual_apply
        if created:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
        for r in reversed(made):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(r)))
        observations['cleanup']={'databaseExists':admin.execute('SELECT EXISTS(SELECT FROM pg_database WHERE datname=%s)',(db,)).fetchone()[0],'remainingRoles':admin.execute('SELECT rolname FROM pg_roles WHERE rolname=ANY(%s) ORDER BY rolname',(list(roles),)).fetchall(),'droppedDatabase':created,'droppedRoles':len(made)}
a.report.write_text(json.dumps({'server':server,'observations':observations,'checks':checks},indent=2,default=str)+'\n');print(json.dumps({'checks':checks,'observations':observations},separators=(',',':'),default=str))
