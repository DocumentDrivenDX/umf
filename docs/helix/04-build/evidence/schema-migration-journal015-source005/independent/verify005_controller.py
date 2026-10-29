"""Literal previously reviewed journal004 commands against the frozen005 overlay.

No discovery, package scripts, database, network, build or provider operations.
Only the separately reviewed supervisor may launch this one-shot worker.
"""
import hashlib,json,os,pathlib,subprocess,time
Q=pathlib.Path(__file__).resolve().parent
# Filled from the sealed source-only command/closure records before GO.
COMMANDS_SHA='372d20e6752ab825b130826002a384098733dbe3140ac57e5df033ed80bba86b'
CLOSURE_SHA='31f1d16121a652086295cc62921e74ee1f2823fd5cf5419e2548c65ad0989e27'
def sha(raw):return hashlib.sha256(raw).hexdigest()
start=time.monotonic()
commands_raw=(Q/'commands.json').read_bytes();closure_raw=(Q/'assembled-closure.json').read_bytes()
assert sha(commands_raw)==COMMANDS_SHA and sha(closure_raw)==CLOSURE_SHA
for item in json.loads(closure_raw):
    path=Q/'combined'/item['path'];raw=path.read_bytes()
    assert not path.is_symlink() and len(raw)==item['bytes'] and sha(raw)==item['sha256']
# Parent writes actual PID/PGID/start metadata before ANY product execution.
launch=None
while time.monotonic()-start<2:
    dirs=list(Q.glob('journal005-verification-once-*'))
    if len(dirs)==1 and (dirs[0]/'launch.safe.json').exists():
        launch=json.loads((dirs[0]/'launch.safe.json').read_bytes());break
    time.sleep(.01)
assert launch is not None and launch['pid']==os.getpid()==os.getpgrp()==launch['pgid']
assert launch['worker_sha256']==sha(pathlib.Path(__file__).read_bytes())
report={'pid':os.getpid(),'pgid':os.getpgrp(),'launch':launch,'commands':[],'productExecutionStartedAfterLaunchRecord':True}
success=False
try:
    for command in json.loads(commands_raw):
        remaining=42-(time.monotonic()-start)
        assert remaining>0,'original finite work budget exhausted'
        entry={'name':command['name'],'argv':command['argv'],'cwd':command['cwd']};report['commands'].append(entry)
        stdout,stderr=b'',b''
        try:
            run=subprocess.run(command['argv'],cwd=command['cwd'],stdin=subprocess.DEVNULL,capture_output=True,timeout=min(remaining,command['timeoutSeconds']),check=False)
            stdout,stderr=run.stdout,run.stderr;entry['exitCode']=run.returncode
        except subprocess.TimeoutExpired as error:
            stdout,stderr=error.stdout or b'',error.stderr or b'';entry['timeout']=True
            raise
        finally:
            for suffix,raw in (('stdout',locals().get('stdout',b'')),('stderr',locals().get('stderr',b''))):
                (Q/(command['name']+'.'+suffix)).write_bytes(raw)
        assert run.returncode==0,command['name']
    unit=json.loads((Q/'suite-result.json').read_bytes())
    assert unit=={'tests':207,'failures':0,'errors':0,'passed':True}
    probes=json.loads((Q/'findings.json').read_bytes())
    expected={'foreign-noncanonical-observation-real-signed-root-unmodified':False,'bare-scope4-generic-intent-no-typed-store-parent':False,'new02-restart-prefix-8':True,'new02-restart-prefix-9':True}
    assert all(next(row['accepted'] for row in probes if row['case']==name) is value for name,value in expected.items())
    assert all(row['accepted'] is False for row in json.loads((Q/'digest-association-results.json').read_bytes()))
    success=True
finally:
    report.update(completed=success,elapsedSeconds=time.monotonic()-start)
    (Q/'controller-result.json').write_text(json.dumps(report,indent=2)+'\n')
if not success:raise SystemExit(1)
