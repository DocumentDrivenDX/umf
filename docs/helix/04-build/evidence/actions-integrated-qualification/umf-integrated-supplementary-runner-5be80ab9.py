import subprocess,json,hashlib
from pathlib import Path
F=Path('/private/tmp/umf-integrated-qualification-5be80ab9');revision='5be80ab9e71d2da9aea589e688fdc61af0a0e251';I='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1';P=F.name
O=Path('/private/tmp/umf-integrated-supplementary-execution-5be80ab9.json')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(v):O.write_text(json.dumps(v,indent=2)+'\n')
def inputs():
 roots=['src','scripts','spec','tests','native','package.json','bun.lock'];paths=set(p for p in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*roots],cwd=F).decode().split('\0') if p)
 assert all((F/p).is_file() and not (F/p).is_symlink() for p in paths)
 return {p:sha(F/p) for p in sorted(paths)}
native=json.loads((F/'fixtures/validation/core-check-refresh/native-browser.json').read_text());assert native['complete'] and native['sourceRevision']==revision
expected=native['sourceInputs'];assert inputs()==expected
main=json.loads(Path('/private/tmp/umf-integrated-execution-observation-5be80ab9.json').read_text());assert [r['stage'] for r in main['runs']]==['prepare','native','auxiliary','regression','publish','gates','seal','actions'] and all(r['exitCode']==0 for r in main['runs'])
sealed=json.loads((F/'fixtures/validation/core-check-refresh/final-seal.json').read_text());sealed_bundle=sealed['sha256']['dist/umf.js'];assert sha(F/'dist/umf.js')==sealed_bundle
site='docs/helix/05-deploy/microsite'
def closure():
 roots={};files={}
 for root in [site,'domain-packs','packs','examples/domain-packs']:
  path=F/root;present=path.exists();entries=list(path.rglob('*')) if present else [];assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries)
  data={str(p.relative_to(F)):sha(p) for p in sorted(entries) if p.is_file() and not(root==site and '/dist/' in str(p.relative_to(F)))};roots[root]={'present':present,'files':data};files.update(data)
 fixed='fixtures/core/schema-properties.json';assert (F/fixed).is_file() and not (F/fixed).is_symlink();files[fixed]=sha(F/fixed)
 research=F/site/'dist/research';release=research/'release.json';research_files={}
 if release.exists():
  assert not release.is_symlink();research_files[str(release.relative_to(F))]=sha(release)
  value=json.loads(release.read_text())
  for artifact in value['artifacts']:
   if not artifact['reference'].endswith('.py'):continue
   path=research/artifact['reference'];assert path.resolve().is_relative_to(research.resolve()) and path.is_file() and not path.is_symlink();h=sha(path);assert h==artifact['sha256'];research_files[str(path.relative_to(F))]=h
 files.update(research_files)
 static={}
 dist=F/site/'dist'
 for path in dist.rglob('*'):
  relative=str(path.relative_to(dist))
  if not path.is_file() or relative in ['demo.js','explorer.js','schema-catalog.json'] or relative.startswith('pack-assets/'):continue
  assert not path.is_symlink();static[str(path.relative_to(F))]=sha(path)
 committed_static=set(subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',site+'/dist'],cwd=F,text=True).splitlines())
 prefix=site+'/dist/'
 committed_static={p for p in committed_static if p[len(prefix):] not in ['demo.js','explorer.js','schema-catalog.json'] and not p[len(prefix):].startswith('pack-assets/')}
 assert set(static)==committed_static,'Static site inventory differs from frozen Git'
 files.update(static)
 for path,h in files.items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+path],cwd=F)).hexdigest()==h
 return {'roots':roots,'fixed':{fixed:files[fixed]},'research':{'present':release.exists(),'files':research_files},'staticSiteInputs':static},files
build_closure,outside=closure()
version_cmd=['docker','run','--rm','--entrypoint','bun',I,'--version'];vlog=Path('/private/tmp/umf-primary-supplementary-bun-version-5be80ab9.log')
with vlog.open('wb') as stream:version_exit=subprocess.run(version_cmd,stdout=stream,stderr=subprocess.STDOUT).returncode
assert version_exit==0 and vlog.read_text().strip()=='1.4.2'
record={'profile':'umf.actions.current-primary-supplementary-browser/1','sourceRevision':revision,'runtimeImage':I,'sourceInputs':expected,'buildInputClosure':build_closure,'outsideCoreBuildInputs':outside,'bunVersionObservation':{'command':version_cmd,'exitCode':version_exit,'log':str(vlog),'logSha256':sha(vlog),'version':'1.4.2'},'coordinator':{'path':str(Path(__file__).resolve()),'sha256':sha(Path(__file__))},'builds':[],'runs':[]};dump(record)
volume_roots=['tests','scripts','docs/helix/01-frame/user-stories'];volume_names={p:P+'-local-'+('stories' if p.startswith('docs/') else p) for p in volume_roots};mounts=sum((['-v',n+':/work/'+p+':ro'] for p,n in volume_names.items()),[])
def served():
 entries=list((F/site/'dist').rglob('*'));assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries)
 data={str(p.relative_to(F)):sha(p) for p in sorted(entries) if p.is_file()};data['dist/umf.js']=sha(F/'dist/umf.js');return data
