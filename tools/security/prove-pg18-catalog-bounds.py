"""Conditional output-bound laws, not a TS/SQL implementation refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
x,low,high,o,w=z3.Ints('x input_low input_high origin positive_width')
bucket=lambda v:o+((v-o)/w)*w
n,p,s,r,k,removed=z3.Ints('input_scalars prefix suffix replacement_scalars match_count removed_scalars')
minimum=lambda a,b:z3.If(a<b,a,b)
maximum=lambda a,b:z3.If(a>b,a,b)
a=minimum(p,n);b=minimum(s,maximum(0,n-p));partial=a+maximum(0,n-a-b)+b
queries=[
 ('positive-width-bucket-monotone-lower',z3.And(w>0,low<=x,bucket(x)<bucket(low)),'unsat'),
 ('positive-width-bucket-monotone-upper',z3.And(w>0,x<=high,bucket(x)>bucket(high)),'unsat'),
 ('endpoint-proof-covers-whole-input',z3.And(w>0,low<=x,x<=high,bucket(low)>=-100,bucket(high)<=100,z3.Or(bucket(x)<-100,bucket(x)>100)),'unsat'),
 ('partial-preserves-scalar-length',z3.And(n>=0,p>=0,s>=0,partial!=n),'unsat'),
 ('prefix-length-bound',z3.And(n>=0,p>=0,z3.Or(minimum(n,p)<0,minimum(n,p)>n,minimum(n,p)>p)),'unsat'),
 ('nonempty-regex-conservative-expansion',z3.And(n>=0,r>=0,k>=0,k<=n,removed>=0,removed<=n,n-removed+k*r>n*(r+1)),'unsat'),
 ('bounded-JSON-literal-escaping',z3.And(n>=0,n<=512,13+6*n>4096),'unsat'),
 ('zero-width-regex-breaks-expansion-premise',z3.And(n>=0,r>0,k==n+1,removed==0,n-removed+k*r>n*(r+1)),'sat'),
 ('checking-only-samples-misses-output-bound',z3.And(w>0,low<=0,high>=0,bucket(0)>=-100,bucket(0)<=100,z3.Or(bucket(low)<-100,bucket(high)>100)),'sat'),
]
rows=[]
for name,formula,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);result=str(solver.check());assert result==expected,(name,result)
 smt=solver.to_smt2();replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(smt);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(smt);rows.append(dict(id=name,expected=expected,observed=result,model=str(solver.model()) if result=='sat' else None,smt2Sha256=hashlib.sha256(smt.encode()).hexdigest()))
(out/'receipt.json').write_text(json.dumps(dict(status='conditional-bounds-passed',solver=z3.get_version_string(),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),queries=rows,scope='Exact coefficient floor bucket, nonempty regex match bound, Unicode scalar length and canonical JSON escaping bounds. Assumes compiler faithfully derives native domains and primitive recipes; no executable refinement, permission, custody or side-channel theorem.'),indent=2)+'\n');print(json.dumps(dict(status='conditional-bounds-passed',queries=len(rows))))
