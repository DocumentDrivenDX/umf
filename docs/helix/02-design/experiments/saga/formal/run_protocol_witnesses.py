"""Check nonempty rollback/cancellation recovery and settled failed-compensation closure."""
import argparse
import hashlib
import json
import re
import runpy
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
BASE=Path(__file__).resolve().parent
OUT=BASE.parent/'evidence'/'protocol'
JAR_SHA=runpy.run_path(str(BASE/'run_protocol.py'))['JAR_SHA']
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def cases():
    return [dict(name='witness-'+prop,n=2,dispositions=['action','action'],faults=cancel,
                 results=['committed','failed'],responsive=True,variant='good',expected=prop,temporal=None,
                 faultProfile='cancel',lookupLimit=1,module='ProtocolWitnesses')
            for prop,cancel in [('NoCommittedPrefixRollbackRecovery',False),('NoFailedCompensationClosure',False),('NoCancelledCommittedPrefix',True)]]
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--java',default='java');p.add_argument('--jar',required=True,type=Path);a=p.parse_args()
    jar=a.jar.resolve();assert digest(jar)==JAR_SHA;OUT.mkdir(parents=True,exist_ok=True)
    java=subprocess.run([a.java,'-version'],capture_output=True,text=True,check=True)
    for c in cases():
        config=('CONSTANTS\nN = 2\nVariant = "good"\nFirstDisposition = "action"\n'+
                f'Faults = {str(c["faults"]).upper()}\n'+
                'Results = {"committed", "failed"}\nResponsive = TRUE\nLookupLimit = 1\nFaultProfile = "cancel"\n'+
                'SPECIFICATION Spec\nCHECK_DEADLOCK FALSE\nINVARIANT '+c['expected']+'\n')
        cfg=BASE/('protocol-'+c['name']+'.cfg');cfg.write_text(config)
        path=OUT/(c['name']+'.log')
        with tempfile.TemporaryDirectory(prefix='umf-protocol-witness-') as tmp:
            command=[a.java,'-Djava.io.tmpdir='+tmp,'-XX:+UseParallelGC','-Xmx1g','-cp',str(jar),'tlc2.TLC','-workers','1','-seed','908','-fp','0','-config',cfg.name,'-metadir',tmp+'/states','ProtocolWitnesses.tla']
            with path.open('w') as output:
                result=subprocess.run(command,cwd=BASE,stdout=output,stderr=subprocess.STDOUT,timeout=120)
        log=path.read_text();found=re.search(r'Invariant (\w+) is violated',log);actual=found[1] if found else None
        passed=result.returncode==12 and actual==c['expected'];counts=re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left',log)
        receipt={**c,'passed':passed,'exitCode':result.returncode,'actualViolation':actual,'completeWithoutViolation':False,
                 'stateCounts':counts[-1] if counts else None,'modelSha256':digest(BASE/'Protocol.tla'),
                 'witnessModelSha256':digest(BASE/'ProtocolWitnesses.tla'),'runnerSha256':digest(Path(__file__).resolve()),
                 'configSha256':digest(cfg),'logSha256':digest(path),'jarSha256':JAR_SHA,
                 'javaVersion':(java.stdout+java.stderr).strip(),'recordedUtc':datetime.now(timezone.utc).isoformat()}
        (OUT/(c['name']+'.json')).write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(dict(name=c['name'],passed=passed,actualViolation=actual)),flush=True)
        assert passed,path
if __name__=='__main__':main()
