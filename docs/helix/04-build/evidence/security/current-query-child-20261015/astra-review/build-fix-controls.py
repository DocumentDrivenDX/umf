from pathlib import Path
import subprocess,json,hashlib,shutil
root=Path('/Users/erik/.codex/worktrees/security-main-integration/umf');out=Path('/private/tmp/current-query-child-astra-20261015');builder=root/'tools/security/build-current-query-child.ts';rows=[]
for mode in ['baseline','post-build-change','closure-change']:
 p=out/('build-fix-'+mode);(p/'tools/security').mkdir(parents=True,exist_ok=True);shutil.copy2(builder,p/'tools/security/build-current-query-child.ts');(p/'tools/security/current-query-child-main.ts').write_text("console.log('OLD_BUILD_BYTES');\n");(p/'package.json').write_text('{"name":"private-review-fixture","version":"0.0.0"}\n');(p/'bun.lock').write_text('{}\n')
 preload="import {writeFileSync} from 'node:fs';\nconst original=Bun.build;let calls=0;Bun.build=(async(options:any)=>{const result=await original(options);calls++;"
 if mode=='post-build-change':preload+="if(calls===2)writeFileSync('tools/security/current-query-child-main.ts',\"console.log('NEW_PINNED_BYTES');\\n\");"
 if mode=='closure-change':preload+="if(calls===1){writeFileSync('tools/security/current-query-child-main.ts',\"import './new-dependency'; console.log('NEW_PINNED_BYTES');\\n\");writeFileSync('tools/security/new-dependency.ts',\"console.log('NEW_DEPENDENCY');\\n\");}"
 preload+='return result;}) as typeof Bun.build;\n';(p/'preload.ts').write_text(preload)
 r=subprocess.run(['/opt/homebrew/bin/bun','--preload',str(p/'preload.ts'),str(p/'tools/security/build-current-query-child.ts'),str(p/'output')],capture_output=True,text=True,timeout=30)
 (p/'stdout.txt').write_text(r.stdout);(p/'stderr.txt').write_text(r.stderr)
 expected='Build source changed' if mode=='post-build-change' else 'Build closure changed'
 passed=(r.returncode==0 and (p/'output/manifest.json').exists()) if mode=='baseline' else (r.returncode!=0 and not (p/'output/manifest.json').exists() and expected in r.stderr)
 rows.append(dict(mode=mode,passed=passed,exit=r.returncode,manifest=(p/'output/manifest.json').exists(),expectedFailure=None if mode=='baseline' else expected));assert passed,rows[-1]
(out/'build-fix-controls.json').write_text(json.dumps(dict(builderSha256=hashlib.sha256(builder.read_bytes()).hexdigest(),controls=rows,scope='Private minimal copy of exact original builder; controlled mutations around actual build. Endpoint custody, not hermetic or ABA proof.'),indent=2)+'\n');print(json.dumps(rows))
