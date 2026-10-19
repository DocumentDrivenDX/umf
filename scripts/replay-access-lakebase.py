# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed native read/search replay in one explicitly owned temporary Lakebase.

The caller provisions the dedicated project and supplies its original UID. No
shared project, claimed Subject, secret file or unverified TLS fallback is used.
The complete temporary project is deleted in finally, including failed runs.
"""
from pathlib import Path
import argparse, hashlib, json, os, secrets, subprocess, sys, time
import psycopg
from psycopg import sql

parser=argparse.ArgumentParser()
for name in ('project','project-uid','profile','python','sdk-wheel','weft-wheel','root-cert','output'):
 parser.add_argument('--'+name,required=True)
args=parser.parse_args();root=Path(__file__).resolve().parent.parent;out=Path(args.output).absolute();out.mkdir(parents=True,exist_ok=False)
if args.project!='umf-typed-sdk-qualification-20261016':raise ValueError('Explicit original temporary qualification project required')
project='projects/'+args.project;credential={};private=[];owned=False;checks=[];status='fail';cleanup_errors=[]
def redact(value):
 for secret in private:value=value.replace(secret,'[redacted]')
 return value
def cli(*command):
 result=subprocess.run(['databricks',*command,'--profile',args.profile,'-o','json'],capture_output=True,text=True,timeout=60)
 if result.returncode:raise RuntimeError('Native CLI command refused: '+redact(result.stderr)[:2000])
 return json.loads(result.stdout)if result.stdout.strip()else None
def record(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
def run(label,command,env=None):
 result=subprocess.run(list(map(str,command)),cwd=root,env=env,text=True,capture_output=True,timeout=600)
 (out/(label+'.log')).write_text(redact(result.stdout+result.stderr));checks.append({'label':label,'exitCode':result.returncode})
 if result.returncode:raise RuntimeError(label+' failed; see redacted retained log')
try:
 native=cli('postgres','get-project',project)
 if native['uid']!=args.project_uid or native['status']['pg_version']!=18:raise ValueError('Original test project incarnation differs')
 actor=cli('current-user','me')['userName']
 if native['status']['owner']!=actor:raise ValueError('Temporary project must be owned by this authenticated actor')
 owned=True;record('project.json',native)
 endpoint=cli('postgres','get-endpoint',native['status']['default_branch']+'/endpoints/primary')
 settings=endpoint['status']
 if settings['autoscaling_limit_min_cu']!=0.5 or settings['autoscaling_limit_max_cu']!=0.5 or settings['suspend_timeout_duration']!='60s':raise ValueError('Exact bounded qualification compute settings required')
 record('endpoint.json',endpoint)
 credential=cli('postgres','generate-database-credential',endpoint['name'],'--ttl','900s');private.append(credential['token']);role_password=secrets.token_urlsafe(32);private.append(role_password)
 kwargs=dict(host=settings['hosts']['host'],dbname='databricks_postgres',user=actor,sslmode='verify-full',sslrootcert=args.root_cert,connect_timeout=10)
 with psycopg.connect(**kwargs,password=credential['token'],autocommit=True)as admin:
  if admin.info.server_version!=180006:raise ValueError('Exact native PostgreSQL 18.6 cohort required')
  identity=admin.execute('SELECT current_user,session_user,current_database(),version()').fetchone();record('native-identity.json',identity)
  version=admin.execute("SELECT default_version FROM pg_available_extensions WHERE name='vector'").fetchone()[0]
  if version not in ('0.8.6','0.8.7'):raise ValueError('Exact implemented native vector cohort required')
  # This is the original validated temporary project, containing only our own fixtures.
  for schema in ('praxis_test','praxis_other','search_app'):admin.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
  admin.execute('DROP EXTENSION IF EXISTS vector')
  for role in ('praxis_a','praxis_b','search_user','hidden_user'):admin.execute(sql.SQL('DROP ROLE IF EXISTS {}').format(sql.Identifier(role)))
  for role in ('praxis_a','praxis_b','search_user'):admin.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(sql.Identifier(role),sql.Literal(role_password)))
 env={k:v for k,v in os.environ.items()if k not in ('PYTHONPATH','PYTHONHOME','MYPYPATH','UMF_WEFT_RAW_COMPILER','PGPASSWORD','PGSERVICE','PGSERVICEFILE')}
 env.update(PGPASSWORD=role_password,UMF_PG_ADMIN_TEST_PASSWORD=credential['token'],UMF_PG_TEST_DSN=psycopg.conninfo.make_conninfo(**kwargs),UMF_GENERATED_REPORTING_PACKAGE='1')
 guard="""import zipfile,sys
