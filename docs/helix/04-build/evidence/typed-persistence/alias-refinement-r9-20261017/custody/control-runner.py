import shutil,json,subprocess,os,hashlib
from pathlib import Path
source=Path('/private/tmp/sdk-unity-r5-nativecolumns-r2');out=Path('/private/tmp/sdk-r9-custody-source-controls');out.mkdir(exist_ok=True)
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf'); results=[]
for name in ['positive','substitution','wrong-alias']:
 root=out/name;shutil.copytree(source,root,dirs_exist_ok=True)
 config=json.loads((root/'config.json').read_text()); binding=config['targets'][0]['unitySearch']['nativeColumns']['binding']
 if name=='wrong-alias':binding['sourceId']='wrong-alias'
 if name=='substitution':
  doc=json.loads(binding['documentJson']);doc['id']=doc.get('id','binding')+'-alternate';text=json.dumps(doc,separators=(',',':'))
  binding['documentJson']=text;binding['documentSha256']=hashlib.sha256(text.encode()).hexdigest()
  (root/'alternate.json').write_text(text);config['umf']['documents'].append({'path':'alternate.json','sha256':binding['documentSha256']})
 (root/'config.json').write_text(json.dumps(config))
 env=dict(os.environ,PYTHONPATH=str(repo/'python/umf_access/src'))
 result=subprocess.run(['/private/tmp/sdk-r8-314-env/bin/python','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root)],env=env,text=True,capture_output=True)
 (out/(name+'.log')).write_text(result.stdout+result.stderr)
 if name=='positive':assert result.returncode==0,(result.stdout,result.stderr)
 else:assert result.returncode==1 and 'native binding differs from retained stage-one source' in result.stderr,(result.stdout,result.stderr)
 results.append({'case':name,'exitCode':result.returncode})
(out/'result.json').write_text(json.dumps(results,indent=2));print(results)
