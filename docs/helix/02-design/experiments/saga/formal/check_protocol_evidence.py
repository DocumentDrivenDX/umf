"""Check portable evidence verification and reject actual tampered artifact copies."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
BASE=Path(__file__).resolve().parent
OUT=BASE.parent/'evidence'/'protocol'
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    report=json.loads((OUT/'report.json').read_text())
    cases=[]
    with tempfile.TemporaryDirectory(prefix='umf-protocol-evidence-check-') as tmp:
        root=Path(tmp);formal=root/'formal';evidence=root/'evidence'/'protocol'
        formal.mkdir();evidence.mkdir(parents=True)
        for path in [*BASE.glob('*.tla'),*BASE.glob('*.py'),*BASE.glob('protocol-*.cfg')]:
            shutil.copyfile(path,formal/path.name)
        for path in [OUT/'report.json',*OUT.glob('*.log.gz')]:
            shutil.copyfile(path,evidence/path.name)
        def verify():
            return subprocess.run([sys.executable,str(formal/'publish_protocol.py'),'--verify'],capture_output=True,text=True)
        baseline=verify();assert baseline.returncode==0,baseline.stderr
        changes=[('model-bytes',formal/'Protocol.tla',lambda b:b+b'\n'),
                 ('configuration-bytes',formal/report['results'][0]['configuration'],lambda b:b+b'\n'),
                 ('original-log-custody',evidence/report['results'][0]['compressedLog'],lambda b:b+b'x')]
        for name,path,change in changes:
            original=path.read_bytes();path.write_bytes(change(original));result=verify()
            path.write_bytes(original);assert result.returncode!=0,name;cases.append(dict(name=name,rejected=True))
        path=evidence/'report.json';original=path.read_bytes()
        for name,change in [('missing-case',lambda d:d['results'].pop()),
                            ('wrong-case-bound',lambda d:d['results'][0].update(n=99)),
                            ('wrong-tool-pin',lambda d:d.update(jarSha256='0'*64))]:
            data=json.loads(original);change(data);path.write_text(json.dumps(data));result=verify()
            path.write_bytes(original);assert result.returncode!=0,name;cases.append(dict(name=name,rejected=True))
        assert verify().returncode==0
    result=dict(baselineAccepted=True,negativeControlsRejected=len(cases),results=cases,
                checkerSha256=digest(Path(__file__).resolve()),reportSha256=digest(OUT/'report.json'),
                limits=['Evidence consistency controls only; no execution attestation or native qualification'])
    (OUT/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(baselineAccepted=True,negativeControlsRejected=len(cases))))
if __name__=='__main__':main()
