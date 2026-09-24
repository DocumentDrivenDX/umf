"""Capture dbt's native semantic manifest without executing MetricFlow queries."""
import os,json,subprocess,hashlib,sys
from pathlib import Path
rich='--metrics' in sys.argv
root=Path.cwd();base=root/('fixtures/dbt/semantic-metrics' if rich else 'fixtures/dbt/semantic');base.mkdir(parents=True,exist_ok=True)
project=root/('native/dbt/metrics-project' if rich else 'native/dbt/rich-project');target=root/('.cache/dbt-semantic-metrics-target' if rich else '.cache/dbt-semantic-target')
args=[str(root/'.cache/dbt-venv/bin/dbt'),'parse','--no-partial-parse','--project-dir',str(project),'--profiles-dir',str(project),'--target-path',str(target),'--log-path',str(root/('.cache/dbt-semantic-metrics-logs' if rich else '.cache/dbt-semantic-logs'))]
r=subprocess.run(args,env={**os.environ,'DBT_SEND_ANONYMOUS_USAGE_STATS':'false','DBT_USE_COLORS':'false'},capture_output=True,text=True)
(base/'command.log').write_text(r.stdout+r.stderr);assert r.returncode==0,(r.stdout,r.stderr)
for native,name in [('semantic_manifest.json','semantic-manifest.json'),('manifest.json','manifest.json')]:
 (base/name).write_bytes((target/native).read_bytes())
files=[*sorted(project.rglob('*')),base/'semantic-manifest.json',base/'manifest.json',base/'command.log',root/'native/dbt/oracle-requirements.txt']
(base/'provenance.json').write_text(json.dumps({'command':args,'exitCode':r.returncode,'scope':'Native dbt parse of synthetic project; no SQL or MetricFlow execution','files':[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files if p.is_file()]},indent=2)+'\n')