from pathlib import Path
import umf_access,weft
for wheel,module,prefix in [(sys.argv[1],umf_access,'umf_access/'),(sys.argv[2],weft,'weft/')]:
 site=Path(module.__file__).parent.parent
 assert '/site-packages/' in str(module.__file__)
 with zipfile.ZipFile(wheel) as archive:
  for name in archive.namelist():
   if name.startswith(prefix) and not name.endswith('/'):assert (site/name).read_bytes()==archive.read(name),name
"""
 run('installed-bytes',[args.python,'-I','-B','-c',guard,args.sdk_wheel,args.weft_wheel],env)
 run('generate-reads',['bun','scripts/generate-access-reporting-fixture.ts',out/'reads','--reads-only'],env)
 native_tests="""import sys,unittest
sys.path.insert(0,sys.argv[1])
suite=unittest.defaultTestLoader.discover(sys.argv[2],pattern='test_reviewed_reads.py')
result=unittest.TextTestRunner(verbosity=2).run(suite)
assert not result.skipped
assert result.wasSuccessful()
"""
 run('native-reads',[args.python,'-I','-B','-c',native_tests,out/'reads',root/'python/umf_access/tests'],env)
 run('generate-search',['bun','scripts/generate-access-search-fixture.ts',out/'search','--lakebase'],env)
 env.update(UMF_SEARCH_TEST_ADMIN_PASSWORD=credential['token'],UMF_SEARCH_TEST_DSN=psycopg.conninfo.make_conninfo(**kwargs),UMF_SEARCH_VECTOR_VERSION=version,UMF_SEARCH_TARGET_KIND='lakebase',UMF_SEARCH_GENERATED_ROOT=str(out/'search'))
 run('native-search',[args.python,'-I','-B',root/'python/umf_access/tests/search_e2e.py'],env)
 run('installed-bytes-final',[args.python,'-I','-B','-c',guard,args.sdk_wheel,args.weft_wheel],env)
 status='pass'
finally:
 credential.clear()
 if owned:
  try:
   observed=cli('postgres','get-project',project)
   if observed['uid']!=args.project_uid:raise ValueError('Original temporary project changed before cleanup')
   operation=cli('postgres','delete-project',project,'--no-wait');record('delete-operation.json',operation);until=time.monotonic()+300
   while not operation.get('done',False):
    if time.monotonic()>until:raise TimeoutError('Native project deletion deadline')
    time.sleep(2);operation=cli('postgres','get-operation',operation['name'])
   record('delete-completed.json',operation)
   if operation.get('error'):raise RuntimeError('Native project deletion failed')
  except Exception as error:
   cleanup_errors.append(type(error).__name__);(out/'cleanup-failure.txt').write_text(redact(str(error))[:2000])
 report={'status':status if not cleanup_errors else 'cleanup-failed','checks':checks,'project':project,'projectUid':args.project_uid,'sdkWheelSha256':hashlib.sha256(Path(args.sdk_wheel).read_bytes()).hexdigest(),'weftWheelSha256':hashlib.sha256(Path(args.weft_wheel).read_bytes()).hexdigest(),'cleanupErrors':cleanup_errors,'temporal':'HELD','scope':'Installed native Lakebase PostgreSQL 18.6 read/catalog/RLS/page/stream and exact search sync/async cohort. Protected engine actions, managed mutation authority and full backend acceptance remain separate gates.'}
 record('verification.json',report);private.clear()
 if cleanup_errors:raise RuntimeError('Native qualification project cleanup failed')
print(json.dumps({'status':status,'report':str(out/'verification.json')}))
