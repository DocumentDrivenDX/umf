"""Actual Truss host context component on an owned native fixture; no graph gate."""
import hashlib,json,os,time,uuid,sys,tempfile
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01';os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
source_bytes=runner.read_bytes();source=source_bytes.decode();marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed native fixture helper boundary changed')
context={'__name__':'fixture_helpers'};exec(compile(source.split(marker)[0],str(runner),'exec'),context)
command=context['command'];require=context['require'];sql=context['sql'];value=context['value'];run_id=context['run_id'];name=context['name'];credentials=context['credentials']
paths=[str(Path(__file__)),str(runner),'tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-membership-oracle.json','tools/security/truss-subject-probe.ts','tools/security/truss-principal-typecheck.json','/Users/erik/Projects/truss/tests/pg-principal-wire.test.ts',
 '/Users/erik/Projects/truss/packages/pg-runtime/src/index.ts','/Users/erik/Projects/truss/packages/pg-runtime/src/native-query.ts','/Users/erik/Projects/truss/packages/pg-runtime/src/wire.ts','/Users/erik/Projects/truss/packages/pg-runtime/src/journal.ts',
 '/Users/erik/Projects/truss/packages/pg-runtime/package.json','/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules/pg/package.json']
digests={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
if digests[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Native fixture source changed')
journal_directory=tempfile.mkdtemp(prefix='umf-truss-subject-journal-',dir='/private/tmp')
os.chmod(journal_directory,0o700)
receipt=None
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Refusing preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'--publish','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 container=context['container'];deadline=time.monotonic()+25
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Owned native readiness deadline')
  time.sleep(.1)
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+credentials[actor]+"';"))
 require(sql("CREATE SCHEMA subject_component AUTHORIZATION umf_sec_guardian; CREATE TABLE subject_component.subject(id text PRIMARY KEY,native_login text NOT NULL UNIQUE); ALTER TABLE subject_component.subject OWNER TO umf_sec_guardian; INSERT INTO subject_component.subject VALUES ('alice','umf_sec_alice'),('bob','umf_sec_bob'),('outsider','umf_sec_outsider'); GRANT USAGE ON SCHEMA subject_component TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;"))
 version=value("SELECT json_build_object('number',current_setting('server_version_num'),'build',version());")
 if version['number']!='170009':raise RuntimeError('Unqualified engine version')
 endpoint=require(command(['docker','port',container,'5432/tcp']))
 if not endpoint.startswith('127.0.0.1:') or not endpoint.split(':')[1].isdigit():raise RuntimeError('Owned loopback endpoint required')
 result=command(['bun','tools/security/truss-subject-probe.ts'],timeout=45,env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':endpoint.split(':')[1],'UMF_TRUSS_ACTORS':json.dumps(credentials),'UMF_TRUSS_JOURNAL_DIRECTORY':journal_directory})
 if result.returncode:raise RuntimeError('Actual Truss native context component refused: '+result.stderr[:4000])
 report=json.loads(result.stdout)
 if report['status']!='passed' or not report['observations'] or any(o['expected']!=o['observed'] for o in report['observations']):raise RuntimeError('Invalid native component observations')
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in digests.items()):raise RuntimeError('Component source changed during execution')
 receipt={'status':'passed','runId':run_id,'sourceDigests':digests,'versions':{'postgresql':version,'bun':require(command(['bun','--version'])),'pg':json.loads(Path(paths[-1]).read_text())['version'],'python':sys.version.split()[0],'imageId':require(command(['docker','inspect','--format','{{.Image}}',container]))},'observations':report['observations'],'journalEvidence':report['journalEvidence'],'scope':report['scope']}
finally:
 if context['container'] is None and context['creation_attempted']:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:context['container']=matches[0]
 if context['container']:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',context['container']]))!=run_id:raise RuntimeError('Native fixture ownership differs')
  require(command(['docker','rm','-f',context['container']]))
if receipt is None:raise RuntimeError('No native component result')
Path('docs/helix/04-build/evidence/security/truss-subject.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(receipt['observations'])}))
