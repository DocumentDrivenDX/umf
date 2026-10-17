from pathlib import Path
import io,json,shutil,subprocess,tarfile
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
out=Path('/private/tmp/sdk-r19-refactor-source')
if out.exists():assert not any(out.iterdir())
else:out.mkdir()
commit='7b206ef3b2720500c8409b17915629e4aac11448'
selected=['src','spec','scripts','tests','fixtures','python/umf_access/tests','package.json','bun.lock','tsconfig.json']
data=subprocess.check_output(['git','archive',commit,*selected],cwd=root)
with tarfile.open(fileobj=io.BytesIO(data)) as archive:archive.extractall(out,filter='data')
(out/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
previous=Path('/private/tmp/sdk-r14-refactor-source')
shutil.copytree(previous/'native',out/'native')
relative=Path('docs/helix/04-build/evidence/typed-persistence')
for name in ['b-tp-005-generate-corpus.ts','dsl-typing-spike/compatibility/mypy.ini','dsl-typing-spike/compatibility/pyrightconfig.json']:
 p=out/relative/name;p.parent.mkdir(parents=True,exist_ok=True)
 p.write_bytes(subprocess.check_output(['git','show',f'{commit}:{relative/name}'],cwd=root))
build=json.loads(Path('/private/tmp/sdk-completion-runtime-r19-build.json').read_text())
snapshot={'wheel':build['wheel'],'wheelSha256':build['wheelSha256'],'python':'/private/tmp/sdk-r19-314-env/bin/python','sourceCommit':commit,'temporal':'HELD'}
p=out/relative/'production-packaging/stable-runtime-checkpoint.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(snapshot,indent=2)+'\n')
Path('/private/tmp/sdk-r19-refactor-snapshot.json').write_text(json.dumps(snapshot,indent=2)+'\n')
print(out)
