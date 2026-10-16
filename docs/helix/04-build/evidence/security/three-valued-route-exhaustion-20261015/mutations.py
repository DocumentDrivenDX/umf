import pathlib,shutil,subprocess,json
root=pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf');out=pathlib.Path('/private/tmp/route-three-valued-mutants');out.mkdir(exist_ok=True)
mutants=[('unknown-ignored','catalog-runtime-candidate.ts',"evaluated.some((r:any)=>r.truth==='U')?'indeterminate'","false?'indeterminate'"),('forbid-ignored','catalog-runtime-candidate.ts',"r.rule.effect==='forbid'&&r.truth==='T'","false&&r.truth==='T'"),('require-ignored','catalog-runtime-candidate.ts',"r.rule.effect==='require'&&r.truth!=='T'","false&&r.truth!=='T'"),('withholding-not-dominant','query-value-routes-candidate.ts',"other.kind==='withheld'||other.kind==='transformed'","other.kind==='transformed'"),('distinct-transforms-not-conflicting','query-value-routes-candidate.ts',"other.kind==='withheld'||other.kind==='transformed'","other.kind==='withheld'"),('duplicate-transform-not-coalesced','query-value-routes-candidate.ts',"let index=groupIndex.get(key);","let index=undefined;")]
results=[]
for name,file,old,new in mutants:
 d=out/name;d.mkdir(exist_ok=True);
 for dep in ['spec','node_modules']:
  if not (d/dep).exists():(d/dep).symlink_to(root/dep,target_is_directory=True)
 shutil.copytree(root/'src',d/'src',dirs_exist_ok=True);(d/'tests/security/protection').mkdir(parents=True,exist_ok=True)
 for f in ['query-value-three-valued-corpus.ts','query-value-three-valued.test.ts']:shutil.copyfile(root/'tests/security'/f,d/'tests/security'/f)
 shutil.copyfile(root/'tests/security/protection/query-value-route-guards.json',d/'tests/security/protection/query-value-route-guards.json')
 p=d/'src/extensions/security'/file;s=p.read_text();assert s.count(old)==1,(name,s.count(old));p.write_text(s.replace(old,new));c=subprocess.run(['/opt/homebrew/bin/bun','test','tests/security/query-value-three-valued.test.ts'],cwd=d,text=True,capture_output=True,timeout=60);(d/'result.log').write_text(c.stdout+c.stderr);assert c.returncode!=0 and 'error: {' in c.stderr and 'expectedDecision' in c.stderr,(name,c.stdout,c.stderr[:500]);results.append({'name':name,'detected':True,'failure':'Independent expected decision/selection/branch/truth mismatch','exitCode':c.returncode})
(out/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results))
