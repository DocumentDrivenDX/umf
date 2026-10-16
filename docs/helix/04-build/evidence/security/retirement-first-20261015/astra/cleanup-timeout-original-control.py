"""Historical fault-injection invocation used before cleanup repair.

This preserves the originally executed logic. It reads the live source, so the
recorded initial failure is historical and this script is not a reproducer of
the final repaired source. No exact pre-fix source snapshot was captured here.
"""
import json,pathlib,runpy,subprocess,sys,types
root=pathlib.Path.cwd(); source=root/'tools/security/pg-retirement-first-probe.py'
real_run=subprocess.run; calls=[]; created=[]
def fake_run(args,**kw):
    calls.append(args[:3])
    if args[:3]==['docker','container','ls']:
        return subprocess.CompletedProcess(args,0,stdout='',stderr='')
    if args[:3]==['docker','run','-d']:
        created.append(args[args.index('--name')+1])
        raise subprocess.TimeoutExpired(args,20)
    if args[:2]==['docker','inspect']:
        return subprocess.CompletedProcess(args,0,stdout='unused',stderr='')
    if args[:2]==['docker','rm']:
        created.clear(); return subprocess.CompletedProcess(args,0,stdout='removed',stderr='')
    raise AssertionError(args)
sys.modules['psycopg']=types.SimpleNamespace(__version__='mock-not-native')
subprocess.run=fake_run
try:
    runpy.run_path(str(source),run_name='fault_injected_cleanup_review')
except subprocess.TimeoutExpired:
    pass
finally:
    subprocess.run=real_run
result={'test':'fault-injected docker-run timeout after simulated daemon-side creation','nativeExecution':False,'calls':calls,'simulatedOwnedFixtureRemains':bool(created),'cleanupAttempted':any(x[:2]==['docker','rm'] for x in calls)}
out=pathlib.Path('/private/tmp/umf-retirement-first-astra-20261015');out.mkdir(exist_ok=True)
(out/'cleanup-timeout-control.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
