import base64,hashlib,importlib.metadata as md,json,sys
from pathlib import Path
root=Path(sys.argv[1]);out=Path(sys.argv[2]);packages=[]
for name,package in [('umf-access','umf_access'),('umf-codegen','umf_codegen')]:
 d=md.distribution(name);checked=[]
 for f in d.files or []:
  rel=str(f)
  if not rel.startswith(package+'/') or '__pycache__' in rel:continue
  installed=Path(d.locate_file(f));source=root/'python'/package/'src'/rel
  assert source.is_file(),('missing-source',rel)
  raw=installed.read_bytes();assert raw==source.read_bytes(),('source-mismatch',rel)
  if f.hash:
   actual=base64.urlsafe_b64encode(hashlib.new(f.hash.mode,raw).digest()).decode().rstrip('=')
   assert actual==f.hash.value,('record-mismatch',rel)
  checked.append({'path':rel,'sha256':hashlib.sha256(raw).hexdigest()})
 assert checked,name
 packages.append({'name':name,'version':d.version,'files':checked})
manifest_path=root/'python/umf_codegen/src/umf_codegen/_assets/manifest.json'
manifest=json.loads(manifest_path.read_text());inputs=[]
for rel,expected in manifest['inputs'].items():
 path=root/rel;assert path.is_file(),('missing-embedded-input',rel)
 actual=hashlib.sha256(path.read_bytes()).hexdigest()
 assert actual==expected,('embedded-input-mismatch',rel)
 inputs.append({'path':rel,'sha256':actual})
result={'status':'passed','python':sys.version,'packages':packages,'embeddedInputs':inputs}
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':'passed','packages':[{'name':p['name'],'version':p['version'],'files':len(p['files'])} for p in packages]}))
