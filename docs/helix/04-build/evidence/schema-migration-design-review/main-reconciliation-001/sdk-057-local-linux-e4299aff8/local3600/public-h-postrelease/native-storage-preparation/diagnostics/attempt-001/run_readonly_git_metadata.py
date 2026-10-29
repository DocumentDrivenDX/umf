import hashlib, json, os, pathlib, subprocess, sys, time, uuid
root=pathlib.Path(__file__).resolve().parent
cap=1_048_576
name="umf-publich-gitmeta-"+uuid.uuid4().hex[:16]
image="sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556"
cmd=["docker","run","--rm","--name",name,"--pull=never","--platform","linux/amd64","--network","none","--read-only","--cap-add=SYS_ADMIN","--security-opt=seccomp=unconfined","--tmpfs","/tmp:rw,noexec,nosuid,size=64m","--mount","type=bind,src=/private/tmp/migration-sdk057-public-h-attempt2-gitmeta-diagnostic-001/driver,dst=/diagnostic,readonly","--mount","type=bind,src=/private/tmp/migration-linux-candidate-267675510,dst=/host-producer,readonly","--mount","type=volume,src=umf-migration-source-267675510,dst=/volume-producer,readonly",image,"python3","/diagnostic/git_metadata_diagnostic.py"]
def sha(b): return hashlib.sha256(b).hexdigest()
def inspect(args,timeout=10):
 t=time.monotonic(); r=subprocess.run(["docker",*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout); return {"exitCode":r.returncode,"durationSeconds":round(time.monotonic()-t,6),"stdout":r.stdout.decode("utf-8","replace"),"stderr":r.stderr.decode("utf-8","replace")}
started=time.monotonic(); out=b""; err=b""; exitcode=None; timedout=False; failure=None
pre={"image":inspect(["image","inspect",image]),"volume":inspect(["volume","inspect","umf-migration-source-267675510"]),"name":inspect(["inspect",name])}
cleanup=None; cleanup_remove=None
try:
 if pre["image"]["exitCode"] or pre["volume"]["exitCode"] or pre["name"]["exitCode"]==0:
  failure="preflight image/volume missing or container name collision"
 else:
  p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try: out,err=p.communicate(timeout=90); exitcode=p.returncode
  except subprocess.TimeoutExpired:
   timedout=True
   subprocess.run(["docker","stop","--time","2",name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
   try: out,err=p.communicate(timeout=5); exitcode=p.returncode
   except subprocess.TimeoutExpired:
    subprocess.run(["docker","kill",name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
    out,err=p.communicate(timeout=5); exitcode=p.returncode
except Exception as e:
 failure=type(e).__name__+":"+str(e)
finally:
 cleanup=inspect(["inspect",name])
 if cleanup["exitCode"]==0:
  cleanup_remove=inspect(["rm","--force",name],timeout=5)
 elapsed=time.monotonic()-started
 for label,data in (("stdout",out), ("stderr",err)):
  path=root/(label+".bin"); path.write_bytes(data[:cap])
 record={"profile":"umf.public-h-readonly-git-metadata-diagnostic/1","command":cmd,"timeoutSeconds":90,"outputCapBytesEach":cap,"durationSeconds":round(elapsed,6),"exitCode":exitcode,"timedOut":timedout,"failure":failure,"stdoutBytes":len(out),"stdoutSha256":sha(out),"stdoutCapturedBytes":min(len(out),cap),"stderrBytes":len(err),"stderrSha256":sha(err),"stderrCapturedBytes":min(len(err),cap),"preflight":pre,"containerAbsentAfterRun":cleanup["exitCode"]!=0 or (cleanup_remove and cleanup_remove["exitCode"]==0),"cleanupInspect":cleanup,"cleanupRemove":cleanup_remove,"stdoutPath":str(root/"stdout.bin"),"stderrPath":str(root/"stderr.bin")}
 (root/"outer-record.json").write_text(json.dumps(record,sort_keys=True,indent=2)+"\n")
print(json.dumps(record,sort_keys=True))
if failure or timedout or exitcode!=0: sys.exit(1)
