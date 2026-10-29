import pathlib,os,hashlib,json,subprocess,time
start=time.monotonic();roots=[]
for name in ['cache','index']:
 p=pathlib.Path('/opt/cargo/registry')/name;allbytes=0;unique=0;seen=set();files=dirs=hardlinked=0;filebytes=0
 for base,ds,fs in os.walk(p,followlinks=False):
  for q in [pathlib.Path(base),*[pathlib.Path(base)/n for n in fs]]:
   if time.monotonic()-start>20:raise RuntimeError('metadata traversal deadline')
   s=q.lstat();allbytes+=s.st_size;key=(s.st_dev,s.st_ino)
   if key not in seen:unique+=s.st_size;seen.add(key)
   if q.is_file():files+=1;filebytes+=s.st_size;hardlinked+=s.st_nlink>1
   elif q.is_dir():dirs+=1
 du=subprocess.run(['/usr/bin/du','-sb',str(p)],capture_output=True,timeout=5,check=True)
 roots.append({'name':name,'naiveApparentBytes':allbytes,'uniqueInodeApparentBytes':unique,'regularFileBytes':filebytes,'files':files,'directories':dirs,'hardlinkedFiles':hardlinked,'duStdout':du.stdout.decode(),'duStderr':du.stderr.decode()})
print(json.dumps({'scope':'read-only base-image cache filesystem metadata; no Cargo/compiler/product/network','roots':roots,'elapsedSeconds':round(time.monotonic()-start,3)},sort_keys=True))
