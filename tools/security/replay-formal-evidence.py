"""Replay saved Z3 formulas; no model/implementation refinement claim."""
import hashlib,json
from pathlib import Path
import z3
self_path=Path('tools/security/replay-formal-evidence.py')
if Path(__file__).resolve()!=self_path.resolve():raise RuntimeError('Unknown formal replay source')
root=Path('docs/helix/04-build/evidence/security')
target=root/'formal-replay-audit.json'
paths=sorted(p for p in root.glob('*formal*.json') if p!=target)
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [self_path,*paths]}
observations=[]
def walk(value,path,location):
 if isinstance(value,dict):
  for query_key,result_key in [('smt','result'),('counterexampleQuery','result'),('populationQuery','populationResult'),('weakenedControlQuery','weakenedControlResult'),('safetyQuery','safety'),('populationQuery','population'),('weakenedQuery','weakened')]:
   if isinstance(value.get(query_key),str) and value.get(result_key) in ['sat','unsat']:
    isolated=z3.Context();solver=z3.Solver(ctx=isolated);solver.set(timeout=20000)
    try:solver.from_string(value[query_key]);observed=str(solver.check())
    except z3.Z3Exception as error:observed='parse-error: '+str(error)
    observations.append({'id':str(path)+location+'/'+query_key,'expected':value[result_key],'observed':observed})
  for key,item in value.items():walk(item,path,location+'/'+key)
 elif isinstance(value,list):
  for key,item in enumerate(value):walk(item,path,location+'/'+str(key))
counts={}
for path in paths:
 before=len(observations);walk(json.loads(path.read_text()),path,'');counts[str(path)]=len(observations)-before
unchanged=all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==digest for p,digest in sources.items())
passed=unchanged and bool(observations) and len({o['id'] for o in observations})==len(observations) and all(o['expected']==o['observed'] for o in observations)
receipt={'status':'passed' if passed else 'failed','solverVersion':z3.get_version_string(),'sourceDigests':sources,'sourcesUnchanged':unchanged,'observations':observations,'formulaCounts':counts,'receiptsWithoutSelectedFormulaLeaves':[path for path,count in counts.items() if count==0],'scope':'Fresh Z3 parser/solver replay of every saved formula in explicitly recognized query/result field pairs in the selected retained *formal*.json receipts. Does not audit other receipt query formats or formulas absent from these receipts, prove generator-to-formula correspondence, validate assumptions or establish native/compiler/runtime refinement. Legacy saved formulas may contain Z3 model-converter annotations ignored with parser diagnostics; equality here concerns the parsed assertions and recorded SAT/UNSAT result, not strict SMT-LIB conformance.'}
target.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'formulas':len(observations),'receipts':len(paths)}))
raise SystemExit(0 if passed else 1)
