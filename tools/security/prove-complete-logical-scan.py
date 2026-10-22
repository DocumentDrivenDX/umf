"""Conditional unbounded complete-scan fold, not TypeScript/compiler/native refinement."""
import hashlib,json,pathlib,sys
import z3
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
n,i,k=z3.Ints('population_size visited_prefix row_index');d=z3.Function('row_decision',z3.IntSort(),z3.IntSort());e=z3.Array('emitted',z3.IntSort(),z3.BoolSort());failed=z3.Bool('unresolved_seen');preflight,covered,native=z3.Bools('source_preflight supplied_complete_cut native_authenticated')
# Decision0 deny,1 permit,2 unknown,3 conflict. Source index/Key uniqueness and
# the current per-row decision/disposition kernel are explicit external premises.
def invariant(prefix,bad,emitted):
 return z3.And(prefix>=0,prefix<=n,bad==z3.Exists([k],z3.And(k>=0,k<prefix,d(k)>=2)),z3.ForAll([k],z3.Implies(z3.And(k>=0,k<prefix),z3.Select(emitted,k)==(d(k)==1))))
base=[n>=0,z3.ForAll([k],z3.Implies(z3.And(k>=0,k<n),z3.And(d(k)>=0,d(k)<=3)))]
before=invariant(i,failed,e);after=invariant(i+1,z3.Or(failed,d(i)>=2),z3.Store(e,i,d(i)==1));release=z3.And(preflight,covered,i==n,z3.Not(failed));weak_release=z3.And(preflight,covered,z3.Not(failed))
queries=[
 ('empty-prefix-establishes-invariant',[i==0,failed==False,e==z3.K(z3.IntSort(),False),z3.Not(before)],'unsat'),
 ('single-step-preserves-complete-prefix',[before,i<n,z3.Not(after)],'unsat'),
 ('completed-release-has-every-and-only-permitted-row',[before,release,z3.Exists([k],z3.And(k>=0,k<n,z3.Select(e,k)!=(d(k)==1)))],'unsat'),
 ('late-unknown-or-conflict-forbids-whole-release',[before,release,z3.Exists([k],z3.And(k>=0,k<n,d(k)>=2))],'unsat'),
 ('field-free-does-not-admit-denied-row',[before,release,k>=0,k<n,d(k)==0,z3.Select(e,k)],'unsat'),
 ('two-permitted-rows-remain-live',[before,n==2,i==2,d(0)==1,d(1)==1,release,z3.Select(e,0),z3.Select(e,1)],'sat'),
 ('caller-subset-hides-late-unknown',[before,n==2,i==1,d(0)==1,d(1)==2,weak_release,z3.Select(e,0),z3.Not(release)],'sat'),
 ('empty-population-still-requires-source-preflight',[before,n==0,i==0,z3.Not(preflight),release],'unsat'),
 ('complete-empty-population-positive',[before,n==0,i==0,release],'sat'),
 ('logical-release-is-not-native-authentication',[before,n==1,i==1,d(0)==1,release,z3.Not(native)],'sat'),
]
rows=[]
for name,clauses,expected in queries:
 s=z3.Solver();s.set(timeout=10000);s.add(*base,*clauses);text=s.to_smt2();actual=str(s.check());assert actual==expected,(name,actual)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(text);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(text);rows.append(dict(id=name,expected=expected,observed=actual,freshContextReplay=expected,formulaSha256=hashlib.sha256(text.encode()).hexdigest(),model=str(s.model()) if actual=='sat'else None))
paths=[pathlib.Path(__file__),pathlib.Path('src/extensions/security/catalog-runtime-candidate.ts'),pathlib.Path('tests/security/catalog-scan-corpus.ts')]
receipt=dict(status='conditional-complete-scan-fold-passed',solverVersion=z3.get_version_string(),checks=rows,sourceDigests={str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths},scope='Unbounded indexed supplied logical population and independently specified prefix fold. Exact source-to-index enumeration, unique normalized Keys, faithful per-row current action/disposition kernel, source preflight and trustworthy supplied completeness are premises. This proves conditional abstract loop invariants and exposes caller-subset omission, not actual TypeScript traversal/refinement, authenticated native facts, compiler readset completeness, SQL, budgets, output rendering, release coordination or backend admission.',acceptanceCasesPromoted=[])
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],unsat=sum(r['observed']=='unsat'for r in rows),sat=sum(r['observed']=='sat'for r in rows))))
