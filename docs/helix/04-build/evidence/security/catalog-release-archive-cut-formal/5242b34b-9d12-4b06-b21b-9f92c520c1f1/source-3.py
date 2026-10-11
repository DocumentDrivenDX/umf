"""Frozen original release-selection native checks; no authenticated PA admission."""
import hashlib,importlib.metadata,importlib.util,json,os,shutil,subprocess,sys,tempfile,uuid,zipfile
from pathlib import Path
countercontrol=sys.argv[1:]==['--countercontrol-no-archive-lock']
if sys.argv[1:] and not countercontrol:raise ValueError('Explicit supported native control required')
root=Path.cwd();run_id=str(uuid.uuid4())
folder=root/'docs/helix/04-build/evidence/python-catalog-report-release'/run_id
folder.mkdir(parents=True);os.umask(0o077)
inputs={}
def retain(path):
    p=root/path;inputs[str(p)]=p.read_bytes()
for p in (root/'packages/python/src/truss').rglob('*'):
    if p.is_file() and '__pycache__' not in p.parts:inputs[str(p)]=p.read_bytes()
for name in ('test_catalog_report_release_native.py','test_native_pg8000.py'):
    retain('packages/python/tests/'+name)
for name in ('source-epoch-lock','issued-operation-admission/operation-configuration-context-admission',
             'catalog-observation-recheck','catalog-epoch-context','operation-configuration-current',
             'catalog-admission-configuration','catalog-report/release-selection'):
    retain('packages/postgresql/native/'+name+'.sql')
for path in ('docs/helix/04-build/evidence/source-epoch-layout-0.16.owner-export.sql',
             'docs/helix/04-build/evidence/operation-configuration-storage.owner-export.sql',
             'docs/helix/04-build/evidence/design-audit/pgserver-populated-guard-fixture.sql',
             'scripts/check-python-catalog-report-release-native.py','scripts/check-module-boundaries.py'):
    retain(path)
policy=json.loads((root/'packages/python/src/truss/_profiles/catalog-report-release.json').read_bytes())
for entry in policy['resources']:retain(entry['path'])
for package in ('pg8000','scramp','asn1crypto'):
    base=Path(importlib.util.find_spec(package).origin).parent
    for p in base.rglob('*.py'):inputs[str(p)]=p.read_bytes()
    dist=importlib.metadata.distribution(package)
    for f in dist.files:
        if str(f).endswith('.dist-info/METADATA'):
            p=Path(dist.locate_file(f));inputs[str(p)]=p.read_bytes()
sha=lambda raw:hashlib.sha256(raw).hexdigest()
pins={p:sha(raw) for p,raw in inputs.items()}
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for p,raw in inputs.items():archive.writestr(p.lstrip('/'),raw)
pgbin=Path(os.environ['TRUSS_CENSUS_POSTGRES_BIN']).resolve()
binaries={str(p):sha(p.read_bytes()) for p in pgbin.parent.rglob('*') if p.is_file()}
execution=Path(tempfile.mkdtemp(prefix='truss-release-execution-'))
socket=Path(tempfile.mkdtemp(prefix='rl-',dir='/private/tmp'))
pgdata=execution/'pgdata';attempted=False;receipt=None

def run(argv,**kw):
    return subprocess.run(argv,capture_output=True,text=True,timeout=kw.pop('timeout',30),**kw)
def require(result):
    if result.returncode:raise RuntimeError(result.stderr[-4000:])
    return result
