"""Conditional information-loss law for the fixed native post-elevation tuple."""
import hashlib,json,sys,uuid
from pathlib import Path
import z3
ROOT=Path(__file__).resolve().parents[2];SELF='tools/security/prove-capture-observability.py'
BASE='docs/helix/04-build/evidence/security/truss-capture-observability/533c90f6-3dbe-4d7d-ae83-484617149b4a/'
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
native_bytes=(ROOT/BASE/'native.json').read_bytes();native=json.loads(native_bytes)
paths=[SELF,BASE+'native.json',BASE+'start.json',*native['sourceSha256']]
frozen={p:(ROOT/p).read_bytes() for p in paths};assert frozen[BASE+'native.json']==native_bytes
out=ROOT/'docs/helix/04-build/evidence/security/truss-capture-observability-formal'/str(uuid.uuid4());out.mkdir(parents=True);sha=lambda b:hashlib.sha256(b).hexdigest();pins={p:sha(b) for p,b in frozen.items()}
for p,b in frozen.items():
 t=out/'preimages'/p;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins,'argv':sys.argv},indent=2)+'\n')
for p,h in native['sourceSha256'].items():assert pins[p]==h;assert (ROOT/BASE/'preimages'/p).read_bytes()==frozen[p]
assert native['status']=='pass' and len(native['observations'])==10 and all(v['expected']==v['observed'] for v in native['observations'])
direct=native['direct'][0];nested=native['nested'][0];assert len(direct)==len(nested)==10 and direct[0]!=nested[0] and direct[1:]==nested[1:]
# Arbitrary deterministic classifiers over these nine fields, not a proposed engine.
S=z3.StringSort();B=z3.BoolSort();decide=z3.Function('decide_post_tuple',*([S]*9),B)
x=[z3.String('direct_'+str(i)) for i in range(9)];y=[z3.String('nested_'+str(i)) for i in range(9)]
equal=[a==b for a,b in zip(x,y)];ground=[a==z3.StringVal(v) for a,v in zip(x,direct[1:])]+[b==z3.StringVal(v) for b,v in zip(y,nested[1:])]
state_d,state_n=z3.Strings('direct_equal_extra_state nested_equal_extra_state');with_state=z3.Function('decide_post_tuple_and_state',*([S]*10),B)
actor_d,actor_n=z3.Strings('direct_original_actor nested_original_actor');with_actor=z3.Function('decide_with_trusted_original_actor',*([S]*10),B)
queries=[('observed-tuple-cannot-separate-paths','unsat',[*ground,decide(*x),z3.Not(decide(*y))]),('equal-extra-state-cannot-recover-actor','unsat',[*equal,state_d==state_n,with_state(*x,state_d),z3.Not(with_state(*y,state_n))]),('distinct-trusted-pre-entry-actor-can-separate','sat',[*ground,actor_d==direct[0],actor_n==nested[0],with_actor(*x,actor_d),z3.Not(with_actor(*y,actor_n))])]
records=[]
for name,expected,assertions in queries:
 solver=z3.Solver();solver.add(*assertions);smt=solver.to_smt2().encode();(out/(name+'.smt2')).write_bytes(smt);actual=str(solver.check());assert actual==expected
 independent=z3.Solver();independent.from_string(smt.decode());assert str(independent.check())==expected
 records.append({'id':name,'expected':expected,'observed':actual,'smtSha256':sha(smt),'model':str(solver.model()) if actual=='sat' else None})
assert all((ROOT/p).read_bytes()==b for p,b in frozen.items())
for q in records:assert sha((out/(q['id']+'.smt2')).read_bytes())==q['smtSha256']
receipt={'status':'pass','sourceSha256':pins,'z3Version':z3.get_version_string(),'queries':records,'nativeFields':native['columns'][1:],'scope':'Arbitrary deterministic decisions over exactly nine equal observed post-elevation fields, with optional equal extra state','limitations':['No impossibility theorem for all PostgreSQL or all protocols','Different history/nonce/state, trusted pre-entry capture, host original call custody and native call-stack/frame evidence are outside the equal-input premise','SAT extra-actor population is not authentication or an implemented capture protocol','No MAC/signature primitive, private writer, owner authority or temporal/refinement proof'],'PA02Complete':False,'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'run':out.name,'queries':len(records),'status':'pass'}))