def run(inner,kind,name,script=None):
 try:
  assert sha(Path(__file__))==record['coordinator']['sha256'] and inputs()==expected and closure()==(build_closure,outside)
  if script:assert served()==record['servedArtifacts']
 except Exception as error:
  record.setdefault('boundaryFailures',[]).append({'stage':name,'boundary':'before','error':repr(error)});dump(record);raise
 owned=P+'-supp-'+name;command=['docker','run','--network',P,'-v',str(F)+':/work',*mounts,'--entrypoint','bun','--name',owned,I,*inner[1:]];log=Path('/private/tmp/umf-primary-supplementary-'+name+'-5be80ab9.log')
 print(json.dumps({'started':name,'command':command}),flush=True)
 with log.open('wb') as stream:code=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT).returncode
 inspected=json.loads(subprocess.check_output(['docker','inspect',owned]))[0];assert not inspected['State']['Running'] and inspected['State']['ExitCode']==code
 post_error=None
 try:stable=inputs()==expected and closure()==(build_closure,outside) and sha(Path(__file__))==record['coordinator']['sha256'] and (not script or served()==record['servedArtifacts'])
 except Exception as error:stable=False;post_error=repr(error)
 runtime={'imageId':inspected['Image'],'command':inspected['Config']['Cmd'],'entrypoint':inspected['Config']['Entrypoint'],'workingDirectory':inspected['Config']['WorkingDir'],'networks':sorted(inspected['NetworkSettings']['Networks']),'mounts':[{'source':m['Source'],'destination':m['Destination'],'type':m['Type'],'name':m.get('Name'),'rw':m['RW']} for m in inspected['Mounts']]}
 row={'command':command,'innerCommand':inner,'ownedContainer':owned,'imageId':inspected['Image'],'runtime':runtime,'exitCode':code,'log':str(log),'logSha256':sha(log),'sourceHeldStable':stable,'bun':'1.4.2','completionObservation':'Direct subprocess completion, closed raw log and actual stopped Docker inspect'}
 if post_error:row['postcheckError']=post_error
 if script:row['servedArtifactsHeldStable']=stable
 record[kind].append(row);dump(record)
 if script:
  row['script']=script;row['generatedReports']={}
  if script=='scripts/core-evolution-browser.ts' and code==0:
   root=F/'.cache/primary-supplementary/core-evolution';row['generatedReports']={str((root/n).relative_to(F)):sha(root/n) for n in ['entry.ts','browser.js','receipts.json','report.json']};row['result']=json.loads((root/'report.json').read_text())
  elif code==0:
   results=[]
   for line in log.read_text().splitlines():
    try:value=json.loads(line)
    except ValueError:continue
    if isinstance(value,dict) and 'browser' in value:results.append(value)
   assert len(results)==1;row['result']=results[0]
 dump(record)
 if code or not stable:raise SystemExit('Supplement failed at '+name)
 subprocess.run(['docker','rm',owned],check=True,stdout=subprocess.DEVNULL)
for inner,name in [(['bun','run','build'],'library-build'),(['bun','build',site+'/demo.ts','--target','browser','--minify','--outfile',site+'/dist/demo.js'],'demo-build'),(['bun',site+'/build-explorer.ts'],'explorer-build')]:run(inner,'builds',name)
assert sha(F/'dist/umf.js')==sealed_bundle,'Supplement rebuilt a different sealed library bundle'
record['servedArtifacts']=served();assert not any(p.endswith('.zip') for p in record['servedArtifacts']);dump(record)
(F/'.cache/primary-supplementary').mkdir(parents=True,exist_ok=True);assert not (F/'.cache/primary-supplementary/core-evolution').exists()
for script,name,args in [('scripts/core-evolution-browser.ts','core-evolution',['.cache/primary-supplementary/core-evolution']),('scripts/loader-browser.ts','loader',[]),('scripts/public-company-browser.ts','public-company',[]),('scripts/legal-appellate-browser.ts','legal-appellate',[])]:run(['bun',script,*args],'runs',name,script)
assert served()==record['servedArtifacts'];dump(record)
print('Four fresh supplementary browsers passed against exact captured source and served artifacts.',flush=True)
