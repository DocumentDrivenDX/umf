"""Original compiler key/native layout witness; no full backend qualification."""
import hashlib,json,os,uuid
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
# Reuse only reviewed fixture setup/connection helpers, not model-provided code.
source_bytes=runner.read_bytes();source=source_bytes.decode('utf-8')
marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
prefix=source.split(marker)[0]
context={'__name__':'fixture_helpers'}
exec(compile(prefix,str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tools/security/pg-compiler-keys.py'),Path('tools/security/truss-key-namespace.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts'),Path('/Users/erik/Projects/truss/packages/umf-bun/src/index.ts'),Path('/Users/erik/Projects/truss/tests/umf-fixtures/value-key.json'),Path('/Users/erik/Projects/truss/docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql'),Path('/Users/erik/Projects/truss/packages/postgresql/native/canonical-string-bytes.sql'),Path('/Users/erik/Projects/truss/packages/postgresql/native/canonical-tree-bytes.sql'),Path('/private/tmp/truss-umf-runtime-bG1IMG/producer.js'),Path('/private/tmp/truss-umf-runtime-bG1IMG/producer-manifest.json'),Path('tools/security/reviewed-python.py'),Path('tools/security/pg-association.py'),Path('docs/helix/04-build/evidence/security/weft-handoff.json')]}
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Fixture source changed before capture')
observations=[];receipt=None
try:
 names=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines()
 if name in names:raise RuntimeError('Refusing preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 import time
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 if version['number']!='170009':raise RuntimeError('Unqualified engine version')



 require(sql('CREATE SCHEMA truss'))
 for native_path in ['/Users/erik/Projects/truss/packages/postgresql/native/canonical-string-bytes.sql','/Users/erik/Projects/truss/packages/postgresql/native/canonical-tree-bytes.sql']:require(sql(Path(native_path).read_text()))
 import copy
 base={'profile':'truss-key-bucket/0.1.0','sourceEpoch':'fixture-only-epoch','installationId':run_id,'typeId':'1','keyNumber':'1','encoding':{'identity':'umf-key-tuple-v1','version':'3.0.0','sha256':'a'*64}}
 def vector(selection):return [selection['profile'],selection['sourceEpoch'],selection['installationId'],selection['typeId'],selection['keyNumber'],selection['encoding']['identity'],selection['encoding']['version'],selection['encoding']['sha256']]
 def canonical(values):
  tree={'kind':'array','items':[{'kind':'string','utf8Hex':v.encode().hex()} for v in values]}
  return value("SELECT pg_catalog.to_json(pg_catalog.encode(truss.runtime_canonical_tree_bytes('"+json.dumps(tree)+"'::jsonb),'hex'))")
 original=canonical(vector(base));cases=[]
 def add(id,selection,expected,stored=None):
  values=vector(selection) if all(isinstance(v,str) for v in vector(selection)) else None
  encoded=canonical(values) if values else original
  cases.append({'id':id,'selection':selection,'stored':encoded if stored is None else stored,'expected':expected,'canonicalValues':values,'canonicalHex':encoded})
 add('original-positive-profile',base,True)
 for id,typ,key in [('signed-minimum','-2147483648','-32768'),('signed-maximum','2147483647','32767'),('signed-zero','0','0')]:
  selected=copy.deepcopy(base);selected.update(profile='truss-key-bucket/0.2.0',typeId=typ,keyNumber=key);add(id,selected,True)
 selected=copy.deepcopy(base);selected['sourceEpoch']='雪🙂'+chr(0)+chr(10)+'"'+chr(92);add('original-native-control-unicode-spelling',selected,True)
 for id,field,changed in [('positive-zero','typeId','0'),('positive-negative','keyNumber','-1'),('type-overflow','typeId','2147483648'),('key-overflow','keyNumber','32768'),('negative-zero','typeId','-0'),('leading-zero','keyNumber','01'),('leading-plus','typeId','+1'),('native-number-carrier','typeId',1),('unknown-profile','profile','truss-key-bucket/9.0.0')]:
  selected=copy.deepcopy(base);selected[field]=changed;add(id,selected,False)
 for id,field in [('changed-installation','installationId'),('changed-epoch','sourceEpoch'),('changed-native-type','typeId'),('changed-native-key','keyNumber')]:
  selected=copy.deepcopy(base);selected[field]='2';add(id,selected,False,original)
 selected=copy.deepcopy(base);selected['encoding']['sha256']='b'*64;add('changed-codec-pin',selected,False,original)
 add('noncanonical-whitespace',base,False,json.dumps(vector(base)).encode().hex())
 add('trailing-original-byte',base,False,original+'00')
 add('malformed-utf8',base,False,'ff')
 selected=copy.deepcopy(base);selected['extra']='unknown';add('unknown-selection-meaning',selected,False,original)
 result=json.loads(require(command(['bun','tools/security/truss-key-namespace.ts'],input=json.dumps({'cases':cases}))))
 observations=result['observations']
 if len(observations)!=len(cases) or any(o['expected']!=o['observed'] for o in observations):raise RuntimeError('Invalid namespace observations')
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in sources.items()):raise RuntimeError('Original namespace source changed')
 receipt={'status':'passed','runId':run_id,'sourceDigests':sources,'versions':{'postgresql':version,'imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']]))},'observations':observations,'cases':cases,'scope':'Actual portable Truss key namespace grammar/correspondence against original native canonical helpers on PostgreSQL 17.9. Candidate 0.1 positive and 0.2 signed integer grammar, full scalar/pin equality and exact canonical byte spelling only. Synthetic epoch/installation selections and codec labels are not registered authority; signed-zero syntax does not establish original key definition. No native registry/source authentication, active 0.2 installation, protected graph admission/current authority/guard or full backend case.'}

finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing counterexample evidence')
Path('docs/helix/04-build/evidence/security/truss-key-namespace.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
