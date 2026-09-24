"""Build only the local synthetic project, then capture native artifacts and provenance."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
from importlib import metadata
root=Path.cwd();rich='--rich' in sys.argv;base=root/('fixtures/dbt/rich' if rich else 'fixtures/dbt');target=root/('.cache/dbt-rich-target' if rich else '.cache/dbt-target');project=root/('native/dbt/rich-project' if rich else 'native/dbt/project');base.mkdir(parents=True,exist_ok=True)
command=[str(root/'.cache/dbt-venv/bin/dbt'),'build','--project-dir',str(project),'--profiles-dir',str(project),'--target-path',str(target),'--log-path',str(root/('.cache/dbt-rich-logs' if rich else '.cache/dbt-logs'))]
if '--capture-only' not in sys.argv:subprocess.run(command,check=True,env={**os.environ,'DBT_SEND_ANONYMOUS_USAGE_STATS':'false','DBT_USE_COLORS':'false'})
runs=json.loads((target/'run_results.json').read_text());assert len(runs['results'])==(13 if rich else 6) and all(r['status'] in (['success','pass','no-op'] if rich else ['success','pass']) for r in runs['results'])
if rich:assert sum(r['status']=='no-op' for r in runs['results'])==2
for src,dst in [('manifest.json','manifest.json'),('run_results.json','build-run-results.json')]: (base/dst).write_bytes((target/src).read_bytes())
packages=['dbt-core','dbt-duckdb','dbt-adapters','dbt-common','duckdb','jsonschema'];versions={p:metadata.version(p) for p in packages}
licenses=root/'native/dbt/licenses';licenses.mkdir(exist_ok=True)
for package in packages:
 dist=metadata.distribution(package)
 for file in dist.files or []:
  if file.name.upper() in ['LICENSE','LICENSE.TXT','COPYING'] and '.dist-info/' in str(file):
   (licenses/(package+'-'+file.name)).write_bytes(Path(dist.locate_file(file)).read_bytes());break
files=[*sorted(project.rglob('*')),base/'manifest.json',base/'build-run-results.json',root/'native/dbt/oracle-requirements.txt']
records=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files if p.is_file()]
(base/'provenance.json').write_text(json.dumps({'runtime':versions,'command':command,'files':records,'scope':'Synthetic in-memory DuckDB build, anonymous usage disabled; timestamps/UUIDs are captured rather than normalized'},indent=2)+'\n')
