import pathlib,json,hashlib,subprocess,time,uuid
r=pathlib.Path('/private/tmp/g03-native-predicate-pure-tests-001');ident=uuid.uuid4().hex;name='g03-predicate-controls-'+ident;start=time.monotonic();image='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
argv=['docker','run','--rm','--pull=never','--platform=linux/amd64','--name',name,'--label','codex.g03.execution-id='+ident,'--network=none','--read-only','--cap-drop=ALL','--cpus=1','--memory=1g','--pids-limit=128','--tmpfs=/tmp:rw,nosuid,nodev,size=64m','--mount','type=bind,source='+str(r/'source')+',target=/src,readonly','--workdir=/src','--entrypoint=/usr/bin/timeout',image,'--signal=TERM','--kill-after=10s','120s','/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','-I','-B','-m','unittest','discover','-s','/src','-p','test_g03_campaign_predicates.py','-v']
result={'profile':'g03.pure-predicate-mutation-controls/1','argv':argv,'sourceManifestSha256':hashlib.sha256((r/'source-manifest.json').read_bytes()).hexdigest(),'scope':'Pure predicate mutation controls only; no installed product imports or database execution','status':'FAIL_OR_UNKNOWN'}
try:
 with (r/'stdout.log').open('xb') as out,(r/'stderr.log').open('xb') as err:p=subprocess.run(argv,stdout=out,stderr=err,timeout=155)
 result['exitCode']=p.returncode
except Exception as e:result['error']=str(e)
finally:
 q=subprocess.run(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],capture_output=True,timeout=8)
 result['ownedContainerAbsent']=q.returncode==0 and not q.stdout.strip()
 if not result['ownedContainerAbsent']:
  owner=subprocess.run(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',name],capture_output=True,timeout=5)
  if owner.returncode==0 and owner.stdout.decode().strip()==ident:subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=8)
  result['cleanupWasRequired']=True
 manifest=json.loads((r/'source-manifest.json').read_text());result['sourceBytesUnchanged']=all(hashlib.sha256((r/'source'/x['path']).read_bytes()).hexdigest()==x['sha256'] for x in manifest['files']);result['elapsedSeconds']=round(time.monotonic()-start,3);result['logs']=[]
 for p in [r/'stdout.log',r/'stderr.log']:
  if p.exists():b=p.read_bytes();result['logs'].append({'path':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 if result.get('exitCode')==0 and result['ownedContainerAbsent'] and result['sourceBytesUnchanged'] and sum(x['bytes'] for x in result['logs'])<1024*1024:result['status']='PURE_PREDICATE_CONTROLS_PASS'
 (r/'result.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print(json.dumps({'status':result['status'],'exitCode':result.get('exitCode'),'elapsedSeconds':result['elapsedSeconds']}))
