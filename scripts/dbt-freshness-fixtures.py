"""Retain both emitted freshness JSON and native runner outcomes, including omitted errors."""
import os,json,hashlib,io,contextlib
from pathlib import Path
os.environ['DBT_SEND_ANONYMOUS_USAGE_STATS']='false';os.environ['DBT_USE_COLORS']='false'
from dbt.cli.main import dbtRunner
from dbt.artifacts.schemas.freshness.v3.freshness import FreshnessExecutionResultArtifact,process_freshness_result
root=Path.cwd();project=root/'native/dbt/freshness-project';target=root/'.cache/dbt-freshness-target';base=root/'fixtures/dbt/freshness';base.mkdir(parents=True,exist_ok=True)
args=['source','freshness','--project-dir',str(project),'--profiles-dir',str(project),'--target-path',str(target),'--log-path',str(root/'.cache/dbt-freshness-logs')]
log=io.StringIO()
with contextlib.redirect_stdout(log),contextlib.redirect_stderr(log):r=dbtRunner().invoke(args)
assert not r.success and r.exception is None
statuses={n.node.unique_id.split('.')[-1]:str(n.status) for n in r.result.results};assert statuses=={'recent':'pass','stale':'warn','expired':'error','broken':'runtime error'}
source=json.loads((target/'sources.json').read_text());emitted={n['unique_id'].split('.')[-1]:n['status'] for n in source['results']};assert emitted=={'recent':'pass','stale':'warn','expired':'error'}
(base/'sources.json').write_bytes((target/'sources.json').read_bytes());(base/'manifest.json').write_bytes((target/'manifest.json').read_bytes());(base/'command.log').write_text(log.getvalue())
full=FreshnessExecutionResultArtifact(metadata=r.result.metadata,results=[process_freshness_result(n) for n in r.result.results],elapsed_time=r.result.elapsed_time)
(base/'runner-results.json').write_text(json.dumps(full.to_dict(),indent=2)+'\n')
files=[*sorted(project.rglob('*')),base/'sources.json',base/'runner-results.json',base/'manifest.json',base/'command.log',root/'native/dbt/oracle-requirements.txt']
(base/'provenance.json').write_text(json.dumps({'arguments':args,'runnerSuccess':False,'runnerStatuses':statuses,'emittedStatuses':emitted,'omittedByNativeEmitter':['source.umf_freshness.synthetic.broken'],'runnerArtifactOrigin':'Native process_freshness_result applied to all in-memory results; not the emitted sources.json','scope':'Synthetic custom SQL in local in-memory DuckDB; no physical source-table freshness claim','files':[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files if p.is_file()]},indent=2)+'\n');print({'runner':statuses,'emitted':emitted})
