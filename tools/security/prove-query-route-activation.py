"""Finite relation proof over retained actual Bun/Chromium observations, not general refinement."""
import sys,pathlib,json,hashlib
import z3
root=pathlib.Path(__file__).resolve().parents[2]; receipt=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve()
if out.exists():raise RuntimeError('Fresh proof output required')
data=json.loads(receipt.read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
assert data['status']=='passed' and data['sourcesUnchanged'] and data['controls']==481
for p,h in data['selectedSourceDigests'].items():assert sha((root/p).read_bytes())==h,p
rows={r['id']:r for r in data['observations']};assert all(r['passed'] and r['expected']==r['observed'] for r in rows.values())
f=[z3.Bool('context_'+str(i)) for i in range(6)];a=z3.Or(f[0],f[1]);b=f[2];w=f[4];permit=z3.Or(*f)
def condition(mask):return z3.And(*[v if mask&(1<<i) else z3.Not(v) for i,v in enumerate(f)])
def table(label):return z3.Or(*[condition(m) for m in range(64) if rows['state-'+str(m)+':actual-branch']['observed']==[label]])
for m in range(64):
 assert rows['state-'+str(m)+':truth']['observed']==['T' if m&(1<<i) else 'F' for i in range(6)]+['T']
 assert rows['state-'+str(m)+':read-decision']['observed']==('permit' if m else 'deny')
expected={'withheld':w,'mask-A':z3.And(a,z3.Not(b),z3.Not(w)),'mask-B':z3.And(b,z3.Not(a),z3.Not(w)),'original':z3.And(f[3],z3.Not(a),z3.Not(b),z3.Not(w)),'missing':z3.And(f[5],z3.Not(f[3]),z3.Not(a),z3.Not(b),z3.Not(w))}
queries=[]
for label,e in expected.items():queries.append(('actual-'+label+'-equals-independent-fold',table(label)!=e,'unsat'))
selected=z3.Or(*[table(k) for k in expected]);queries.extend([
 ('coverage-excludes-only-denial-and-conflict',selected!=z3.And(permit,z3.Not(z3.And(a,b,z3.Not(w)))),'unsat'),
 ('no-double-selected-actual-branch',z3.Or(*[z3.And(table(x),table(y)) for i,x in enumerate(expected) for y in list(expected)[i+1:]]),'unsat'),
 ('selected-implies-actual-row-permit',z3.And(selected,z3.Not(permit)),'unsat'),
 ('drop-withholding-exclusion',z3.And(a,z3.Not(b))!=table('mask-A'),'sat'),
 ('drop-other-transform-exclusion',z3.And(a,z3.Not(w))!=table('mask-A'),'sat'),
 ('drop-equivalent-recipe-contributor',z3.And(f[0],z3.Not(b),z3.Not(w))!=table('mask-A'),'sat'),
 ('row-permit-is-not-disclosed-value',z3.And(permit,z3.Not(z3.Or(table('mask-A'),table('mask-B'),table('original')))),'sat')])
out.mkdir(parents=True);results=[]
for name,expr,want in queries:
 s=z3.Solver();s.set(timeout=10000);s.add(expr);observed=str(s.check());assert observed==want,(name,observed);raw=s.to_smt2();(out/(name+'.smt2')).write_text(raw)
 context=z3.Context();fresh=z3.Solver(ctx=context);fresh.from_string(raw);assert str(fresh.check())==want
 results.append({'id':name,'expected':want,'observed':observed,'freshContextReplay':str(fresh.check()),'formulaSha256':sha(raw.encode()),'model':str(s.model()) if observed=='sat' else None})
result={'status':'passed','solverVersion':z3.get_version_string(),'inputSha256':sha(receipt.read_bytes()),'selectedSourceDigests':data['selectedSourceDigests'],'proofSourceSha256':sha(pathlib.Path(__file__).read_bytes()),'checks':results,'scope':'Exact64-state actual observation relation versus independently encoded finite read/disclosure fold. No arbitrary expression, TypeScript general refinement, scalar availability, compiler designation, native SQL/current authority or separate original-action permission proof.'};(out/'receipt.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'queries':len(results),'unsat':sum(x['observed']=='unsat' for x in results),'sat':sum(x['observed']=='sat' for x in results)}))
