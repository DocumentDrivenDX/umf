"""Replay original compiler requests through an exact optional Python wheel.
Host evidence only: not a native policy/permission or hermetic build assertion.
"""
import hashlib,importlib,json,pathlib,sys,tempfile,zipfile
wheel=pathlib.Path(sys.argv[1]);expected=sys.argv[2];inputs=pathlib.Path(sys.argv[3]);output=pathlib.Path(sys.argv[4]);sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(wheel.read_bytes())==expected
checks=[]
with tempfile.TemporaryDirectory(prefix='umf-weft-readset-python-',dir='/private/tmp') as directory:
 root=pathlib.Path(directory)
 with zipfile.ZipFile(wheel) as archive:
  for item in archive.infolist():assert (root/item.filename).resolve().is_relative_to(root)
  archive.extractall(root)
 sys.path.insert(0,str(root));weft=importlib.import_module('weft');assert pathlib.Path(weft.__file__).resolve().is_relative_to(root)
 module_pins={str(p.relative_to(root)):sha(p.read_bytes()) for p in root.rglob('*') if p.is_file() and p.suffix in ['.py','.so']}
 api=weft.prepare_application_lineage_json
 for request in sorted(inputs.glob('*.request.json')):
  raw=request.read_text();report=request.with_name(request.name.replace('.request.','.report.'));actual=api(raw);assert actual.encode()==report.read_bytes(),request.name
  decoded=json.loads(actual);assert decoded['authority'] is False and decoded['securityReady'] is False
  checks.append({'case':request.name,'requestSha256':sha(raw.encode()),'reportSha256':sha(actual.encode()),'byteIdenticalToRootBinary':True})
 assert len(checks)==18
 original=next(inputs.glob('*.request.json')).read_text();forged=json.loads(original);forged['readRequirements']={}
 for name,raw in [('missing','{}'),('wrong-root','[]'),('duplicate-key','{"interfaceVersion":1,"interfaceVersion":2}'),('forged-readsets',json.dumps(forged)),('oversize',' '*4000001)]:
  try:api(raw)
  except ValueError as error:assert str(error).startswith('WFT-') and len(str(error).encode())<8192
  else:raise AssertionError(name)
  checks.append({'case':name,'refused':True})
 ordinary=json.loads(weft.compile_json(original));assert ordinary['status']!='compiled' and 'sql' not in ordinary
 checks.append({'case':'ordinary-compile-stays-closed','refused':True})
 assert sha(wheel.read_bytes())==expected
 output.write_text(json.dumps({'status':'installed-python-source-report-correspondence-passed','python':sys.version,'version':weft.__version__,'wheelSha256':expected,'selectedModuleDigests':module_pins,'checks':checks,'scope':'Root loads exact owner dev wheel from a temporary directory, compares all18 original request/report bytes against independently replayed committed CLI producer, and checks six refusal/boundary cases. No native data/caller/current authority, performance, publication, hermetic build, compiler refinement or backend acceptance is established.','acceptanceCasesPromoted':[]},indent=2)+'\n')
 print(json.dumps({'status':'passed','originalReports':18,'refusalControls':6}))
