import pathlib,json,hashlib,subprocess,time,uuid
r=pathlib.Path('/private/tmp/g03-native-predicate-reanalysis-006-linux-launch-001');op=pathlib.Path('/private/tmp/g03-native-predicate-reanalysis-operator-006');ident=uuid.uuid4().hex;name='g03-predicate-reanalysis-'+ident;start=time.monotonic();image='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
roots=[op,pathlib.Path('/private/tmp/g03-full14-bounded-operator-007-output/45389ee1fa7a40238d403ff0048626a1'),pathlib.Path('/private/tmp/g03-full14-source-seal-005'),pathlib.Path('/private/tmp/g03-full14-input-packet-001'),pathlib.Path('/Users/erik/.codex/worktrees/g03-ordinary-native/umf/tests/lifecycle'),pathlib.Path('/private/tmp/g03-native-predicate-reanalysis006-sol-source-closure001.json'),pathlib.Path('/private/tmp/g03-native-predicate-reanalysis006-sol-source-closure001.md')]
roots += [pathlib.Path('/private/tmp/'+n) for n in ['g03-campaign-predicates-sol-source-review001.md','g03-n12-native-default-expression-sol-source-review001.md','g03-n12-eight-role-sol-source-review001.md']]
argv=['docker','run','--rm','--pull=never','--platform=linux/amd64','--name',name,'--label','codex.g03.execution-id='+ident,'--network=none','--read-only','--cap-drop=ALL','--cpus=1','--memory=1g','--pids-limit=128','--tmpfs=/tmp:rw,nosuid,nodev,size=64m']
for p in roots:argv+=['--mount','type=bind,source='+str(p)+',target='+str(p)+',readonly']
argv+=['--mount','type=bind,source='+str(op/'runs')+',target='+str(op/'runs'),'--workdir='+str(op),'-e','G03_PREDICATE_REANALYSIS_EXECUTE=1','--entrypoint=/usr/bin/timeout',image,'--signal=TERM','--kill-after=10s','180s','/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','-I','-B',str(op/'reanalyze.py'),'--execute','--review-json','/private/tmp/g03-native-predicate-reanalysis006-sol-source-closure001.json','--review-sha256','ecbaa99b0513a508b1be35d15795b85f59ed84ffa55a9476a86414587f326c54','--packet-sha256','984e0b47fc8231d03ba1564ef97cdb3f9e7092768e1b0da29864a6e4ddce75c5']
v={'profile':'g03.local-linux-predicate-reanalysis-launch/1','argv':argv,'status':'FAIL_OR_UNKNOWN','installedProductImported':False,'databaseExecuted':False}
try:
 with (r/'stdout.log').open('xb') as out,(r/'stderr.log').open('xb') as err:p=subprocess.run(argv,stdout=out,stderr=err,timeout=205)
 v['exitCode']=p.returncode
except Exception as e:v['error']=str(e)
finally:
 q=subprocess.run(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],capture_output=True,timeout=8);v['ownedContainerAbsent']=q.returncode==0 and not q.stdout.strip()
 if not v['ownedContainerAbsent']:
  owner=subprocess.run(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',name],capture_output=True,timeout=5)
  if owner.returncode==0 and owner.stdout.decode().strip()==ident:subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=8)
  v['cleanupWasRequired']=True
 v['elapsedSeconds']=round(time.monotonic()-start,3);v['logs']=[]
 for p in [r/'stdout.log',r/'stderr.log']:
  if p.exists():b=p.read_bytes();v['logs'].append({'path':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 if v.get('exitCode')==0 and v['ownedContainerAbsent'] and sum(x['bytes'] for x in v['logs'])<1024*1024:v['status']='LINUX_METADATA_REANALYSIS_LAUNCH_PASS'
 (r/'result.json').write_text(json.dumps(v,sort_keys=True,indent=2)+'\n');print(json.dumps({'status':v['status'],'exitCode':v.get('exitCode'),'elapsedSeconds':v['elapsedSeconds']}))
