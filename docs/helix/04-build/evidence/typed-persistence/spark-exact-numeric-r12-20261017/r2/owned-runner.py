import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

import umf_access
import weft

repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
out=Path(sys.argv[1]);out.mkdir()
fixture=out/'fixture'
shutil.copytree('/private/tmp/sdk-spark-numeric-r12-generation-r1',fixture)
inputs=out/'inputs';shutil.copytree(repo/'fixtures/access/spark-numeric',inputs)
harness=out/'frozen-harness.py';shutil.copyfile(repo/'python/umf_access/tests/spark_numeric_e2e.py',harness)
shutil.copyfile(__file__,out/'owned-runner.py')
wheels=[('/private/tmp/sdk-completion-runtime-r12-wheels/umf_access-0.1.0.dev0-py3-none-any.whl',umf_access,'umf_access/'),
        ('/private/tmp/weft-combined-sdk-local-r12/wheels/weft_sql-0.4.42.dev0-cp39-abi3-macosx_11_0_arm64.whl',weft,'weft/')]
def snapshot():
    result=[]
    for file,module,prefix in wheels:
        site=Path(module.__file__).parent.parent;payloads={}
        with zipfile.ZipFile(file) as archive:
            for name in archive.namelist():
                if name.startswith(prefix) and not name.endswith('/'):
                    raw=archive.read(name);assert(site/name).read_bytes()==raw,name
                    payloads[name]=hashlib.sha256(raw).hexdigest()
        result.append({'wheel':file,'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest(),'payloads':payloads})
    return result
before=snapshot()
env={key:value for key,value in os.environ.items() if key not in ('PYTHONPATH','PYTHONHOME')}
env.update(JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    UMF_DELTA_JARS='/private/tmp/sdk-delta4-jars',SPARK_LOCAL_IP='127.0.0.1',PYSPARK_PYTHON=sys.executable)
try:
    with (out/'campaign.log').open('w') as log:
        result=subprocess.run([sys.executable,'-I','-B',str(harness),str(fixture),str(inputs)],
            cwd=out,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
finally:
    after=snapshot()
    (out/'installed-proof.json').write_text(json.dumps({'before':before,'after':after,'unchanged':before==after,
        'harnessSha256':hashlib.sha256(harness.read_bytes()).hexdigest(),'temporal':'HELD'},indent=2)+'\n')
assert before==after
assert result.returncode==0,'native campaign failed; retained campaign.log'
print(json.dumps({'exitCode':result.returncode,'verification':str(fixture/'verification.json')}))
