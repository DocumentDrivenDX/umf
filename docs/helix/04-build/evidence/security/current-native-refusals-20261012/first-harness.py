"""Owned native refusal-preservation component, not full pg-raw.B09 acceptance.
@covers US-056-AC7
@covers US-056-AC10
"""
import argparse,hashlib,json,os,re,secrets,subprocess,time,uuid
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--compiler-receipt',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
root=Path.cwd();sources=[Path(__file__).resolve(),a.compiler_receipt.resolve(),a.compiler_receipt.with_name('observations.json').resolve(),root/'tests/security/native/pg-raw-membership.sql',root/'tests/security/native/pg-raw-membership-oracle.json',root/'tools/security/pg-inventory.py',root/'tools/security/pg-authority-cut.py'];frozen={p:p.read_bytes() for p in sources}
receipt=json.loads(frozen[a.compiler_receipt.resolve()]);assert receipt['status']=='current-compiler-refusal-component-passed' and receipt['buildExitCode']==0
for name,h in receipt['sourceDigests'].items():
 path=Path(name);b=path.read_bytes();assert hashlib.sha256(b).hexdigest()==h,name;frozen[path]=b
binary=next(Path(n) for n in receipt['sourceDigests'] if Path(n).name=='umf-current-compiler-boundary');cases=json.loads(frozen[a.compiler_receipt.with_name('observations.json').resolve()]);assert len(cases)==9
oracle=json.loads(frozen[root/'tests/security/native/pg-raw-membership-oracle.json']);actors=list(oracle['actors']);assert all(re.fullmatch('[a-z_]+',s) for s in actors)
modules=[]
for source in ['pg-inventory.py','pg-authority-cut.py']:
 path=root/'tools/security'/source;module={};exec(compile(frozen[path],str(path),'exec'),module);modules.append(module)
run_id=str(uuid.uuid4());name='umf-current-refusals-'+run_id;created=False;attempted=False;observations=[];result={'status':'incomplete','runId':run_id,'observations':observations};credentials={s:secrets.token_hex(32) for s in ['postgres',*actors]}
def command(argv,**kw):return subprocess.run(argv,text=True,capture_output=True,timeout=kw.pop('timeout',15),**kw)
def require(r):
 if r.returncode:raise RuntimeError('Owned fixture command failed: '+r.stderr[:2000])
 return r.stdout.strip()
def sql(source,user='postgres'):
 args=['docker','exec','-i',name]
 if user=='postgres':args+=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres'];text=source
 else:args+=['sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -U "$1"','auth',user];text=credentials[user]+'\n'+source
 return command(args,input=text)
def value(source,user='postgres'):return json.loads(require(sql(source,user)))
def check(identity,expected,observed):
 observations.append({'id':identity,'expected':expected,'observed':observed});assert json.dumps(expected,sort_keys=True)==json.dumps(observed,sort_keys=True),identity
profile_sql="SELECT json_build_object('inventory',("+modules[0]['INVENTORY_SQL'].strip().rstrip(';')+"),'authority',("+modules[1]['SOURCE_SQL'].strip().rstrip(';')+"))"
def actor_read(actor):
 data=value("SELECT json_build_object('sessionUser',session_user::text,'currentUser',current_user::text,'pid',pg_backend_pid(),'roleSetting',current_setting('role'),'ids',(SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource))",actor)
 assert data['sessionUser']==actor and data['currentUser']==actor and data['roleSetting']=='none' and type(data['pid']) is int;return data
try:
 assert name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines();image=require(command(['docker','image','inspect','postgres:17.9','--format','{{.Id}}']));attempted=True
 require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}));created=True
 deadline=time.monotonic()+30
 while command(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Owned fixture startup deadline')
  time.sleep(.1)
 require(sql(frozen[root/'tests/security/native/pg-raw-membership.sql'].decode()))
 for actor in actors:require(sql("ALTER ROLE "+actor+" PASSWORD '"+credentials[actor]+"';"))
 baseline=value(profile_sql);result['baseline']=baseline;result['imageId']=image;result['engine']=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'))")
 check('excluded-admin-control',['RA','RAB','RB','RD','RO'],value("SELECT json_agg(id ORDER BY id) FROM security_raw.resource"))
 for case in cases:
  request=case['requestJson'];run=command([str(binary)],input=json.dumps({'mode':case['mode'],'requestJson':request}),timeout=10);require(run);assert not run.stderr
  observed=json.loads(run.stdout);expected=case['expected'];response=observed['response'];checks={k:observed[k] for k in ['ordinaryFactoryInvoked','securityFactoryInvoked','lowerInvoked']};checks['diagnosticCode']=response['diagnostics'][0]['code'];check('compiler:'+case['id'],expected,checks);assert response['status']=='blocked' and not any(k in response for k in ['sql','parameters','logicalPlan'])
  observations.append({'id':'original-response:'+case['id'],'requestJson':request,'observed':observed})
  check('native-profile:'+case['id'],baseline,value(profile_sql))
  for actor in actors:
   data=actor_read(actor);observations.append({'id':'original-actor:'+case['id']+':'+actor,'observed':data});check('protected-ids:'+case['id']+':'+actor,oracle['actors'][actor]['ids'],data['ids'])
 if any(p.read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Original sources changed')
 result.update(status='current-native-refusal-component-passed',compilerCommit=receipt['weftCommit'],sourcesUnchanged=True,sourceDigests={str(p):hashlib.sha256(b).hexdigest() for p,b in frozen.items()},scope='Nine current compiler cases while an owned PostgreSQL17.9 raw fixture remains protected. No candidate installation, source-to-native semantic admission, real history/composition/partial activation or complete B09/B12 qualification.')
except BaseException as e:result['failure']={'type':type(e).__name__,'message':str(e)};raise
finally:
 cleanup={'attempted':attempted,'ownedLabelVerified':False,'removed':False}
 if attempted:
  inspect=command(['docker','inspect',name,'--format','{{ index .Config.Labels "umf.security.run" }}'])
  if inspect.returncode==0:
   if require(inspect)!=run_id:raise RuntimeError('Owned fixture label mismatch; cleanup refused')
   cleanup['ownedLabelVerified']=True;removed=command(['docker','rm','-f',name]);cleanup['removed']=removed.returncode==0;cleanup['removeExitCode']=removed.returncode;require(removed)
   after=command(['docker','inspect',name]);cleanup['absentAfterRemoval']=after.returncode!=0 and 'No such' in after.stderr
  elif 'No such' in inspect.stderr:cleanup['absentAfterRemoval']=True
  else:cleanup['unknown']=True
 result['cleanup']=cleanup;(out/'native.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'observations':len(observations),'cleanup':cleanup}))
