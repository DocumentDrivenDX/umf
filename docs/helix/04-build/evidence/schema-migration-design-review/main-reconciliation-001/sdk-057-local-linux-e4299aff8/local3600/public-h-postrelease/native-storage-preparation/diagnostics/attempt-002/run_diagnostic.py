import hashlib,json,pathlib,subprocess,sys,time,uuid
root=pathlib.Path(__file__).resolve().parent; name='umf-publich-volmeta-'+uuid.uuid4().hex[:16]; image='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'; cap=1048576
cmd=['docker','run','--rm','--name',name,'--pull=never','--platform','linux/amd64','--network','none','--read-only','--cap-add=SYS_ADMIN','--security-opt=seccomp=unconfined','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--mount',f'type=bind,src={root}/driver,dst=/diagnostic,readonly','--mount','type=volume,src=umf-migration-source-267675510,dst=/volume-producer,readonly',image,'python3','/diagnostic/git_metadata_diagnostic.py']
def sha(b): return hashlib.sha256(b).hexdigest()
def docker(args,timeout=10):
 t=time.monotonic(); p=subprocess.run(['docker',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout); return {'exitCode':p.returncode,'durationSeconds':round(time.monotonic()-t,6),'stdout':p.stdout.decode('utf8','replace')[:4096],'stderr':p.stderr.decode('utf8','replace')[:4096]}
started=time.monotonic(); pre={'image':docker(['image','inspect',image]),'volume':docker(['volume','inspect','umf-migration-source-267675510']),'name':docker(['inspect',name])}; out=err=b''; rc=None; timeout=False; failure=None; cleanup=remove=None
try:
 if pre['image']['exitCode'] or pre['volume']['exitCode'] or pre['name']['exitCode']==0: failure='preflight failure or name collision'
 else:
  p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try: out,err=p.communicate(timeout=60); rc=p.returncode
  except subprocess.TimeoutExpired:
   timeout=True; subprocess.run(['docker','stop','--time','2',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
   try: out,err=p.communicate(timeout=5); rc=p.returncode
   except subprocess.TimeoutExpired:
    subprocess.run(['docker','kill',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5); out,err=p.communicate(timeout=5); rc=p.returncode
except Exception as e: failure=type(e).__name__+':'+str(e)
finally:
 cleanup=docker(['inspect',name])
 if cleanup['exitCode']==0: remove=docker(['rm','--force',name],timeout=5)
 for label,data in [('stdout',out),('stderr',err)]: (root/(label+'.bin')).write_bytes(data[:cap])
 rec={'profile':'umf.public-h-volume-readonly-git-metadata-outer/1','command':cmd,'timeoutSeconds':60,'outputCapBytesEach':cap,'durationSeconds':round(time.monotonic()-started,6),'exitCode':rc,'timedOut':timeout,'failure':failure,'stdoutBytes':len(out),'stdoutSha256':sha(out),'stdoutCapturedBytes':min(len(out),cap),'stderrBytes':len(err),'stderrSha256':sha(err),'stderrCapturedBytes':min(len(err),cap),'preflight':pre,'containerAbsentAfterRun':cleanup['exitCode']!=0 or bool(remove and remove['exitCode']==0),'cleanup':cleanup,'cleanupRemove':remove}
 (root/'outer-record.json').write_text(json.dumps(rec,sort_keys=True,indent=2)+'\n')
print(json.dumps(rec,sort_keys=True))
if failure or timeout or rc!=0: sys.exit(1)
