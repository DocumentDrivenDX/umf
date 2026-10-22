"""Conditional two-enrollment vault model, allowing arbitrary hash collisions.
Not executable SQL/HMAC refinement, custody, authorization or propagation proof.
"""
import hashlib,json,sys
from pathlib import Path
from z3 import Array,BoolSort,Function,Int,IntSort,Not,Or,Select,Solver,Store,parse_smt2_string,sat,unsat
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
p0,p1=Int('plain0'),Int('plain1');digest=Function('fixed_key_digest',IntSort(),IntSort());t0,t1=digest(p0),digest(p1)
v0=Array('initial_vault',IntSort(),IntSort());present0=Array('initial_presence',IntSort(),BoolSort())
permit0=Or(Not(Select(present0,t0)),Select(v0,t0)==p0)
v1=Store(v0,t0,p0);present1=Store(present0,t0,True)
permit1=Or(Not(Select(present1,t1)),Select(v1,t1)==p1)
v2=Store(v1,t1,p1)
q=Int('arbitrary_existing_token')
queries=[('enrollment-preserves-every-existing-mapping',[Select(present0,q),permit0,Select(v1,q)!=Select(v0,q)],'unsat'),('successful-token-equality-requires-plaintext-equality',[permit0,permit1,t0==t1,p0!=p1],'unsat'),('second-success-preserves-first-mapping',[permit0,permit1,Select(v2,t0)!=p0],'unsat'),('omitted-collision-guard-aliases-different-plaintext',[permit0,t0==t1,p0!=p1,Select(v1,t1)!=p1],'sat')]
rows=[]
for name,assertions,expected in queries:
 solver=Solver();solver.add(*assertions);observed=str(solver.check());assert observed==expected
 smt=solver.to_smt2();(out/(name+'.smt2')).write_text(smt);replay=Solver();replay.add(parse_smt2_string(smt));assert str(replay.check())==expected
 rows.append(dict(id=name,expected=expected,observed=observed,smt2Sha256=hashlib.sha256(smt.encode()).hexdigest(),model=str(solver.model()) if observed=='sat' else None))
import z3
receipt=dict(status='conditional-model-passed',solver=z3.get_version_string(),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),queries=rows,premises=['One fixed deterministic digest function; no injectivity or cryptographic-strength axiom.','Exact plaintext/token identity and a partial single-valued vault map.','Enrollment succeeds only when the token is absent or maps to exactly the proposed plaintext.','Success stores that mapping atomically; failed transactions leave no committed effect.','Only the modeled enrollments mutate this state; excluded-owner/key/custody changes are outside the model.'],scope='Two successful enrollments preserve an unambiguous token mapping, including arbitrary modeled digest collisions. No actual HMAC collision is produced. Native SQL, role ACLs, atomicity, lifecycle, algorithms, key/vault custody and propagation are not proved.')
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],queries=len(rows))))
