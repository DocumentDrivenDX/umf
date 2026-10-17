from pathlib import Path
import hashlib,io,json,shutil,subprocess,tarfile,gzip
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');cut='c042a13e88d51d52a810149f6e407da3eaef0cd2'
source=Path('/private/tmp/sdk-r25-frozen-frontend-inputs');target=Path('/private/tmp/sdk-r25-frozen-unit-inputs');assert not target.exists();shutil.copytree(source,target)
b=subprocess.check_output(['git','archive',cut,'python/umf_access/tests','fixtures/access','scripts'],cwd=repo)
Path('/private/tmp/sdk-r25-unit-inputs.tar.gz').write_bytes(gzip.compress(b,mtime=0))
with tarfile.open(fileobj=io.BytesIO(b)) as t:t.extractall(target,filter='data')
manifest={str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file()}
Path('/private/tmp/sdk-r25-unit-source-before.json').write_text(json.dumps({'inputCommit':cut,'files':manifest,'sourceArchiveSHA256':hashlib.sha256(Path('/private/tmp/sdk-r25-unit-inputs.tar.gz').read_bytes()).hexdigest()},indent=2)+'\n')
print(len(manifest))
