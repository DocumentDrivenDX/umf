"""Check actual generated packages against the exact installed runtime, no source override."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
root = Path(sys.argv[1]).resolve()
# Preserve venv executable spelling: resolving its symlink selects base Python.
installed_python = Path(sys.argv[2]).absolute()
report = Path(sys.argv[3]).resolve()
work = Path(tempfile.mkdtemp(prefix='umf-generated-static-', dir='/private/tmp'))
guard = subprocess.run([str(installed_python),'-I','-c','import sys,importlib.metadata as m; assert sys.prefix != sys.base_prefix; assert sys.version.split()[0] == "3.14.8"; assert m.version("pydantic") == "2.14.1"; assert m.version("umf_access") == "0.1.0.dev0"'],capture_output=True,text=True)
if guard.returncode: raise RuntimeError('Pinned installed interpreter admission refused: '+guard.stderr)
results = []
for case in ['engine','containers','actions','relationships','projections','named','cross-module']:
    package = root / case / 'shop'
    sources = sorted(str(p) for p in package.glob('*.py'))
    env = {k: v for k, v in os.environ.items() if k not in ('PYTHONPATH','PYTHONHOME','MYPYPATH')}
    env['MYPYPATH'] = str(root / case)
    config = work / (case + '.json')
    config.write_text(json.dumps({'pythonVersion':'3.12','typeCheckingMode':'strict',
                                 'extraPaths':[str(root / case)],'reportUnusedImport':False}))
    commands = {
        'mypy':[sys.executable,'-I','-m','mypy','--python-executable',str(installed_python),
                '--python-version','3.12','--check-untyped-defs','--cache-dir',str(work/'cache'),*sources],
        'pyright':[sys.executable,'-I','-m','pyright','--pythonpath',str(installed_python),
                   '--project',str(config),*sources],
    }
    for checker, command in commands.items():
        run = subprocess.run(command,cwd=work,env=env,text=True,capture_output=True)
        results.append({'case':case,'checker':checker,'command':command,'exitCode':run.returncode,
                        'stdout':run.stdout,'stderr':run.stderr})
        print(case,checker,run.returncode,flush=True)
report.write_text(json.dumps({'scope':__doc__,'installedPython':str(installed_python),
                              'status':'pass' if all(r['exitCode']==0 for r in results) else 'fail',
                              'commands':results},indent=2)+'\n')
raise SystemExit(0 if all(r['exitCode']==0 for r in results) else 1)
