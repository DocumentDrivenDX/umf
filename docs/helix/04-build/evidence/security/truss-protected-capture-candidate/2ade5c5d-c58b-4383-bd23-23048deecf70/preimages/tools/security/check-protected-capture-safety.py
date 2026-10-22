"""Replay the exact producer failure boundary with synthetic secret-bearing faults."""
import ast,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=(root/'tools/security/truss-protected-capture-candidate.py').read_bytes()
tree=ast.parse(source)
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='bounded_failure')
original=ast.unparse(function)
results=[]
with tempfile.TemporaryDirectory(prefix='capture-safety-') as directory:
 for mode in ('writable','unwritable'):
  sink=Path(directory)/mode
  if mode=='writable':sink.mkdir()
  else:sink.write_text('not a directory')
  child='from pathlib import Path\nimport json,sys\n'+original+'''\nsecret='synthetic-private-capability-sentinel'
try:
 raise ValueError(secret)
except BaseException:
 bounded_failure(Path(sys.argv[1]),{'error':'ValueError'})
'''
  result=subprocess.run([sys.executable,'-',str(sink)],input=child,text=True,capture_output=True)
  assert result.returncode!=0
  assert 'synthetic-private-capability-sentinel' not in result.stdout+result.stderr
  assert 'Protected fixture failed; inspect bounded failure receipt' in result.stderr
  assert 'During handling of the above exception' not in result.stderr
  if mode=='writable':assert json.loads((sink/'failed.json').read_text())=={'error':'ValueError'}
  results.append({'mode':mode,'exit':result.returncode,'secretAbsent':True,'chainSuppressed':True})
assert (root/'tools/security/truss-protected-capture-candidate.py').read_bytes()==source
directory=root/'docs/helix/04-build/evidence/security/truss-protected-capture-candidate/failure-boundary-controls'
directory.mkdir(exist_ok=True)
out=directory/(hashlib.sha256(source).hexdigest()+'.json')
out.write_text(json.dumps({'producerSha256':hashlib.sha256(source).hexdigest(),'controlSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'observations':results},indent=2)+'\n')
print('Two original failure-boundary controls pass')
