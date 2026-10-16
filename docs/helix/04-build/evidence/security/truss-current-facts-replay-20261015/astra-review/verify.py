import hashlib,io,json,pathlib,subprocess,tarfile,zipfile
out=pathlib.Path(__file__).resolve().parent
root=pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf')
run=pathlib.Path('/private/tmp/truss-current-facts-root-replay-20261015-r2')
truss=pathlib.Path('/private/tmp/truss-main-integration-20261010')
sha=lambda b:hashlib.sha256(b).hexdigest()
r=json.loads((run/'receipt.json').read_text()); pins=r['trackedInputs'];checks=[]
def check(name,value,detail=None):
 checks.append({'name':name,'passed':bool(value),'detail':detail});assert value,name
check('retained-receipt-passed-two-tests',r['status']=='passed' and r['tests']==2)
check('current-harness-exact',sha((root/'tools/security/truss-current-facts-replay.py').read_bytes())==r['harnessSha256'])
check('input-archive-exact',sha((run/'original-inputs.zip').read_bytes())==r['archiveSha256'])
with zipfile.ZipFile(run/'original-inputs.zip') as z:
 entries=z.namelist();check('archive-unique-exact-entry-set',len(entries)==len(set(entries)) and set(entries)==set(pins),len(entries))
 check('every-archived-input-exact',all(sha(z.read(p))==h for p,h in pins.items()),len(pins))
check('every-extracted-original-input-exact',all(sha((run/'original'/p).read_bytes())==h for p,h in pins.items()),len(pins))
paths=['packages/python/src','packages/python/tests','packages/postgresql','docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json']
data=subprocess.run(['git','-C',str(truss),'archive',r['sourceCommit'],*paths],check=True,stdout=subprocess.PIPE).stdout
with tarfile.open(fileobj=io.BytesIO(data)) as t:
 original={m.name:sha(t.extractfile(m).read()) for m in t.getmembers() if m.isfile()}
 check('fixed-commit-exact-file-population-and-bytes',original==pins,len(original))
mods=r['loadedTrussModules']
check('loaded-truss-module-digests-equal-original-commit',all(v['path'] in pins and v['sha256']==pins[v['path']] for v in mods.values()),len(mods))
check('module-receipt-paths-within-original-tree',all((run/'original'/v['path']).resolve().is_relative_to((run/'original').resolve()) for v in mods.values()))
child='packages/python/src/truss/_current_query_owner/current-query-child.mjs'
check('original-child-exact-r3-bundle',pins[child]==r['originalChildSha256']=='36e2c63fb0d942c9b94141f1753bcd9b56aad9e32dec5aa1a9ee27aabc674248')
native=pathlib.Path('/private/tmp/truss-clean-install-20261013/lib/python3.12/site-packages/pgserver/pginstall/bin/postgres')
check('selected-native-binary-still-exact',sha(native.read_bytes())==r['postgresBinarySha256'])
check('reported-server-profile',r['nativeObservation']['serverVersion']=='18.6' and r['nativeObservation']['runtimeVersion']=='18.6.1' and r['libpqVersion']==180006)
check('retained-cleanup-results',all(r[k] is True for k in ['originalRuntimeStopped','leaseReleased','testDirectoryAbsent']) and r['nativeObservation']['postmasterAbsent'] is True)
check('selected-data-directory-still-absent',not pathlib.Path(r['nativeObservation']['dataDirectory']).exists())
check('test-log-actual-two-ok', (run/'unittest.log').read_text().count(' ... ok\n')==2 and 'Ran 2 tests in 6.576s\n\nOK' in (run/'unittest.log').read_text())
check('no-acceptance-promotion',r['acceptanceCasesPromoted']==[])
selected=['tools/security/truss-current-facts-replay.py','docs/helix/03-test/test-plans/STP-056-security-bindings.md','docs/helix/04-build/implementation-plan.md','docs/helix/04-build/evidence/security/truss-current-facts-replay-20261015/README.md']
sourcepins={p:sha((root/p).read_bytes()) for p in selected}
for p in selected:
 dest=out/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((root/p).read_bytes())
original_selected=['packages/python/tests/test_current_query_facts_native.py','packages/python/tests/test_current_query_subjects_native.py','packages/python/tests/test_catalog_runtime_native.py','packages/python/src/truss/local_runtime.py','packages/python/src/truss/_current_query_computation.py','packages/python/src/truss/_current_query_pipe.py','packages/python/src/truss/_current_query_facts.py']
for p in original_selected:
 dest=out/'original-selected'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((run/'original'/p).read_bytes())
for name in ['receipt.json','unittest.log']:(out/('parent-'+name)).write_bytes((run/name).read_bytes())
(out/'source-pins.json').write_text(json.dumps({'umf':sourcepins,'originalSelected':{p:pins[p] for p in original_selected},'commit':r['sourceCommit'],'originalInputArchiveSha256':r['archiveSha256'],'selectedNativeBinarySha256':r['postgresBinarySha256']},indent=2)+'\n')
result={'status':'passed','checks':checks,'checkCount':len(checks),'trackedInputs':len(pins),'loadedTrussModules':len(mods),'nativeReplayPerformedByReviewer':False,'scope':'Read-only current-source, fixed Git commit, archive, selected module/binary and retained evidence correspondence. No DB/cloud/child process started.'}
(out/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
