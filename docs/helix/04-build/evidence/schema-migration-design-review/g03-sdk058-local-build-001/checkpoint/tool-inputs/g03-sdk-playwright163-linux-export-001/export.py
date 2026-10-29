import pathlib,hashlib,json,stat,shutil
src=pathlib.Path('/deps');dst=pathlib.Path('/out/packages');dst.mkdir();rows=[];total=0
for name in ['playwright','playwright-core']:
 p=src/name;assert json.loads((p/'package.json').read_text())['version']=='1.63.0'
 for f in sorted(p.rglob('*')):
  s=f.lstat();assert not f.is_symlink()
  q=dst/f.relative_to(src)
  if stat.S_ISDIR(s.st_mode):q.mkdir(parents=True,exist_ok=True);continue
  assert stat.S_ISREG(s.st_mode) and s.st_size<=16*1024*1024
  total+=s.st_size;assert total<=128*1024*1024 and len(rows)<4096
  q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,q);b=q.read_bytes();assert len(b)==s.st_size
  assert hashlib.sha256(b).digest()==hashlib.sha256(f.read_bytes()).digest()
  rows.append({'path':str(f.relative_to(src)),'bytes':len(b),'mode':stat.S_IMODE(s.st_mode),'sha256':hashlib.sha256(b).hexdigest()})
(pathlib.Path('/out')/'export-receipt.json').write_text(json.dumps({'profile':'umf.g03-linux-portable-playwright-input/1','version':'1.63.0','sourceVolume':'umf-migration-source-267675510/node_modules','files':rows,'fileCount':len(rows),'totalBytes':total,'scope':'PureJavaScript package export only; no product/browser/test run'},sort_keys=True,indent=2)+'\n');print(json.dumps({'files':len(rows),'bytes':total,'version':'1.63.0'}))
