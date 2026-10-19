"""Owned rollback-only graph stage; no ordinary enforcement or graph acceptance."""
import hashlib,json,os,re,tempfile,time,uuid
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B05'
os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
source=runner.read_bytes(); marker='receipt=None\ntry:\n'
if source.decode().count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
context={'__name__':'fixture_helpers'}
exec(compile(source.decode().split(marker)[0],str(runner),'exec'),context)
command,require,sql=context['command'],context['require'],context['sql']
run_id,name=context['run_id'],context['name']
truss=Path('/Users/erik/Projects/truss')
components=['operation-admission','operation-commit-barrier','catalog-generation-observer','catalog-document-batch','catalog-lineage-producer','catalog-source-integrity','catalog-type-match','catalog-type-stage','catalog-property-match','catalog-property-stage','catalog-key-match','catalog-key-stage','catalog-key-batch','catalog-relationship-match','catalog-relationship-stage','catalog-report-documents','catalog-new-inventory','catalog-observation-recheck','catalog-input-custody','catalog-prestate-capture','catalog-new-prestate-parity','catalog-new-counts','catalog-provisional-empty','catalog-report-immutability','catalog-original-context','operation-generation-observer','canonical-string-bytes','canonical-tree-bytes','object-key-stage']
layout=truss/'docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql'
native_paths=[truss/('packages/postgresql/native/'+name+'.sql') for name in components]
paths=[Path(__file__),runner,Path('tools/security/truss-graph-native-stage.ts'),Path('tools/security/truss-graph-native-stage-typecheck.json'),layout,*native_paths,truss/'docs/helix/02-design/contracts/acceptance-input-v0.1.schema.json',truss/'docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json',Path('package.json')]
for root in ['packages/umf-bun/src','packages/postgresql/src','packages/pg-runtime/src','docs/helix/02-design/contracts/bindings']:
 paths.extend(p for p in (truss/root).rglob('*') if p.is_file() and p.suffix in ['.ts','.json'])
for directory in ['/private/tmp/truss-umf-runtime-LmpSsH','/private/tmp/truss-umf-runtime-bG1IMG']:
 paths.extend(Path(directory)/name for name in ['producer.js','producer-manifest.json'])
dependency_inventory=json.loads(Path('tests/security/native/pg-runtime-dependency-inventory.json').read_text())
paths.extend(Path(p) for p in dependency_inventory['files'])
paths.append(Path('tests/security/native/pg-runtime-dependency-inventory.json'))
ajv_root=Path('node_modules').resolve()
pending=[Path('node_modules/ajv').resolve()];ajv_packages={};ajv_files=set()
while pending:
 directory=pending.pop()
 if str(directory) in ajv_packages:continue
 if ajv_root not in directory.parents:raise RuntimeError('Ajv dependency escapes selected root')
 manifest=json.loads((directory/'package.json').read_text())
 ajv_packages[str(directory)]={'name':manifest['name'],'version':manifest['version']}
 for path in directory.rglob('*'):
  if path.is_file() and path.suffix in ['.js','.mjs','.cjs','.json'] and 'node_modules' not in path.relative_to(directory).parts:ajv_files.add(str(path.resolve()))
 for dependency in manifest.get('dependencies',{}):
  candidates=[directory/'node_modules'/dependency,directory.parent/dependency,*[ancestor/'node_modules'/dependency for ancestor in directory.parents]]
  selected=next((path.resolve() for path in candidates if (path/'package.json').is_file()),None)
  if selected is None:raise RuntimeError('Missing Ajv dependency')
  pending.append(selected)
paths.extend(Path(path) for path in sorted(ajv_files))
ajv_entry=str(Path('node_modules/ajv').resolve()/'dist/2020.js')
compiler_proof_path=Path('docs/helix/04-build/evidence/security/original-graph-ir-formal.json')
compiler_proof=json.loads(compiler_proof_path.read_text())
if hashlib.sha256(Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_candidate_ir').read_bytes()).hexdigest()!=compiler_proof['binarySha256']:raise RuntimeError('Original compiler binary differs')
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in compiler_proof['sourceDigests'].items()):raise RuntimeError('Stale original compiler proof sources')
paths.extend([compiler_proof_path,Path('tools/security/truss-graph-condition-request.ts'),Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_candidate_ir'),*[Path(p) for p in compiler_proof['sourceDigests']]])
hash_file=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
pins={str(p):hash_file(p) for p in paths}
journal_directory=tempfile.mkdtemp(prefix='umf-graph-stage-',dir='/private/tmp')
os.chmod(journal_directory,0o700)
receipt=None
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture refuses')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'--publish','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+30
 while True:
  ready=sql('SELECT current_setting(\'server_version_num\')','postgres',context['credentials']['postgres'])
  if ready.returncode==0:
   if ready.stdout.strip()!='170009':raise RuntimeError('Unqualified engine')
   break
  if time.monotonic()>deadline:raise TimeoutError('Original TCP readiness unavailable')
  time.sleep(.1)
 require(sql(layout.read_text()))
 for path in native_paths:require(sql(path.read_text()))
 port_text=require(command(['docker','port',context['container'],'5432/tcp']))
 match=re.fullmatch(r'127\.0\.0\.1:([0-9]+)',port_text)
 if not match:raise RuntimeError('Non-loopback fixture binding')
 result=command(['bun','tools/security/truss-graph-native-stage.ts'],env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':match[1],'UMF_TRUSS_INSTALLER_PASSWORD':context['credentials']['postgres'],'UMF_TRUSS_JOURNAL_DIRECTORY':journal_directory},timeout=45)
 report=json.loads(require(result))
 observations=report['observations']
 if report['status']!='passed-candidate-native-mapping' or len(observations)!=88 or len({o['id'] for o in observations})!=88 or any(o['expected']!=o['observed'] for o in observations):raise RuntimeError('Incomplete original candidate evidence')
 if report['observedDriverEntries']!={'probe':dependency_inventory['entry'],'runtimeImporter':dependency_inventory['entry']} or report['observedAjvEntry']!=ajv_entry:raise RuntimeError('Original dependency resolution changed')
 if any(hash_file(p)!=h for p,h in pins.items()):raise RuntimeError('Candidate sources changed')
 receipt={'status':'passed-candidate-native-mapping','runId':run_id,'sourceDigests':pins,'freshNativeExecution':True,'nativeImplementationQualified':False,'dependencyInventory':{'pg':dependency_inventory,'ajv':{'entry':ajv_entry,'packages':ajv_packages,'files':sorted(ajv_files)}},'versions':{'postgresql':'170009','imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']]))},'journalDirectory':journal_directory,**report}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership changed')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing original graph evidence')
Path('docs/helix/04-build/evidence/security/truss-graph-native-stage.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(receipt['observations'])}))
