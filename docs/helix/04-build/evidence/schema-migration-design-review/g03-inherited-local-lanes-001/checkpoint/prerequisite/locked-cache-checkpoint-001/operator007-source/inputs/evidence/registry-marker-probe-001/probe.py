import pathlib,json,stat,hashlib
r=pathlib.Path('/opt/cargo/registry');rows=[]
for p in sorted(r.iterdir()):
 s=p.lstat();row={'name':p.name,'mode':stat.S_IMODE(s.st_mode),'kind':'symlink' if p.is_symlink() else 'directory' if p.is_dir() else 'file' if p.is_file() else 'other','sizeBytes':s.st_size}
 if p.name=='CACHEDIR.TAG' and p.is_file() and not p.is_symlink() and s.st_size<=4096:
  b=p.read_bytes();row.update(sha256=hashlib.sha256(b).hexdigest(),utf8=b.decode('utf8'))
 rows.append(row)
print(json.dumps({'scope':'read-only base-image Cargo registry metadata; no Cargo/compiler/product/network','rows':rows},sort_keys=True))
