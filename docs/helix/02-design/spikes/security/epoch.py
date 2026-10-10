"""Actual ordinary-session freshness observations; no complete writer inventory inferred."""
import hashlib
import json
import queue
import subprocess
import threading
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
CONTAINER='umf-security-spike-20261008'
BASE=['docker','exec','-i',CONTAINER,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U']
cases=[]
def sql(source,user='postgres'):
 return subprocess.run(BASE+[user],input=source,text=True,capture_output=True,timeout=10)
def observe(name,source,expected,user='umf_security_alice',error=None):
 result=sql(source,user);rows=[line for line in result.stdout.splitlines() if line]
 passed=(result.returncode!=0 and error in result.stderr and rows==expected) if error else (result.returncode==0 and rows==expected)
 row={'id':name,'covers':['US-057-AC3','US-057-AC7'],'actor':user,'source':source,'expected':{'rows':expected,'error':error},'observed':{'rows':rows,'stderr':result.stderr},'status':'passed' if passed else 'failed'}
 cases.append(row)
 assert passed,row
setup=sql((HERE/'epoch.sql').read_text());assert setup.returncode==0,setup.stderr
observe('healthy-native-epoch',"BEGIN;SELECT pg_advisory_xact_lock_shared(529053);SELECT sec.assert_current_epoch();SELECT id FROM sec.resource ORDER BY id;COMMIT;",['t','RA'])
observe('private-epoch-table','SELECT * FROM sec.authority_epoch;',[],error='permission denied')
observe('private-native-clock','SELECT * FROM sec.authority_generation;',[],error='permission denied')
# Keep an actual ordinary RR connection alive across an independently committed change.
p=subprocess.Popen(BASE+['umf_security_alice'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
lines=[];events=queue.Queue()
def pump():
 for line in p.stdout:lines.append(line.strip());events.put(line.strip())
thread=threading.Thread(target=pump,daemon=True);thread.start()
try:
 p.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT 1 FROM pg_catalog.pg_class LIMIT 1;SELECT 'SNAPSHOT_OPEN';\n");p.stdin.flush()
 while events.get(timeout=10)!='SNAPSHOT_OPEN':pass
 change=sql("BEGIN;SELECT pg_advisory_xact_lock(529053);UPDATE sec.authority_epoch SET generation=nextval('sec.authority_generation');UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A';COMMIT;")
 assert change.returncode==0,change.stderr
 observe('fresh-current-authority',"BEGIN;SELECT pg_advisory_xact_lock_shared(529053);SELECT sec.assert_current_epoch();SELECT count(*) FROM sec.resource;COMMIT;",['t','0'])
 p.stdin.write("SELECT pg_advisory_xact_lock_shared(529053);SELECT sec.assert_current_epoch();SELECT id FROM sec.resource;\n");p.stdin.flush();p.stdin.close()
 p.wait(timeout=10);thread.join(timeout=2);stderr=p.stderr.read()
 passed=p.returncode!=0 and 'Authority snapshot unavailable' in stderr and 'RA' not in lines and 'RB' not in lines
 cases.append({'id':'old-rr-first-protected-read-refuses','covers':['US-057-AC3','US-057-AC7'],'actor':'umf_security_alice','expected':'Refusal before protected rows after authority acknowledgment','observed':{'rows':lines,'stderr':stderr,'exitCode':p.returncode},'status':'passed' if passed else 'failed'})
 assert passed,cases[-1]
finally:
 if p.poll() is None:p.kill();p.wait(timeout=5)
 thread.join(timeout=2)
# A sequence advance followed by rollback must not silently reuse stale committed authority.
rolled=sql("BEGIN;SELECT pg_advisory_xact_lock(529053);UPDATE sec.authority_epoch SET generation=nextval('sec.authority_generation');ROLLBACK;")
assert rolled.returncode==0,rolled.stderr
observe('rolled-back-clock-advance-refuses',"BEGIN;SELECT pg_advisory_xact_lock_shared(529053);SELECT sec.assert_current_epoch();SELECT id FROM sec.resource;",[],error='Authority snapshot unavailable')
# Missing retained epoch refuses even without any target rows.
removed=sql('DELETE FROM sec.authority_epoch;');assert removed.returncode==0,removed.stderr
observe('missing-epoch-refuses-empty-query',"SELECT sec.assert_current_epoch();SELECT count(*) FROM sec.resource WHERE false;",[],error='Authority snapshot unavailable')
receipt={'server':sql('SELECT version();').stdout.strip(),'command':'python3 docs/helix/02-design/spikes/security/epoch.py','cases':cases,
 'sourceDigests':{str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [HERE/'epoch.py',HERE/'epoch.sql',HERE/'postgresql.sql']},
 'scope':'Participating native epoch/snapshot protocol only; direct-SQL closure, complete writers, recovery and full backend admission remain unqualified'}
(ROOT/'docs/helix/04-build/evidence/security/epoch.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'passed':len(cases),'scope':receipt['scope']}))
