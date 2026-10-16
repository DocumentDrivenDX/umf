"""Design algebra only: two abstract contributors plus arbitrary fold-step identities.
No proof of UMF implementation, compiler, driver, native admission or release.
"""
import hashlib,json,pathlib,sys
import z3
output=pathlib.Path(sys.argv[1]);rows=[]
def prove(name,formula,expected='unsat',premises=()):
 s=z3.Solver();s.set(timeout=10000);s.add(*premises,formula);actual=str(s.check());assert actual==expected,(name,actual);rows.append({'id':name,'expected':expected,'observed':actual,'smtlib':s.to_smt2(),'witness':str(s.model()) if actual=='sat' else None})
r=z3.Ints('read0 read1');a=z3.Ints('action0 action1');v=z3.Ints('value0 value1');present=z3.Bools('present0 present1');native=z3.Bools('native0 native1');eligible=[x==1 for x in r]
# 0=deny,1=permit,2=unknown. Truths/codec/current-source premises must come from actual owners.
admit=z3.And(*[x!=2 for x in r],*[z3.Implies(eligible[i],z3.And(a[i]==1,present[i],native[i])) for i in range(2)])
wellformed=[z3.And(x>=0,x<=2) for x in (*r,*a)];signed=[z3.And(x>=-(2**63),x<=2**63-1) for x in v]
count=z3.Sum(*[z3.If(e,1,0) for e in eligible]);total=z3.Sum(*[z3.If(eligible[i],v[i],0) for i in range(2)]);null=count==0
prove('admission-excludes-unknown-read',z3.And(admit,z3.Or(*[x==2 for x in r])),premises=wellformed)
prove('eligible-contributors-need-independent-permit-presence-domain',z3.And(admit,z3.Or(*[z3.And(eligible[i],z3.Or(a[i]!=1,z3.Not(present[i]),z3.Not(native[i]))) for i in range(2)])),premises=wellformed)
prove('empty-is-null-not-zero-result',z3.And(z3.Not(z3.Or(*eligible)),z3.Or(z3.Not(null),total!=0)),premises=wellformed)
prove('nonempty-zero-is-not-null',z3.And(count>0,total==0,null),premises=wellformed)
prove('permutation-keeps-multiplicity-and-total',z3.Or(total!=z3.If(eligible[1],v[1],0)+z3.If(eligible[0],v[0],0),count!=z3.If(eligible[1],1,0)+z3.If(eligible[0],1,0)))
n,t,x=z3.Ints('prior_count prior_total next_value');e=z3.Bool('next_read_eligible');next_n=n+z3.If(e,1,0);next_t=t+z3.If(e,x,0)
prove('arbitrary-fold-step-preserves-count-and-unbounded-sum',z3.And(n>=0,z3.Or(next_n<0,z3.And(z3.Not(e),z3.Or(next_n!=n,next_t!=t)),z3.And(e,z3.Or(next_n!=n+1,next_t!=t+x)))))
# Sensitivity witnesses: proposed unsafe alternatives have concrete counterexamples.
prove('mutant-skip-action-allows-eligible-denial',z3.And(r[0]==1,a[0]==0,present[0],native[0]),'sat',wellformed)
prove('mutant-empty-zero-erases-null-distinction',z3.And(count==0,total==0,null),'sat',wellformed)
prove('mutant-int64-accumulator-overflows-valid-inputs',z3.And(*eligible,total>2**63-1),'sat',signed)
prove('mutant-deduplicate-changes-bag-sum',z3.And(*eligible,v[0]==v[1],v[0]!=0,total!=v[0]),'sat',signed)
source=pathlib.Path('tests/security/protection/live-original-integer-sum-source.json');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
output.write_text(json.dumps({'status':'passed','solver':'Z3 '+z3.get_version_string(),'sourcePins':{str(pathlib.Path(__file__)):sha(pathlib.Path(__file__)),str(source):sha(source)},'queries':rows,'scope':'Design algebra for two abstract contributors and arbitrary integer fold-step identities. Read/action truth, presence, exact codec/domain, authenticated capture and admission are assumptions. This is not induction over an implemented fold or proof/refinement of UMF/Weft/SQL/native code. No backend acceptance promotion.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'status':'passed','queries':len(rows),'scope':'design algebra only'}))