try:
    for name,raw in inputs.items():
        p=Path(name)
        if p.is_relative_to(root):target=execution/'checkout'/p.relative_to(root)
        else:
            # Execute exact dependency package bytes, rather than installed aliases.
            selected=next((part for part in ('pg8000','scramp','asn1crypto') if part in p.parts),None)
            if selected is None:continue  # Distribution metadata retained as evidence.
            target=execution/'dependencies'/Path(*p.parts[p.parts.index(selected):])
        if countercontrol and name==str(root/'packages/postgresql/native/catalog-report/release-selection.sql'):
            marker=b' LOCK TABLE truss.installation_archive IN SHARE MODE NOWAIT;'
            if raw.count(marker)!=1:raise RuntimeError('Exact archive-lock control site required')
            raw=raw.replace(marker,b' -- Deliberate negative control: archive table lock omitted.')
            (folder/'countercontrol-release-selection.sql').write_bytes(raw)
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        if target.read_bytes()!=raw:raise RuntimeError('Frozen source readback differs')
    if any(Path(p).read_bytes()!=raw for p,raw in inputs.items()):raise RuntimeError('Source changed before native execution')
    require(run([str(pgbin/'initdb'),'-D',str(pgdata),'-U','postgres','--auth=trust','--encoding=UTF8'],timeout=60))
    attempted=True
    require(run([str(pgbin/'pg_ctl'),'-D',str(pgdata),'-l',str(execution/'server.log'),'-w','-o',f"-h '' -k {socket}",'start'],timeout=60))
    test=run([sys.executable,'-m','unittest','discover','-s',str(execution/'checkout/packages/python/tests'),'-p','test_catalog_report_release_native.py','-v'],
        cwd=execution/'checkout',env={**os.environ,'PYTHONPATH':str(execution/'checkout/packages/python/src')+os.pathsep+str(execution/'dependencies'),
        'TRUSS_NATIVE_TEST_SOCKET':str(socket/'.s.PGSQL.5432')},timeout=120)
    (folder/'tests.stdout.log').write_text(test.stdout);(folder/'tests.stderr.log').write_text(test.stderr)
    if countercontrol:
        if test.returncode!=1 or test.stderr.count('DatabaseError not raised')!=4 or 'FAILED (failures=4)' not in test.stderr:
            raise RuntimeError('Expected four native archive-cut counterexamples required')
    else:require(test)
    if 'Ran 12 tests' not in test.stderr or 'skipped' in test.stderr:raise RuntimeError('Complete twelve-test native population required')
    boundary=run([sys.executable,'scripts/check-module-boundaries.py'])
    (folder/'boundaries.stdout.log').write_text(boundary.stdout);(folder/'boundaries.stderr.log').write_text(boundary.stderr);require(boundary)
    if any(Path(p).read_bytes()!=raw for p,raw in inputs.items()):raise RuntimeError('Source changed during native execution')
    receipt={'status':'countercontrol-reproduced' if countercontrol else 'component-passed','countercontrol':countercontrol,'runId':run_id,'sourceDigests':pins,'nativeBinaryDigests':binaries,
        'executedReleaseSqlSha256':sha((execution/'checkout/packages/postgresql/native/catalog-report/release-selection.sql').read_bytes()),'testCommand':test.args,'testExitCode':test.returncode,'nativeTests':12,'python':sys.version,
        'versions':{p:importlib.metadata.version(p) for p in ('pg8000','scramp','asn1crypto')},
        'scope':('Deliberate omitted-archive-lock native variant reproduces four exact exclusion assertion failures. ' if countercontrol else '')+'Frozen original private release selector and tests over owned installed PostgreSQL16.15 Unix fixture. SHARE table lock excludes concurrent archive writes; transaction/savepoint controls qualify only native archive cut lifetime. Administrative synthetic configuration/archive/capture fixtures do not establish authenticated caller, source issuer, complete installed source/authority cut, host held-use dispatcher, public installer, complete accepted report or final disclosure.'}
except BaseException as error:
    receipt={'status':'failed','runId':run_id,'sourceDigests':pins,'nativeBinaryDigests':binaries,'error':str(error)}
finally:
    cleanup={'attempted':attempted}
    try:
        if attempted:
            stopped=run([str(pgbin/'pg_ctl'),'-D',str(pgdata),'-w','-m','immediate','stop'])
            state=run([str(pgbin/'pg_ctl'),'-D',str(pgdata),'status'])
            cleanup.update(stopExitCode=stopped.returncode,statusExitCode=state.returncode,socketAbsent=not (socket/'.s.PGSQL.5432').exists())
            (folder/'server.log').write_bytes((execution/'server.log').read_bytes())
            if stopped.returncode or state.returncode!=3 or not cleanup['socketAbsent']:receipt['status']='failed'
        if any(sha(Path(p).read_bytes())!=h for p,h in binaries.items()):receipt['status']='failed';receipt['binaryDrift']=True
        if not attempted or cleanup.get('statusExitCode')==3 and cleanup.get('socketAbsent'):
            shutil.rmtree(execution);shutil.rmtree(socket)
        else:cleanup['retainedExecutionDirectory']=str(execution)
    except BaseException as error:receipt['status']='failed';cleanup['error']=str(error)
    receipt['cleanup']=cleanup;(folder/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'evidence':str(folder)}))
if receipt['status'] not in ('component-passed','countercontrol-reproduced'):raise SystemExit(1)
