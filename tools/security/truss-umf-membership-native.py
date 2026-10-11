"""Original native cohort joined membership evidence; no complete accepted report."""
import hashlib,json,os,pathlib,subprocess,time,uuid,zipfile
umf=pathlib.Path(__file__).resolve().parents[2];truss=pathlib.Path('/private/tmp/truss-security-main-integration');container='umf-membership-native-'+str(uuid.uuid4())
owners={'TRUSS_UMF_PRODUCER':'/private/tmp/truss-umf-runtime-LmpSsH','TRUSS_UMF_DECLARATION_PRODUCER':'/private/tmp/truss-umf-runtime-vKoRzl','TRUSS_UMF_FIELD_ASSERTION_PRODUCER':'/private/tmp/truss-umf-runtime-xZQtaP'}
paths={pathlib.Path(__file__).resolve(),truss/'scripts/check-catalog-new-cohort.ts',truss/'scripts/build-configuration-context-admission.py'}
for directory,pattern in [('packages/umf-bun/src','*.ts'),('packages/postgresql/src','*.ts'),('packages/postgresql/native','*.sql'),('docs/helix/02-design/contracts','*.json'),('docs/helix/02-design/contracts/bindings','*.d.ts')]:paths.update((truss/directory).rglob(pattern))
paths.add(truss/'docs/helix/03-test/report-wire-untrusted.fixture.json')
for name in ['qualified-property-layout-0.15.owner-export.sql','source-epoch-storage.owner-export.sql','operation-configuration-storage.owner-export.sql']:paths.add(truss/'docs/helix/04-build/evidence'/name)
for directory in owners.values():paths.update(pathlib.Path(directory)/name for name in ['producer.js','producer-manifest.json'])
images={str(p):p.read_bytes() for p in sorted(paths)};sha=lambda b:hashlib.sha256(b).hexdigest()
out=umf/'docs/helix/04-build/evidence/security/truss-umf-membership-native'/str(uuid.uuid4());out.mkdir(parents=True)
env={**os.environ,**owners,'TRUSS_OPERATION_TEST_URL':'postgres://postgres@127.0.0.1:15437/umf_membership','TRUSS_COHORT_EVIDENCE':str(out/'native-cohort.json')}
command=['bun','scripts/check-catalog-new-cohort.ts'];result=None;cleanup=None;inspect={};failure=None
container_id=subprocess.check_output(['docker','run','-d','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=umf_membership','-p','127.0.0.1:15437:5432','postgres:17.9'],text=True).strip()
try:
 assert len(container_id)==64 and all(c in '0123456789abcdef' for c in container_id)
 for attempt in range(60):
  ready=subprocess.run(['docker','exec',container_id,'pg_isready','-U','postgres','-d','umf_membership'],capture_output=True)
  if ready.returncode==0:break
  time.sleep(0.5)
 else:raise RuntimeError('Owned database did not become ready')
 inspect=json.loads(subprocess.check_output(['docker','inspect',container_id]))[0];assert inspect['Id']==container_id and inspect['State']['Running'];assert inspect['Config']['Image']=='postgres:17.9'
 result=subprocess.run(command,cwd=truss,env=env,text=True,capture_output=True,timeout=180)
except Exception as error:failure=str(error)
finally:
 try:cleanup=subprocess.run(['docker','rm','-f',container_id],text=True,capture_output=True,timeout=60)
 except Exception as error:cleanup=subprocess.CompletedProcess(['docker','rm','-f',container_id],1,'',str(error))
receipt={'status':'pass' if result and result.returncode==0 and cleanup.returncode==0 else 'fail','scope':'native_original_new_cohort_execution_and_declared_umf_membership_candidate_only','container':{'id':container_id,'name':container,'image':inspect.get('Image'),'declaredImage':inspect.get('Config',{}).get('Image'),'ports':inspect.get('NetworkSettings',{}).get('Ports')},'setupOrExecutionError':failure,'execution':None if result is None else {'command':command,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr},'cleanup':{'exitCode':cleanup.returncode,'stdout':cleanup.stdout,'stderr':cleanup.stderr},'sourceSha256':{p:sha(b) for p,b in images.items()},'owners':owners,'acceptedReportQualified':False,'supportSemanticsQualified':False,'acceptancePromoted':False,'limitations':['Actual PostgreSQL17.9 component cohort; installation/profile/semantic authority and complete acceptance remain unqualified.','Declared subset bytes are synthetic; original UMF bundles execute.','No full report persistence/head publication/finalizer or public acceptance is admitted.','Container image/local Bun/Ajv/Python/ambient runtime are observed dependencies, not hermetic closure.']}
for p,b in images.items():assert pathlib.Path(p).read_bytes()==b,p
with zipfile.ZipFile(out/'preimages.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p,b in images.items():z.writestr(p.lstrip('/'),b)
receipt['preimagesSha256']=sha((out/'preimages.zip').read_bytes());(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'receipt':str(out/'native.json'),'sources':len(images),'execution':receipt['execution']}))
if receipt['status']!='pass':raise SystemExit(1)
