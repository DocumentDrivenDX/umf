"""Actual source interpretation/correspondence spike; no issuer/native authority."""
import copy,hashlib,json,os,runpy,shutil,subprocess,sys,tempfile,uuid,zipfile
from pathlib import Path
ROOT=Path.cwd(); W=Path('/private/tmp/weft-security-main-integration'); T=Path('/private/tmp/truss-security-main-integration')
TOOL=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin'); OWNER=Path('/private/tmp/truss-umf-runtime-LmpSsH')
def sha(b):return hashlib.sha256(b).hexdigest()
def run(command,**kw):return subprocess.run(command,capture_output=True,text=True,timeout=120,**kw)
files={str(Path(__file__).resolve()):Path(__file__).read_bytes(),str(ROOT/'tools/security/association-owner-inspect.ts'):(ROOT/'tools/security/association-owner-inspect.ts').read_bytes(),str(ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json'):(ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json').read_bytes()}
artifact=next(a for a in json.loads(files[str(ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json')])['artifacts'] if a['id']=='natural-count-self-join')
tool_hashes={n:sha((TOOL/n).read_bytes()) for n in ['cargo','rustc']}
runtime_paths={'python':Path(sys.executable),'bun':Path(shutil.which('bun'))}
runtime_hashes={n:sha(p.read_bytes()) for n,p in runtime_paths.items()}
runtimes={'python':sys.version,'bun':run([str(runtime_paths['bun']),'--version']).stdout.strip()}
checkout=run(['git','rev-parse','HEAD'],cwd=W);assert checkout.returncode==0
checkout_status=run(['git','status','--porcelain'],cwd=W);assert checkout_status.returncode==0 and not checkout_status.stdout
tracked=run(['git','ls-files'],cwd=W);assert tracked.returncode==0
for name in tracked.stdout.splitlines():
 p=W/name
 if p.is_file() and (name in ['Cargo.toml','Cargo.lock','rust-toolchain.toml','.cargo/config.toml'] or name.startswith(('crates/','vendor/','spec/','spikes/')) or (name.startswith('tests/') and p.suffix in ('.rs','.toml')) or (name.startswith('docs/helix/02-design/contracts/') and p.suffix=='.json')):files[str(p)]=p.read_bytes()
for name in ['packages/umf-bun/src/index.ts','packages/umf-bun/src/catalog-transition-correspondence.ts','packages/python/src/truss/_security_association_binding.py','packages/python/tests/test_security_association_binding.py','packages/python/tests/fixtures/security-association-core.json','packages/python/tests/fixtures/security-association-ontology.json']:files[str(T/name)]=(T/name).read_bytes()
for name in ['producer.js','producer-manifest.json']:files[str(OWNER/name)]=(OWNER/name).read_bytes()
configs=[W/'.cargo/config',W/'.cargo/config.toml',Path('/private/tmp/weft-toolchain/cargo/config'),Path('/private/tmp/weft-toolchain/cargo/config.toml')]
presence={str(p):p.exists() for p in configs}
for p in configs:
 if p.is_file():files[str(p)]=p.read_bytes()
basis={p:sha(b) for p,b in files.items()}
def unchanged():
 assert presence=={str(p):p.exists() for p in configs}
 assert all(Path(p).is_file() and sha(Path(p).read_bytes())==h for p,h in basis.items()),'source changed'
runid=str(uuid.uuid4()); out=ROOT/'docs/helix/04-build/evidence/security/association-owner-interpretation'/runid;out.mkdir(parents=True)
with zipfile.ZipFile(out/'preimages.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p,b in files.items():z.writestr(p.lstrip('/'),b)
with zipfile.ZipFile(out/'preimages.zip') as z:
 assert set(z.namelist())=={p.lstrip('/') for p in files}
 assert all(z.read(p.lstrip('/'))==b for p,b in files.items())
build_temp=tempfile.TemporaryDirectory(prefix='association-owner-build-'); frozen_weft=Path(build_temp.name)/'weft'; frozen_weft.mkdir()
for original,blob in files.items():
 p=Path(original)
 if p.is_relative_to(W):
  destination=frozen_weft/p.relative_to(W);destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(blob)
command=[str(TOOL/'cargo'),'build','--offline','--locked','-p','weft-core','--example','security_mapping_handoff','--target-dir',str(Path(build_temp.name)/'target')]
build_env={k:v for k,v in os.environ.items() if not k.startswith(('CARGO_','RUST','SCCACHE_'))}
build_env.update({'PATH':str(TOOL)+os.pathsep+os.environ['PATH'],'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'})
build=run(command,cwd=frozen_weft,env=build_env)
(out/'build.log').write_text(build.stdout+build.stderr);assert build.returncode==0;unchanged()
binary=Path(build_temp.name)/'target/debug/examples/security_mapping_handoff';binary_hash=sha(binary.read_bytes())
observations=[]
def check(label,expected,actual):
 observations.append({'id':label,'expected':expected,'observed':actual});assert expected==actual,label
with tempfile.TemporaryDirectory(prefix='association-owner-') as directory:
 frozen=Path(directory)
 for name in ['packages/umf-bun/src/index.ts','packages/umf-bun/src/catalog-transition-correspondence.ts']:
  p=frozen/'truss'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(files[str(T/name)])
 (frozen/'inspect.ts').write_bytes(files[str(ROOT/'tools/security/association-owner-inspect.ts')])
 owner=frozen/'owner';owner.mkdir()
 for name in ['producer.js','producer-manifest.json']:(owner/name).write_bytes(files[str(OWNER/name)])
 request=artifact['request'];core=request['modules'][0]['documentJson'].encode();ontology=request['ontologyJson'].encode()
 check('exact-core-fixture',files[str(T/'packages/python/tests/fixtures/security-association-core.json')],core)
 check('exact-ontology-fixture',files[str(T/'packages/python/tests/fixtures/security-association-ontology.json')],ontology)
 # Keep JSON receipt bounded: replace byte-valued equality observations by digests.
 for o in observations:o['expected']=sha(o['expected']);o['observed']=sha(o['observed'])
 def inspect(text):
  p=run(['bun',str(frozen/'inspect.ts')],input=json.dumps({'ownerDirectory':str(owner),'originalText':text}));assert p.returncode==0 and not p.stderr;return json.loads(p.stdout)
 good=inspect(core.decode());check('actual-umf-source-valid',True,good['valid']);check('actual-umf-target-valid',True,good['targetValid']);check('original-text-preserved',True,good['originalUnchanged'])
 invalid=json.loads(core);invalid['modules'][0]['elements'][0]['kind']='invalid'
 check('actual-umf-invalid-kind-refused',False,inspect(json.dumps(invalid))['valid'])
 positive=run([str(binary)],input=json.dumps(request));check('actual-weft-positive-exit',0,positive.returncode);check('actual-weft-positive-stderr','',positive.stderr)
 handoff=json.loads(positive.stdout);check('original-owner-handoff-correspondence',artifact['handoff'],handoff)
 (out/'handoff.json').write_text(positive.stdout)
 for label,code in [('core-kind','WFT-MODEL'),('ontology-revision','WFT-SECURITY-PIN'),('missing-classification','WFT-SECURITY-ONTOLOGY'),('missing-endpoint','WFT-SECURITY-TYPE')]:
  x=copy.deepcopy(request)
  if label=='core-kind':
   s=json.dumps(invalid);x['modules'][0]['documentJson']=s;x['modules'][0]['pin']['sha256']=sha(s.encode())
  else:
   o=json.loads(x['ontologyJson'])
   if label=='ontology-revision':o['documents'][0]['revision']='substituted'
   elif label=='missing-classification':o['associations'][1]['fields'].pop()
   else:o['associations'][1]['endpoints'].pop()
   x['ontologyJson']=json.dumps(o)
  p=run([str(binary)],input=json.dumps(x));check(label+':exit',1,p.returncode);check(label+':no-output','',p.stdout);check(label+':diagnostic',code,json.loads(p.stderr)['code'])
 # Execute byte-captured private correspondence module and its fixture constructor.
 python_root=frozen/'python';(python_root/'truss').mkdir(parents=True);(python_root/'truss/__init__.py').write_text('')
 (python_root/'truss/_security_association_binding.py').write_bytes(files[str(T/'packages/python/src/truss/_security_association_binding.py')])
 test=frozen/'test.py';test.write_bytes(files[str(T/'packages/python/tests/test_security_association_binding.py')]);(frozen/'fixtures').mkdir()
 for name in ['security-association-core.json','security-association-ontology.json']:(frozen/'fixtures'/name).write_bytes(files[str(T/'packages/python/tests/fixtures'/name)])
 sys.path.insert(0,str(python_root));helpers=runpy.run_path(str(test));binding=helpers['wire'](helpers['inputs']());basis_result=helpers['prepare_association_binding'](core,ontology,binding)
 import io,unittest
 test_log=io.StringIO();test_result=unittest.TextTestRunner(stream=test_log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(helpers['BindingTests']))
 (out/'association-tests.log').write_text(test_log.getvalue())
 check('captured-association-tests',50,test_result.testsRun);check('captured-association-tests-pass',True,test_result.wasSuccessful())
 for index,association in enumerate(basis_result.associations):
  check(f'original-mapping-pointer-{index}',f'/mappings/{index}',association.source_pointer)
  check(f'original-mapping-fragment-{index}',helpers['wire'](helpers['inputs']()['mappings'][index]).hex(),association.definition_bytes.hex())
  check(f'explicit-storage-pointer-{index}',f'/mappings/{index}/storage',association.storage.source_pointer)
  check(f'explicit-storage-values-{index}',['0','*','0','*',True,'independent',False,None],[association.storage.source_min,association.storage.source_max,association.storage.target_min,association.storage.target_max,association.storage.directed,association.storage.lifecycle,association.storage.composition,association.storage.inverse])
 check('original-extraction-profile','truss-original-association-json-candidate/0.1.0',basis_result.extraction_profile)
 check('same-original-core',sha(core),sha(basis_result.core_bytes));check('same-original-ontology',sha(ontology),sha(basis_result.ontology_bytes));check('complete-two-associations',2,len(basis_result.associations));check('basis-not-authority','original_source_correspondence_only',basis_result.scope)
 (out/'binding.json').write_bytes(binding)
unchanged();assert sha(binary.read_bytes())==binary_hash
assert tool_hashes=={n:sha((TOOL/n).read_bytes()) for n in ['cargo','rustc']}
assert runtime_hashes=={n:sha(p.read_bytes()) for n,p in runtime_paths.items()}
assert all((frozen_weft/Path(p).relative_to(W)).read_bytes()==b for p,b in files.items() if Path(p).is_relative_to(W))
build_temp.cleanup()
receipt={'version':'association-owner-interpretation/0.1.0','status':'passed','scope':'original UMF validation, legacy Weft semantic/query interpretation and private binary association source correspondence only','excluded':['authenticated owner/issuer/cut authority','registered native relationship binding','database effects','installed wheel qualification','SQL refinement','whole acceptance criteria'],'sourceDigests':basis,'configPresence':presence,'weftCheckoutCommit':checkout.stdout.strip(),'runtimes':runtimes,'runtimeExecutableDigests':runtime_hashes,'build':{'command':command,'compiler':run([str(TOOL/'rustc'),'--version']).stdout.strip(),'binarySha256':binary_hash,'toolDigests':tool_hashes,'qualification':'executed captured Weft source with a fresh target; source unchanged before/after and preimages retained; locked offline build, registry dependency bytes and full toolchain are not archived; not hermetic'},'umfOwner':good,'observations':observations,'acceptance':'US-056-AC1/AC2/AC10 component evidence only; historical 26/132 unchanged'}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'receipt':str(out/'receipt.json'),'observations':len(observations),'sha256':sha((out/'receipt.json').read_bytes())}))
