from pathlib import Path
import json,hashlib,subprocess
parent=Path('/private/tmp/sdk-r24-schema-instance-e2e.json');raw=parent.read_bytes();r=json.loads(raw);assert r['status']=='pass'
results=[]
for command in r['commands']:
 if not command['label'].endswith('-create-decode'):continue
 args=list(command['args']);args[0]='/private/tmp/sdk-r24-311-env/bin/python'
 p=subprocess.run(args,capture_output=True,text=True,timeout=60)
 assert p.returncode==0,p.stderr
 result=json.loads(p.stdout);assert result['python']=='3.11.17'
 results.append({'label':command['label'],'args':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'observed':result})
assert len(results)==3 and sum(x['observed']['count'] for x in results)==83
for case in r['outcomes']:
 package=Path(r['work'])/case['fixture']/'output'
 actual={str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest() for p in package.rglob('*') if p.is_file()}
 assert actual==case['inventory'],case['fixture']
Path('/private/tmp/sdk-r24-schema-instance-311-replay.json').write_text(json.dumps({'status':'pass','scope':'same exact public schema/CLI generated packages, actual Python3.11 instance/codec replay; no repeated schema generation or database claim','parentReportSha256':hashlib.sha256(raw).hexdigest(),'results':results,'packagesUnchanged':True,'temporal':'HELD'},indent=2)+'\n')
print('3 actual generated package families /83checks PASS onPython3.11.17; original package bytes unchanged')
