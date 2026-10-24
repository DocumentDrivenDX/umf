"""Independent G01 default/held-writer probe; disposable local target only."""
import hashlib,json,sys,threading
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
import psycopg
from psycopg import sql,conninfo
from umf_codegen import compile_table_deployment,compile_table_migration,discover_table_migration_changes
from umf_access.lifecycle import MigrationRequest,PsycopgMigrationHost,apply_migration_on_host,apply_table_migration

fixture=json.loads(Path(sys.argv[1]).read_text())
report=Path(sys.argv[2]);checks=[]
def check(name,value):
    assert type(value) is bool and value,name
    checks.append(name)
def bundle(source,cfg):
    result=compile_table_deployment(json.dumps(source),configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']
def migration(**kwargs):
    result=compile_table_migration(**kwargs)
    assert result['status']=='compiled',result
    return result['plan']

class Transaction:
    def __init__(self,original,dispatch):self.original=original;self.dispatch=dispatch
    def __getattr__(self,name):return getattr(self.original,name)
    def execute_data_step(self,plan,step):
        self.dispatch.append(step['id'])
        return self.original.execute_data_step(plan,step)
class Lease:
    def __init__(self,original,dispatch):self.original=original;self.dispatch=dispatch
    def __getattr__(self,name):return getattr(self.original,name)
    @contextmanager
    def required_phase(self,*args,**kwargs):
        with self.original.required_phase(*args,**kwargs) as transaction:
            yield Transaction(transaction,self.dispatch)
class Host:
    def __init__(self,original):self.original=original;self.dispatch=[]
    @property
    def capabilities(self):return self.original.capabilities
    @contextmanager
    def acquire(self,*args,**kwargs):
        with self.original.acquire(*args,**kwargs) as lease:
            yield Lease(lease,self.dispatch)

prefix='rv_g01_'+uuid4().hex[:10]
cfg={'module':'demo','schema':prefix,'ownerRole':prefix+'_owner',
     'personRole':prefix+'_person','batchRole':prefix+'_batch','groupRoles':{}}
people=(prefix+'_alice',prefix+'_bob');roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],*people]
db=prefix;made=[];created=False;server=None
with psycopg.connect('dbname=postgres',autocommit=True) as admin:
    try:
        server=admin.execute('SELECT version()').fetchone()[0]
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));made.append(role)
        for person in people:
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(person)))
        admin.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(db)));created=True
        dsn=conninfo.make_conninfo('dbname=postgres',dbname=db)
        with psycopg.connect(dsn,autocommit=True) as connection:
            connection.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])))
            case=next(case for case in fixture['cases'] if case['id']=='mixed')
            old=json.loads(case['initialSource']['utf8']);new=json.loads(case['source']['utf8'])
            for document in (old,new):
                table=document['modules'][0]['extensions']['umf.tables']['tables'][0]
                next(column for column in table['columns'] if column['field']['element']=='summary')['default']={'kind':'literal','value':{'string':'future'}}
            previous=bundle(old,cfg);successor=bundle(new,cfg)
            base=migration(migration_id=prefix+'-001',predecessor=None,previous_bundle=None,next_bundle=previous)
            with connection.transaction():
                connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
                connection.execute('SET LOCAL search_path=pg_catalog')
                installed=apply_table_migration(connection,base,approved_digest=base['digest'],expected_head=None,person_roles=people)
            table=sql.Identifier(cfg['schema'],'notes')
            connection.execute(sql.SQL('INSERT INTO {} (id,owner,summary) VALUES (%s,%s,%s),(%s,%s,NULL)').format(table),('a',people[0],'kept','b',people[1]))
            native_default=connection.execute('SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name=%s AND column_name=%s',(cfg['schema'],'notes','summary')).fetchone()
            options=json.loads(json.dumps(case['plan']['options']))
            candidates=discover_table_migration_changes(previous,successor)
            candidate=next(item for item in candidates if item['kind']=='tighten-not-null')
            options['reviewedChanges']=[{key:value for key,value in candidate.items() if key not in ('oldValue','newValue')}]
            plan=migration(migration_id=prefix+'-002',predecessor={'id':base['id'],'digest':base['digest']},previous_bundle=previous,next_bundle=successor,options=options)
            check('default-preserving-plan-is-one-atomic-pair',len(plan['steps'])==2 and len(plan['phases'])==1 and plan['phases'][0]['kind']=='backfill-tighten')
            raw=json.dumps(plan,sort_keys=True).encode();file_digest=hashlib.sha256(raw).hexdigest();evidence=hashlib.sha256(b'independent-g01-default-held-writer-v1').hexdigest()
            connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
            connection.execute('SET search_path=pg_catalog')
            host=Host(PsycopgMigrationHost(connection,person_roles=people,target_profile='local-postgresql18',installation_id=prefix,lock_timeout_ms=250))
            request=MigrationRequest(plan,installed['headDigest'],file_digest)
            approval=host.original.record_approval(request,decision='approved',qualification_profile='reviewer-g01',evidence_digest=evidence)
            holding=threading.Event();release=threading.Event();done=threading.Event();errors=[]
            def locker():
                try:
                    with psycopg.connect(dsn) as writer:
                        writer.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(people[0])))
                        writer.execute(sql.SQL('UPDATE {} SET summary=summary WHERE id=%s').format(table),('a',))
                        holding.set()
                        if not release.wait(30):raise AssertionError('held writer was not released')
                except BaseException as error:errors.append(repr(error))
                finally:done.set()
            thread=threading.Thread(target=locker,daemon=True);thread.start()
            assert holding.wait(10),errors
            kwargs={'expected_head':installed['headDigest'],'file_digest':file_digest,'qualification_profile':'reviewer-g01','evidence_digest':evidence,'approval_id':approval.receipt_id}
            from umf_access.lifecycle import catalog,mixed,privileges
            lock_states=[];lock_statements=[]
            originals={module:module._execute for module in (catalog,mixed,privileges)}
            def observing_execute(original):
                def observe(connection,statement,parameters=()):
                    try:return original(connection,statement,parameters)
                    except psycopg.Error as error:
                        if statement.startswith('LOCK TABLE '):
                            lock_states.append(error.sqlstate);lock_statements.append(statement)
                        raise
                return observe
            for module,original in originals.items():module._execute=observing_execute(original)
            failure=None
            try:
                try:apply_migration_on_host(host,plan,**kwargs)
                except Exception as error:failure=type(error).__name__+':'+str(error)
                check('held-direct-writer-refuses-before-any-fill-dispatch',failure is not None and host.dispatch==[] and lock_states==['55P03'])
            finally:
                for module,original in originals.items():module._execute=original
                release.set();assert done.wait(10),errors
            check('held-writer-completed-without-error',not errors)
            result=apply_migration_on_host(host,plan,**kwargs)
            check('exact-retry-after-lock-refusal-commits-one-fill',result['status']=='committed' and len(host.dispatch)==1)
            connection.execute('RESET ROLE')
            rows=connection.execute(sql.SQL('SELECT id,summary FROM {} ORDER BY id').format(table)).fetchall()
            check('historical-fill-is-explicit-and-preserves-present-values',rows==[('a','kept'),('b','filled')])
            final_default=connection.execute('SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name=%s AND column_name=%s',(cfg['schema'],'notes','summary')).fetchone()
            check('future-default-native-expression-is-unchanged',native_default is not None and final_default==native_default)
            connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(people[0])))
            connection.execute(sql.SQL('INSERT INTO {} (id,owner) VALUES (%s,%s)').format(table),('future',people[0]))
            future=connection.execute(sql.SQL('SELECT summary FROM {} WHERE id=%s').format(table),('future',)).fetchone()
            check('omitted-value-uses-preserved-future-default',future==('future',))
            refused=False
            try:connection.execute(sql.SQL('INSERT INTO {} (id,owner,summary) VALUES (%s,%s,NULL)').format(table),('explicit-null',people[0]))
            except psycopg.errors.NotNullViolation:refused=True
            check('explicit-null-still-refuses-despite-future-default',refused)
            connection.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
            replay=apply_migration_on_host(host,plan,**kwargs)
            check('applied-replay-does-not-dispatch-fill-again',replay['status']=='already-applied' and len(host.dispatch)==1)
    finally:
        if created:admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db)))
        for role in reversed(made):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
report.write_text(json.dumps({'status':'passed','server':server,'checks':checks,'heldWriterFailure':failure,'nativeLockSqlstates':lock_states,'nativeLockStatements':lock_statements},indent=2)+'\n')
print(json.dumps({'status':'passed','checks':len(checks)}))
