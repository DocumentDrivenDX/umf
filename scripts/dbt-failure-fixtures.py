"""Capture an intentionally failing, isolated native dbt build; assert all six outcomes."""
import os, json, subprocess, hashlib
from pathlib import Path
root=Path.cwd(); project=root/'native/dbt/failure-project'
base=root/'fixtures/dbt/failure';base.mkdir(parents=True,exist_ok=True)
target=root/'.cache/dbt-failure-target'
args=[str(root/'.cache/dbt-venv/bin/dbt'),'build','--project-dir',str(project),'--profiles-dir',str(project),'--target-path',str(target),'--log-path',str(root/'.cache/dbt-failure-logs')]
r=subprocess.run(args,env={**os.environ,'DBT_SEND_ANONYMOUS_USAGE_STATS':'false','DBT_USE_COLORS':'false'},capture_output=True,text=True)
(base/'command.log').write_text(r.stdout+r.stderr)
assert r.returncode==1, (r.returncode,r.stdout,r.stderr)
for native,name in [('run_results.json','run-results.json'),('manifest.json','manifest.json')]:
 (base/name).write_bytes((target/native).read_bytes())
results=json.loads((base/'run-results.json').read_text())['results']
statuses={x['unique_id']:x['status'] for x in results}
expected={
 'model.umf_failure.healthy':'success', 'model.umf_failure.broken':'error',
 'model.umf_failure.after_broken':'skipped', 'model.umf_failure.gated_parent':'success',
 'model.umf_failure.after_gate':'skipped', 'test.umf_failure.assert_failure':'fail',
 'test.umf_failure.assert_warning':'warn', 'test.umf_failure.assert_pass':'pass',
}
assert statuses==expected,statuses
records=[]
for p in [*sorted(project.rglob('*')),base/'run-results.json',base/'manifest.json',base/'command.log',root/'native/dbt/oracle-requirements.txt']:
 if p.is_file():records.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(base/'provenance.json').write_text(json.dumps({'command':args,'exitCode':r.returncode,'statuses':statuses,'scope':'Authored isolated in-memory DuckDB build; failures are expected native outcomes; no remote warehouse','files':records},indent=2)+'\n')
print(json.dumps({'exitCode':r.returncode,'statuses':statuses},indent=2))
