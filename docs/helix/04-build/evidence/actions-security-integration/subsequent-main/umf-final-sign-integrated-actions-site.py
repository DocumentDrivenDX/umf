from pathlib import Path
import subprocess,json
R=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf');S=R/'docs/helix/05-deploy/microsite/dist';cli=Path('/private/tmp/umf-actions-innsigle-verifier/src/cli.mjs');verifier=cli.parents[1]
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=verifier,text=True).strip()=='4185eb56beb7b52beaa4a00c2fc897f93d44b939'
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=verifier,text=True).strip()
pages=sorted([*S.glob('*.html'),*(S/'actions').glob('*.html')]);assert len(pages)==16 and sum(p.parent.name=='actions' for p in pages)==10
log=R/'.cache/actions-documentation-signing-final.log';log.parent.mkdir(exist_ok=True)
with log.open('w') as output:
 for p in pages:
  command=['node',str(cli),'seal',str(p),'--force','--uri','https://documentdrivendx.github.io/umf/'+str(p.relative_to(S))];subprocess.run(command,cwd=R,stdout=output,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['node',str(cli),'verify','--all'],cwd=R,stdout=output,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['node',str(cli),'publish',str(S)],cwd=R,stdout=output,stderr=subprocess.STDOUT,check=True)
print(json.dumps({'signedAndVerifiedPages':len(pages),'log':str(log)}))
