"""Conditional unbounded scan composition. No TS/compiler/native refinement."""
import hashlib,json,pathlib,sys
import z3
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
n,i,k=z3.Ints('scan_count visited_prefix index');cost=z3.Function('cost',z3.IntSort(),z3.IntSort());ok=z3.Function('scan_ok',z3.IntSort(),z3.BoolSort());prefix=z3.Function('prefix_cost',z3.IntSort(),z3.IntSort());seen=z3.Array('local_scans',z3.IntSort(),z3.BoolSort());bad=z3.Bool('bad');limit=z3.Int('limit');preflight,native=z3.Bools('source_preflight native_authenticated')
base=[n>0,limit>0,prefix(0)==0,z3.ForAll(k,z3.Implies(z3.And(k>=0,k<n),z3.And(cost(k)>=0,prefix(k+1)==prefix(k)+cost(k))))]
def inv(j,failed,local):return z3.And(j>=0,j<=n,failed==z3.Exists(k,z3.And(k>=0,k<j,z3.Not(ok(k)))),z3.ForAll(k,z3.Implies(z3.And(k>=0,k<n),z3.Select(local,k)==(k<j))))
before=inv(i,bad,seen);after=inv(i+1,z3.Or(bad,z3.Not(ok(i))),z3.Store(seen,i,True));release=z3.And(preflight,i==n,z3.Not(bad),prefix(i)<=limit)
queries=[
 ('initial-local-prefix',[i==0,z3.Not(bad),seen==z3.K(z3.IntSort(),False),z3.Not(before)],'unsat'),
 ('step-retains-every-occurrence',[before,i<n,z3.Not(after)],'unsat'),
 ('late-failure-forbids-whole-release',[before,release,z3.Exists(k,z3.And(k>=0,k<n,z3.Not(ok(k))))],'unsat'),
 ('release-contains-every-source-position',[before,release,k>=0,k<n,z3.Not(z3.Select(seen,k))],'unsat'),
 ('over-budget-prefix-cannot-release',[before,release,prefix(i)>limit],'unsat'),
 ('two-occurrences-positive',[before,n==2,i==2,ok(0),ok(1),cost(0)==1,cost(1)==1,limit==3,release],'sat'),
 ('reset-budgets-hide-cumulative-exhaustion',[before,n==2,i==2,ok(0),ok(1),cost(0)==6,cost(1)==6,limit==10,cost(0)<=limit,cost(1)<=limit,z3.Not(release),preflight],'sat'),
 ('prefix-release-hides-late-failure',[before,n==2,i==1,ok(0),z3.Not(ok(1)),cost(0)==1,cost(1)==1,limit==3,preflight,z3.Not(bad),z3.Not(release)],'sat'),
 ('empty-source-preflight-cannot-release',[before,z3.Not(preflight),release],'unsat'),
 ('logical-batch-is-not-native-authority',[before,n==1,i==1,ok(0),cost(0)==1,limit==3,release,z3.Not(native)],'sat'),
]
rows=[]
for name,clauses,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*base,*clauses);smt=solver.to_smt2();actual=str(solver.check());assert actual==expected,(name,actual)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(smt);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(smt);rows.append({'id':name,'expected':expected,'observed':actual,'freshContextReplay':expected,'formulaSha256':hashlib.sha256(smt.encode()).hexdigest(),'model':str(solver.model()) if actual=='sat' else None})
paths=[pathlib.Path(__file__),pathlib.Path('src/extensions/security/catalog-runtime-candidate.ts'),pathlib.Path('tests/security/catalog-scan-batch-corpus.ts')]
(out/'receipt.json').write_text(json.dumps({'status':'conditional-atomic-scan-batch-passed','solverVersion':z3.get_version_string(),'checks':rows,'selectedSourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'acceptanceCasesPromoted':[],'scope':'Unbounded abstract prefix composition with faithful supplied scan outcomes/costs, complete exact enumeration and unique occurrence labels as premises. Array indices retain occurrence order. Proves atomic release and conditional budget accumulation; does not establish TS traversal, actual work/text/literal cost correspondence, compiler readset completeness, native authentication, property/mode admission, SQL execution or publication authority.'},indent=2)+'\n')
print(json.dumps({'status':'conditional-atomic-scan-batch-passed','queries':len(rows),'unsat':sum(x['observed']=='unsat' for x in rows),'sat':sum(x['observed']=='sat' for x in rows)}))
