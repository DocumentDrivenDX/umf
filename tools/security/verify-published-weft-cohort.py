"""Exact public-wheel payload and original Truss ABI2 selection correspondence.
No database execution, native authority or release-readiness conclusion.
"""
import argparse,hashlib,importlib,io,json,pathlib,subprocess,sys,tarfile,zipfile
p=argparse.ArgumentParser();p.add_argument('--truss',type=pathlib.Path,required=True);p.add_argument('--ci-wheel',type=pathlib.Path,required=True);p.add_argument('--public-wheel',type=pathlib.Path,required=True);p.add_argument('--checksums',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(exist_ok=False,parents=True)
sha=lambda b:hashlib.sha256(b).hexdigest();commit='ad794577539be9d059708a1f7e3a71857c644cbc';harness=pathlib.Path(__file__).resolve()
pins={str(q):sha(q.read_bytes()) for q in [harness,a.ci_wheel,a.public_wheel,a.checksums]}
assert pins[str(a.ci_wheel)]=='dfe0fa7f8286758c6e1f24e417e62e11f252dce9896ecf99800f5151b49c9fb3'
assert pins[str(a.public_wheel)]=='8ea8e06b7e8cf3623df69dd1e27c3bde3a1189f3adbd01c43f4a1519431b2b35'
checksums={}
for line in a.checksums.read_text().splitlines():
 digest,name=line.split();assert name not in checksums;checksums[name]=digest
assert checksums[a.public_wheel.name]==pins[str(a.public_wheel)]
expected_names={'weft/__init__.py','weft/weft.abi3.so',*[f'weft_sql-0.4.33.dist-info/{name}' for name in ['METADATA','WHEEL','RECORD']]}
installed=a.output/'public-installed';installed.mkdir();members={}
with zipfile.ZipFile(a.ci_wheel) as old,zipfile.ZipFile(a.public_wheel) as new:
 assert len(old.namelist())==len(set(old.namelist())) and len(new.namelist())==len(set(new.namelist()))
 assert set(old.namelist())==set(new.namelist())==expected_names
 for item in new.infolist():
  assert item.filename in expected_names and not item.is_dir() and (item.external_attr>>16)&0o170000!=0o120000
  before=old.read(item.filename);after=new.read(item.filename);assert before==after
  members[item.filename]=sha(after);q=installed/item.filename;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(after)
assert members['weft/weft.abi3.so']=='60b977a1c8b8a355b86be40375aab209ed894b172dbed972498721eab8bbddae'
archive=subprocess.check_output(['git','-C',str(a.truss),'archive',commit,'packages/python/src']);tree=a.output/'original';tree.mkdir()
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
 for item in tar.getmembers():assert (tree/item.name).resolve().is_relative_to(tree.resolve()) and (item.isfile() or item.isdir())
 tar.extractall(tree,filter='data')
source_pins={str(q.relative_to(tree)):sha(q.read_bytes()) for q in sorted(tree.rglob('*')) if q.is_file()}
with zipfile.ZipFile(a.output/'original-inputs.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
 for name in source_pins:z.write(tree/name,name)
sys.path[:0]=[str(installed),str(tree/'packages/python/src')]
weft=importlib.import_module('weft');native=importlib.import_module('weft.weft');assert pathlib.Path(weft.__file__).resolve().is_relative_to(installed) and pathlib.Path(native.__file__).resolve().is_relative_to(installed)
assert sha(pathlib.Path(native.__file__).read_bytes())==members['weft/weft.abi3.so'] and weft.CurrentQueryPreparation is native.CurrentQueryPreparation
original=importlib.import_module('truss._current_query_originals');assert pathlib.Path(original.__file__).resolve().is_relative_to(tree)
expected={'profile':'truss-current-query-consumer/0.1-candidate','umfRevision':'579675bdad79c349b06e25979108f8ac1bb7f7e0','umfBundleSha256':'36e2c63fb0d942c9b94141f1753bcd9b56aad9e32dec5aa1a9ee27aabc674248','umfManifestSha256':'98eed644128b6f77d087293360e062fc06cce941dcb686e09c35632a5560f03d','bunVersion':'1.4.2','weftRevision':'cc943a2f0ad87e3742cccdc171184bad7d4dbf60','weftWheelSha256':pins[str(a.public_wheel)],'weftModuleSha256':members['weft/weft.abi3.so'],'resultAbi':'weft.postgresql.current-values/0.2-candidate'}
assert original._actual_consumer()==expected;assert original._match_consumer(expected) is None
stale={**expected,'weftWheelSha256':pins[str(a.ci_wheel)]}
try:original._match_consumer(stale)
except ValueError as error:assert str(error)=='Unsupported exact query consumer selection'
else:raise AssertionError('Historical CI consumer selection silently migrated')
loaded={}
for name,module in list(sys.modules.items()):
 if name.startswith('truss') and getattr(module,'__file__',None):
  q=pathlib.Path(module.__file__).resolve();assert q.is_relative_to(tree.resolve());rel=str(q.relative_to(tree));assert sha(q.read_bytes())==source_pins[rel];loaded[name]={'path':rel,'sha256':source_pins[rel]}
assert all(sha((installed/name).read_bytes())==digest for name,digest in members.items())
assert all(sha(pathlib.Path(q).read_bytes())==digest for q,digest in pins.items()) and all(sha((tree/q).read_bytes())==digest for q,digest in source_pins.items())
(a.output/'receipt.json').write_text(json.dumps({'status':'passed','trussCommit':commit,'pinsBeforeAfter':pins,'wheelMembersIdentical':members,'sourceInputs':source_pins,'loadedTrussModules':loaded,'publicConsumer':expected,'historicalCiConsumerRefused':True,'archiveSha256':sha((a.output/'original-inputs.zip').read_bytes()),'scope':'All five wheel member payloads identical, with distinct explicitly pinned archives. Original committed Truss module selects public ARM ABI2 consumer and rejects historical CI selection; original UMF assets match. No database run, native authority, Linux execution, aggregate enrollment, independent release authenticity or new backend acceptance.'},indent=2)+'\n');print(json.dumps({'status':'passed','identicalWheelMembers':len(members),'sourceFiles':len(source_pins),'staleCiRefused':True,'nativeDatabaseRun':False}))
