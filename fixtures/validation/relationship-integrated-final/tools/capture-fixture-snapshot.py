import hashlib,json,subprocess
from pathlib import Path
p=Path('fixtures/validation/relationship-integrated-refresh/relationship-final-runs.json')
output='fixtures/validation/relationship-integrated-acceptance-evidence.json'
r=json.loads(p.read_text())
assert r['complete'] and r['idealAdmitted'] and r['priorityDelivery'] and not r['nativeEquivalence']
paths=set()
for command in [['git','diff','--name-only','--','fixtures'],['git','ls-files','--others','--exclude-standard','fixtures']]:
 paths.update(subprocess.check_output(command,text=True).splitlines())
paths.difference_update([str(p),output])
for file in sorted(paths):
 q=Path(file)
 assert q.is_file(),file
 r['sha256'][file]=hashlib.sha256(q.read_bytes()).hexdigest()
r['artifactSnapshotScope']='Current bytes of changed and newly produced fixture evidence, including retained historical records; hashing an archive does not extend its original support claims or relabel historical acceptance as fresh execution.'
p.write_text(json.dumps(r,indent=2)+'\n')
print('Snapshot includes',len(r['sha256']),'fixture artifacts')
