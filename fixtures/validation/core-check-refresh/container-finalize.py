import hashlib, json, subprocess
from pathlib import Path
out=Path('fixtures/validation/core-check-refresh')
def checked(command,name):
    log=out/(name+'.log')
    if log.exists():
        i=1
        while (out/f'{name}-attempt-{i}.log').exists(): i+=1
        log.rename(out/f'{name}-attempt-{i}.log')
    with log.open('wb') as stream:
        result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT)
    row={'command':command,'exitCode':result.returncode,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}
    (out/(name+'.json')).write_text(json.dumps(row,indent=2)+'\n')
    if result.returncode: raise SystemExit(result.returncode)
subprocess.run(['/opt/venv/bin/python','/opt/replay.py','publish'],check=True)
checked(['bun','scripts/verify-current-core-evidence.ts'],'container-integrity')
subprocess.run(['/opt/venv/bin/python','/opt/replay.py','seal'],check=True)
checked(['bun','scripts/verify-current-core-evidence.ts'],'container-post-seal-integrity')
print('Final evidence publication, seal and post-seal integrity passed',flush=True)
