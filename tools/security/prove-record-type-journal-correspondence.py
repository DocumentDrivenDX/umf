"""Conditional bounded transition reconciliation; not concrete verifier/JSON or issuer proof."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise RuntimeError('Exact root required')
host=ROOT/'docs/helix/04-build/evidence/security/record-type-journal-inspection/52ff1fd0-52f9-490d-b4a7-15f4614c05c9/receipt.json'
r=json.loads(host.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for p in r['sourcePreimages']:
 b=(ROOT/p['path']).read_bytes()
 if sha(b)!=p['sha256'] or b!=(host.parent/p['archive']).read_bytes():raise RuntimeError('Current host source required: '+p['path'])
frozen={str(p):p.read_bytes() for p in [Path(__file__),host,*[ROOT/i['path'] for i in r['sourcePreimages']]]}
n,base,current=z3.Ints('event_count base_complete_model current_complete_model')
sources=z3.Array('event_complete_sources',z3.IntSort(),z3.IntSort());targets=z3.Array('event_complete_targets',z3.IntSort(),z3.IntSort())
verified=z3.Array('event_recomputed_with_owner',z3.IntSort(),z3.BoolSort());is_type=z3.Array('event_is_type',z3.IntSort(),z3.BoolSort());stable=z3.Array('event_exact_type_link_still_valid_in_current',z3.IntSort(),z3.BoolSort())
issuer,enforcement,accepted=z3.Bools('authenticated_issuer native_enforcement protected_admission')
capacity=z3.And(n>=1,n<=32)
continuity=[sources[0]==base]+[z3.Implies(n>i,sources[i]==targets[i-1]) for i in range(1,32)]
owner=[z3.Implies(n>i,verified[i]) for i in range(32)]
retention=[z3.Implies(z3.And(n>i,is_type[i]),stable[i]) for i in range(32)]
final=targets[n-1]==current
# Reachability recurrence uses independently admitted owner transitions and exact complete-model continuity.
reachable=[z3.And(verified[0],sources[0]==base)]
for i in range(1,32):reachable.append(z3.And(reachable[i-1],verified[i],sources[i]==targets[i-1]))
guards=[capacity,*continuity,*owner,*retention,final,z3.Not(issuer),z3.Not(enforcement)]
queries=[('two-type-populated-positive',guards+[n==5,is_type[2],is_type[4],z3.Not(is_type[0]),z3.Not(is_type[1]),z3.Not(is_type[3]),sources[2]!=targets[2],sources[4]!=targets[4]],'sat'),('kind-only-positive',guards+[n==2,z3.Not(is_type[0]),z3.Not(is_type[1])],'sat'),('bounded-chain-reaches-every-active-prefix',guards+[z3.Or(*[z3.And(n>i,z3.Not(reachable[i])) for i in range(32)])],'unsat')]
for i in range(32):
 bad=z3.And(n>i,z3.Not(continuity[i]));queries.append(('gap-'+str(i)+'-refuses',guards+[bad],'unsat'))
 erased=[capacity,*[g for j,g in enumerate(continuity) if j!=i],*owner,*retention,final,z3.Not(issuer),z3.Not(enforcement)]
 queries.append(('erase-gap-'+str(i)+'-permits',erased+[bad],'sat'))
queries += [('unrecomputed-event-refuses',guards+[z3.Not(verified[n-1])],'unsat'),('erase-owner-allows-unrecomputed-event',[capacity,*continuity,*retention,final,z3.Not(issuer),z3.Not(enforcement),z3.Not(verified[n-1])],'sat'),('changed-complete-current-refuses',guards+[current!=targets[n-1]],'unsat'),('erase-final-allows-unrelated-current',[capacity,*continuity,*owner,*retention,z3.Not(issuer),z3.Not(enforcement),current!=targets[n-1]],'sat'),('later-invalid-type-kind-refuses',guards+[n==2,is_type[0],z3.Not(is_type[1]),sources[0]!=targets[0],sources[1]!=targets[1],z3.Not(stable[0])],'unsat'),('erase-retention-allows-later-invalid-type',[capacity,*continuity,*owner,final,z3.Not(issuer),z3.Not(enforcement),n==2,is_type[0],z3.Not(is_type[1]),sources[0]!=targets[0],sources[1]!=targets[1],z3.Not(stable[0])],'sat'),('consistent-journal-does-not-authenticate-issuer',guards,'sat'),('protected-admission-needs-independent-authority',guards+[z3.Implies(accepted,issuer),accepted],'unsat'),('erase-authority-gate-allows-promotion',guards+[accepted],'sat')]
out=ROOT/'docs/helix/04-build/evidence/security/record-type-journal-correspondence'/str(uuid.uuid4());out.mkdir(parents=True);checks=[]
for name,terms,expected in queries:
 s=z3.Solver();s.set(timeout=10000);s.add(*terms);formula=s.to_smt2();(out/(name+'.smt2')).write_text(formula);observed=str(s.check())
 if observed!=expected:raise RuntimeError(name+': '+observed)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.add(z3.parse_smt2_string(formula,ctx=ctx));actual=str(replay.check())
 if actual!=expected:raise RuntimeError(name+': replay '+actual)
 checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':actual,'formulaSha256':sha(formula.encode()),'model':str(s.model()) if observed=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Captured input changed')
with zipfile.ZipFile(out/'sources.zip','w',zipfile.ZIP_DEFLATED) as z:
 for i,(p,b) in enumerate(frozen.items()):z.writestr(str(i)+'/'+Path(p).name,b)
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Each integer model coordinate faithfully represents the entire JSON document; equality preserves ordered arrays and opaque content while object member order is immaterial. Concrete canonicalization and injective representation are not proved','Existing kind/type owner recomputation is an abstract admitted verifier flag; declaration algorithms and schema implementation are not proved','Final retention flag means exact qualified Field kind, original appended occurrence/reference/path and Record identity/path/kind in the complete current model. Concrete pointer resolution is separately tested, not proved here','Bounded1..32 events; reachability is explicitly unrolled32-prefix recurrence, not unbounded induction or arbitrary edit history','Issuer/enforcement separation and protected authority implication are logical obligations; no issuer protocol or native installer is proved','Local Z3 and fresh-context replay, not hermetic'],'scope':'Conditional bounded explicit kind/type transition source continuity, verified prefix reachability, exact complete final model, final type retention and authority separation; not JavaScript/schema/browser/native refinement or durable journal ingress','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
