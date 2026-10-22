"""Conditional closed projection laws and an exhaustive four-node Kahn model."""
import hashlib,json,sys
from pathlib import Path
import z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf');SELF=ROOT/'tools/security/prove-obligation-projection.py'
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md',ROOT/'docs/helix/02-design/spikes/security/admission-obligation-v0.1.schema.json',ROOT/'docs/helix/02-design/spikes/security/admission-obligation-v0.1.md',Path('/Users/erik/Projects/weft/crates/weft-core/src/security_obligation_custody.rs'),Path('/Users/erik/Projects/weft/crates/weft-core/src/security_lowering.rs'),Path('/Users/erik/Projects/weft/docs/helix/02-design/contracts/CONTRACT-005-security-compilation.md')]
frozen={str(p):p.read_bytes() for p in paths}
# Each edge i->j means i is a prerequisite of j. Four symbolic vertices,
# all sixteen edges unconstrained (self edges and disconnected cycles included).
n=4;edge=[[z3.Bool(f'edge_{i}_{j}') for j in range(n)] for i in range(n)]
removed=[z3.BoolVal(False)]*n
for step in range(n):
 ready=[z3.And(z3.Not(removed[j]),*[z3.Or(z3.Not(edge[i][j]),removed[i]) for i in range(n)]) for j in range(n)]
 chosen=[z3.And(ready[j],*[z3.Not(ready[i]) for i in range(j)]) for j in range(n)]
 removed=[z3.Or(removed[j],chosen[j]) for j in range(n)]
complete=z3.And(*removed)
ranks=[z3.Int(f'rank_{i}') for i in range(n)]
ranked=z3.And(*[z3.And(r>=0,r<n) for r in ranks],*[z3.Implies(edge[i][j],ranks[i]<ranks[j]) for i in range(n) for j in range(n)])
dag=z3.Exists(ranks,ranked)
acyclic=z3.And(*[edge[i][j]==(i<j) for i in range(n) for j in range(n)])
cycle=z3.And(edge[2][3],edge[3][2],*[z3.Not(edge[i][j]) for i in range(n) for j in range(n) if (i,j) not in [(2,3),(3,2)]])
version,closed,original,projected=z3.Bools('known_version closed_parameters original_inventory_preserved projected')
projection=projected==z3.And(version,closed,original)
source,evidence,native,admitted=z3.Bools('actual_source_coverage required_evidence_coverage native_verified admitted')
admission=admitted==z3.And(projected,source,evidence,native)
checks=[
 ('four-node-kahn-completion-implies-dag',z3.And(complete,z3.Not(dag)),z3.And(cycle,removed[0],z3.Not(complete)),z3.And(acyclic,complete,dag)),
 ('four-node-dag-implies-kahn-completion',z3.And(dag,z3.Not(complete)),z3.And(cycle,z3.Not(complete)),z3.And(acyclic,complete,dag)),
 ('unknown-parameter-meaning-cannot-project',z3.And(projection,z3.Not(version),projected),z3.And(closed,original,z3.Not(version),projected),z3.And(projection,version,closed,original,projected)),
 ('projection-does-not-discharge-native-obligations',z3.And(admission,projected,z3.Not(native),admitted),z3.And(projected,source,evidence,z3.Not(native),admitted),z3.And(admission,projected,source,evidence,z3.Not(native),z3.Not(admitted))),
]
cases=[]
for name,bad,weak,positive in checks:
 case={'id':name,'covers':['US-056-AC7','US-056-AC10']}
 for key,formula,expected in [('violation',bad,'unsat'),('negativeControl',weak,'sat'),('positivePopulation',positive,'sat')]:
  solver=z3.Solver();solver.set(timeout=30000);solver.add(formula);smt=solver.sexpr();observed=str(solver.check())
  ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=30000);replay.from_string(smt);actual=str(replay.check())
  if observed!=expected or actual!=expected:raise RuntimeError(name+'/'+key+': '+observed+'/'+actual)
  case[key]={'smt':smt,'result':observed,'replayResult':actual,'witness':str(solver.model()) if expected=='sat' else None}
 cases.append(case)
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Sources changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'sourcesUnchanged':True,'cases':cases,'nativeImplementationQualified':False,'acceptanceCasesPromoted':[],'scope':'Four conditional laws. Kahn traversal equivalence to rank-defined DAG is exhaustive over directed graphs with exactly four symbolic vertices, all sixteen edges including self edges and disconnected cycles; it is not an arbitrary-size theorem or Rust refinement. The first cyclic control disproves some-progress-implies-DAG, not a mutated Kahn algorithm. Version/native omission controls hold all other modeled guards true. Closed-version and native-admission predicates are modeled premises, not validation of actual source/evidence identities or native enforcement. No backend case promoted.'}
(ROOT/'docs/helix/04-build/evidence/security/obligation-projection-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'laws':len(cases),'formulas':3*len(cases)}))
