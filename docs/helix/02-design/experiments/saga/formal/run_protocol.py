"""Complete bounded protocol checks; mutants/witnesses must violate exact named properties."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE.parent / 'evidence' / 'protocol'
JAR_SHA = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
PROPERTIES = ('TypeOK IntentPinned OutcomesSound ProviderFinality NoncommitHasNoEffect NoDuplicateEffects ForwardOrdered ReverseRecovery '
              'FailureStartsUnwind CausePinned StopCausePresent CancelledCause CancelCut ExpiryCut '
              'NoAutomaticResume StoppedAdmission TicketOwnership NativeAdmission HonestTermination NoFalseRestoration ClosedSettled ClosedEvidence').split()

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def cases():
    result = []
    def add(name, n=2, disposition=None, faults=True, results=None, responsive=False, variant='good', expected=None, temporal=None, fault_profile='all', lookup_limit=1):
        result.append(dict(name=name, n=n, dispositions=disposition or ['action']*n, faults=faults,
                           results=results or ['committed','rejected','conflict','failed'], responsive=responsive,
                           variant=variant, expected=expected, temporal=temporal, faultProfile=fault_profile, lookupLimit=lookup_limit))
    add('smoke', n=1, faults=False, responsive=True)
    add('safety-two')
    add('safety-three', n=3, results=['committed','failed'], fault_profile='crash', lookup_limit=2)
    add('safety-irreversible', disposition=['irreversible','action'])
    add('safety-no-effect', disposition=['unnecessary','action'])
    add('progress-stable', n=3, faults=False, responsive=True, temporal='EventuallyStopped')
    add('progress-success', n=3, faults=False, responsive=True, results=['committed'], temporal='EventuallySucceeded')
    for variant, invariant in [
        ('failed-reinvoke','NoncommitHasNoEffect'), ('resume','NoAutomaticResume'), ('changed-intent','IntentPinned'), ('unknown-advance','ForwardOrdered'),
        ('duplicate-effect','NoDuplicateEffects'), ('rollback-running','FailureStartsUnwind'),
        ('late-cancel','CancelledCause'), ('skip-barrier','NoFalseRestoration'),
        ('timeout-failure','OutcomesSound'), ('budget-admit','ExpiryCut'),
        ('stale-owner','TicketOwnership'), ('retired-admit','NativeAdmission'),
        ('fabricated-resolution','OutcomesSound'), ('close-pending','ClosedSettled'),
        ('close-stale','ClosedEvidence'), ('close-foreign','ClosedEvidence'), ('close-outsider','ClosedEvidence'),
    ]:
        add('mutant-'+variant, variant=variant, expected=invariant,
            disposition=['irreversible','action'] if variant=='skip-barrier' else None)
    for invariant in ['NoQueuedWitness','NoRunningWitness','NoReconcilingWitness',
                      'NoCompensatingWitness','NoSucceededWitness','NoCompensatedWitness',
                      'NoCancelledWitness','NoInterventionWitness','NoClosedWitness',
                      'NoNoncommitUnwindWitness','NoUnknownInterventionWitness',
                      'NoCrashRecoveryWitness','NoResidualClosureWitness','NoBarrierWitness','NoLateFailedReplayWitness','NoNoEffectWitness']:
        add('witness-'+invariant, expected=invariant,
            faults=invariant in ['NoCancelledWitness','NoUnknownInterventionWitness','NoCrashRecoveryWitness'],
            lookup_limit=2 if invariant=='NoCrashRecoveryWitness' else 1,
            fault_profile='crash' if invariant=='NoCrashRecoveryWitness' else 'cancel' if invariant=='NoCancelledWitness' else 'budget',
            results=['committed'] if invariant=='NoCrashRecoveryWitness' else None,
            disposition=['irreversible','action'] if invariant in ['NoBarrierWitness','NoResidualClosureWitness'] else
                        ['unnecessary','action'] if invariant=='NoNoEffectWitness' else None)
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--java', default='java');p.add_argument('--jar',required=True,type=Path)
    p.add_argument('--case',action='append',default=[]);p.add_argument('--timeout',type=int,default=1200)
    a=p.parse_args();jar=a.jar.resolve()
    if digest(jar)!=JAR_SHA:raise SystemExit('Unpinned TLC jar')
    OUT.mkdir(parents=True,exist_ok=True)
    java=subprocess.run([a.java,'-version'],capture_output=True,text=True,check=True)
    selected=[c for c in cases() if not a.case or c['name'] in a.case]
    if a.case and set(a.case)-{c['name'] for c in selected}:raise SystemExit('Unknown case')
    for c in selected:
        strings=lambda values:'{'+', '.join(json.dumps(v) for v in values)+'}'
        constants=(f'N = {c["n"]}\nVariant = "{c["variant"]}"\nFirstDisposition = '+
                   json.dumps(c['dispositions'][0])+'\n'+
                   f'Faults = {str(c["faults"]).upper()}\nResults = {strings(c["results"])}\n'+
                   f'Responsive = {str(c["responsive"]).upper()}\nLookupLimit = {c["lookupLimit"]}\nFaultProfile = '+json.dumps(c['faultProfile'])+'\n')
        witness=c['expected'] and c['expected'].startswith('No') and c['name'].startswith('witness-')
        invariants=[c['expected']] if witness else ([c['expected']] if c['expected'] else [])+[v for v in PROPERTIES if v!=c['expected']]
        config='CONSTANTS\n'+constants+'SPECIFICATION '+('ProgressSpec' if c['temporal'] else 'Spec')+'\nCHECK_DEADLOCK FALSE\nINVARIANTS '+' '.join(invariants)+'\n'
        if c['temporal']:config+='PROPERTY '+c['temporal']+'\n'
        cfg=BASE/('protocol-'+c['name']+'.cfg');cfg.write_text(config)
        command=[a.java,'-XX:+UseParallelGC','-Xmx4g','-cp',str(jar),'tlc2.TLC','-workers',('1' if c['expected'] else '4'),'-seed','908','-fp','0','-config',cfg.name]
        start=datetime.now(timezone.utc).isoformat()
        path=OUT/(c['name']+'.log')
        with tempfile.TemporaryDirectory(prefix='umf-protocol-') as temp:
            try:
                with path.open('w') as output:
                    actual=[command[0], '-Djava.io.tmpdir='+temp, *command[1:], '-metadir',temp+'/states','Protocol.tla']
                    run=subprocess.run(actual,cwd=BASE,stdout=output,stderr=subprocess.STDOUT,text=True,timeout=a.timeout)
                log=path.read_text()
            except subprocess.TimeoutExpired:
                raise SystemExit(c['name']+': timeout; incomplete, not passed')
        match=re.search(r'Invariant (\w+) is violated',log);actual=match[1] if match else None
        complete='Model checking completed. No error has been found.' in log
        passed=(run.returncode==12 and actual==c['expected']) if c['expected'] else (run.returncode==0 and complete)
        counts=re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left',log)
        receipt={**c,'startedUtc':start,'passed':passed,'exitCode':run.returncode,'actualViolation':actual,'completeWithoutViolation':complete,
                 'stateCounts':counts[-1] if counts else None,'logSha256':digest(path),'configSha256':digest(cfg),
                 'modelSha256':digest(BASE/'Protocol.tla'),'runnerSha256':digest(Path(__file__).resolve()),'jarSha256':JAR_SHA,
                 'javaVersion':(java.stdout+java.stderr).strip(),'command':command+['-metadir','<temporary-state-directory>','Protocol.tla']}
        (OUT/(c['name']+'.json')).write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps({k:receipt[k] for k in ['name','passed','actualViolation','stateCounts']}),flush=True)
        if not passed:raise SystemExit('Unexpected result: '+str(path))
    receipts=[]
    for c in cases():
        path=OUT/(c['name']+'.json')
        if path.exists():
            entry=json.loads(path.read_text())
            if entry['modelSha256']==digest(BASE/'Protocol.tla') and entry['runnerSha256']==digest(Path(__file__).resolve()):receipts.append(entry)
    summary={'requiredCases':len(cases()),'currentCases':len(receipts),'allPassed':len(receipts)==len(cases()) and all(r['passed'] for r in receipts),
             'modelSha256':digest(BASE/'Protocol.tla'),'runnerSha256':digest(Path(__file__).resolve()),'jarSha256':JAR_SHA,'results':receipts}
    (OUT/'results.json').write_text(json.dumps(summary,indent=2)+'\n')

if __name__=='__main__':main()
