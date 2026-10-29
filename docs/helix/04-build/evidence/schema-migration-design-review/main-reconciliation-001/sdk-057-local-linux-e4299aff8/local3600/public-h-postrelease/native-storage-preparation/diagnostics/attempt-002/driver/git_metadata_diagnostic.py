import hashlib, json, os, pathlib, subprocess, time, urllib.parse
root=pathlib.Path('/volume-producer')
expected=json.loads(pathlib.Path('/diagnostic/expected.json').read_text())
env=dict(os.environ); env.update({'GIT_OPTIONAL_LOCKS':'0','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','HOME':'/tmp/home'})
pathlib.Path('/tmp/home').mkdir(exist_ok=True)
def sha(b): return hashlib.sha256(b).hexdigest()
def safe_origin(raw):
 v=raw.strip()
 if v.startswith('git@') and ':' in v:
  authority,path=v.split(':',1); host=authority.rsplit('@',1)[1]; scheme='ssh'; user=True; password=False
 else:
  u=urllib.parse.urlsplit(v); host=u.hostname or ''; path=u.path.lstrip('/'); scheme=u.scheme; user=u.username is not None; password=u.password is not None
 return {'scheme':scheme,'host':host,'path':path.removesuffix('.git'),'hasUserInfo':user or password,'rawUrlSha256':sha(v.encode())}
def run(label,args,timeout):
 argv=['git','-c','safe.directory=/volume-producer','-C',str(root),*args]; t=time.monotonic()
 try:
  p=subprocess.run(argv,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False)
  out,err=p.stdout,p.stderr; row={'name':label,'argv':argv,'timeoutSeconds':timeout,'durationSeconds':round(time.monotonic()-t,6),'exitCode':p.returncode,'timedOut':False}
 except subprocess.TimeoutExpired as e:
  out=e.stdout or b''; err=e.stderr or b''
  if isinstance(out,str): out=out.encode()
  if isinstance(err,str): err=err.encode()
  row={'name':label,'argv':argv,'timeoutSeconds':timeout,'durationSeconds':round(time.monotonic()-t,6),'exitCode':None,'timedOut':True}
 row.update({'stdoutBytes':len(out),'stdoutSha256':sha(out),'stderrBytes':len(err),'stderrSha256':sha(err),'stderrText':err[:4096].decode('utf8','replace'),'stderrTruncated':len(err)>4096})
 return row,out,err
commands=[('root',['rev-parse','--show-toplevel'],15),('HEAD',['rev-parse','HEAD'],15),('HEAD-tree',['rev-parse','HEAD^{tree}'],15),('status',['status','--porcelain'],30),('remote-names',['remote'],15),('origin-url-sanitized',['remote','get-url','origin'],15),('release-M-object',['cat-file','-e',expected['M']+'^{commit}'],15),('HEAD-ancestor-of-M',['merge-base','--is-ancestor',expected['P'],expected['M']],15),('release-tag-commit',['rev-parse','refs/tags/'+expected['tag']+'^{commit}'],15)]
rows=[]; values={}
for label,args,limit in commands:
 r,out,err=run(label,args,limit); rows.append(r)
 if label=='status': values[label]={'clean':len(out)==0 and r['exitCode']==0,'bytes':len(out),'sha256':sha(out)}
 elif label=='remote-names' and r['exitCode']==0: values[label]=out.decode('utf8','replace').splitlines()
 elif label=='origin-url-sanitized' and r['exitCode']==0: values[label]=safe_origin(out.decode('utf8','replace'))
 elif label in ('root','HEAD','HEAD-tree','release-tag-commit') and r['exitCode']==0: values[label]=out.decode('utf8','replace').strip()
 else: values[label]={'exitCode':r['exitCode'],'timedOut':r['timedOut']}
print(json.dumps({'profile':'umf.public-h-volume-readonly-git-metadata-diagnostic/2','network':'none','expected':expected,'source':{'name':'qualified-P-volume','path':'/volume-producer','commands':rows,'summary':values}},sort_keys=True,separators=(',',':')))
