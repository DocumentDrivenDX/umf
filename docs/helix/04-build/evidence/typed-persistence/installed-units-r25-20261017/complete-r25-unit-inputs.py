from pathlib import Path
import gzip,hashlib,io,json,subprocess,tarfile
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');cut='c042a13e88d51d52a810149f6e407da3eaef0cd2';target=Path('/private/tmp/sdk-r25-frozen-unit-inputs')
paths=['python/umf_access/conformance','docs/helix/04-build/evidence/typed-persistence/runtime-privilege-r19-20261017','docs/helix/04-build/evidence/typed-persistence/postgres-runtime-privilege-native-r13-20261017','docs/helix/04-build/evidence/typed-persistence/temporal-profile/python-normalization-sample.json']
b=subprocess.check_output(['git','archive',cut,*paths],cwd=repo)
with tarfile.open(fileobj=io.BytesIO(b)) as t:t.extractall(target,filter='data')
Path('/private/tmp/sdk-r25-unit-support-inputs.tar.gz').write_bytes(gzip.compress(b,mtime=0))
Path('/private/tmp/sdk-r25-unit-source-before.json').rename('/private/tmp/sdk-r25-unit-source-r1-before.json')
manifest={str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
Path('/private/tmp/sdk-r25-unit-source-before.json').write_text(json.dumps({'inputCommit':cut,'files':manifest,'inputArchiveSHA256':hashlib.sha256(Path('/private/tmp/sdk-r25-unit-inputs.tar.gz').read_bytes()).hexdigest(),'supportArchiveSHA256':hashlib.sha256(Path('/private/tmp/sdk-r25-unit-support-inputs.tar.gz').read_bytes()).hexdigest()},indent=2)+'\n');print(len(manifest))
