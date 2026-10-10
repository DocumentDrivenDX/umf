"""Inventory the selected managed pg JS dependency closure; execute no package code."""
import json
from pathlib import Path
ROOT=Path('/private/tmp/ashlar-truss-runtime/node_modules').resolve()
ENTRY=ROOT/'.bun/pg@8.16.3+635858982ab829dd/node_modules/pg'
def inventory():
 pending=[ENTRY.resolve()];packages={};files=set()
 while pending:
  directory=pending.pop()
  if str(directory) in packages:continue
  if ROOT not in directory.parents:raise RuntimeError('Dependency outside selected managed runtime')
  manifest=json.loads((directory/'package.json').read_text())
  packages[str(directory)]={'name':manifest['name'],'version':manifest['version']}
  files.add(str(directory/'package.json'))
  for path in directory.rglob('*'):
   if path.is_file() and path.suffix in ['.js','.mjs','.cjs','.json'] and 'node_modules' not in path.relative_to(directory).parts:
    actual=path.resolve()
    if ROOT not in actual.parents:raise RuntimeError('Package source escapes managed runtime')
    files.add(str(actual))
  for name in {**manifest.get('dependencies',{}),**manifest.get('optionalDependencies',{})}:
   candidates=[directory/'node_modules'/name,directory.parent/name,*[a/'node_modules'/name for a in directory.parents]]
   selected=next((p.resolve() for p in candidates if (p/'package.json').is_file()),None)
   if selected:pending.append(selected)
   elif name in manifest.get('dependencies',{}):raise RuntimeError('Missing required managed dependency '+name)
 return {'packages':dict(sorted(packages.items())),'files':sorted(files),'entry':str(ENTRY.resolve()/'lib/index.js')}
