import subprocess,json,time,hashlib,pathlib
out=pathlib.Path('/evidence'); rows=[]; start=time.monotonic()
def run(args,limit=20):
 p=subprocess.run(['git','-c','safe.directory=/source','-c','core.hooksPath=/dev/null','-C','/source',*args],capture_output=True,timeout=limit)
 if len(p.stdout)+len(p.stderr)>262144:raise RuntimeError('bounded metadata capture exceeded')
 rows.append({'argv':args,'exitCode':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode(),'elapsedSeconds':time.monotonic()-start})
 (out/'commands.json').write_text(json.dumps(rows,indent=2)+'\n');p.check_returncode();return p.stdout.decode().strip()
p='e4299aff8e87e9d211f9d86df2f2013ab9c95945';t='8b98c0d895983ba2b7637dd3aea567dab0943883';m='dce9b430422242edd135e69a7a64620d0244784e'
assert run(['rev-parse','HEAD'])==p and run(['rev-parse','HEAD^{tree}'])==t and run(['status','--porcelain'])==''
old=run(['remote','get-url','origin']);run(['remote','set-url','origin','https://github.com/DocumentDrivenDX/umf.git'])
run(['fetch','--no-tags','origin',m,'refs/tags/umf-v0.5.7:refs/tags/umf-v0.5.7'],120)
assert run(['rev-parse','HEAD'])==p and run(['rev-parse','HEAD^{tree}'])==t and run(['status','--porcelain'])==''
run(['merge-base','--is-ancestor',p,m]);assert run(['rev-parse','refs/tags/umf-v0.5.7^{commit}'])==m
(out/'receipt.json').write_text(json.dumps({'scope':'Git metadata preparation only; no checkout/product execution','status':'passed','sourceVolume':'umf-migration-source-267675510','producerP':p,'producerTree':t,'M':m,'tag':'umf-v0.5.7','oldOrigin':old,'origin':'https://github.com/DocumentDrivenDX/umf.git','trackedWorkingTreeCleanBeforeAfter':True,'durationSeconds':time.monotonic()-start},indent=2)+'\n')
