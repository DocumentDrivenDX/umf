"""Capture a local catalog; this profile is isolated from both existing dbt fixtures."""
import os,json,subprocess,hashlib,uuid
from pathlib import Path
root=Path.cwd();base=root/'fixtures/dbt/artifacts';base.mkdir(parents=True,exist_ok=True);target=root/'.cache/dbt-artifact-target';profiles=root/'.cache/dbt-artifact-profile';profiles.mkdir(exist_ok=True)
database=root/('.cache/dbt-artifact-'+str(uuid.uuid4())+'.duckdb')
(profiles/'profiles.yml').write_text('umf_fixture:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: '+json.dumps(str(database))+'\n      threads: 1\n')
common=['--project-dir',str(root/'native/dbt/project'),'--profiles-dir',str(profiles),'--target-path',str(target),'--log-path',str(root/'.cache/dbt-artifact-logs')]
env={**os.environ,'DBT_SEND_ANONYMOUS_USAGE_STATS':'false','DBT_USE_COLORS':'false'};commands=[]
for command in [['build'],['docs','generate']]:
 args=[str(root/'.cache/dbt-venv/bin/dbt'),*command,*common];subprocess.run(args,check=True,env=env);commands.append(args)
 if command==['build']:(base/'run-results.json').write_bytes((target/'run_results.json').read_bytes())
(base/'catalog.json').write_bytes((target/'catalog.json').read_bytes())
(base/'catalog-manifest.json').write_bytes((target/'manifest.json').read_bytes())
records=[]
for path in [*sorted((root/'native/dbt/project').rglob('*')),base/'run-results.json',base/'catalog.json',base/'catalog-manifest.json',root/'native/dbt/oracle-requirements.txt']:
 if path.is_file():records.append({'path':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(base/'provenance.json').write_text(json.dumps({'commands':commands,'database':str(database),'scope':'Fresh generated local DuckDB database; no remote warehouse; original fixtures unchanged','files':records},indent=2)+'\n')
