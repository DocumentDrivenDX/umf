"""Conditional pure-function algebra, not executable/native refinement."""
from pathlib import Path
import hashlib,json,z3
rows=[]
def check(name,premises,violation,expected):
 s=z3.Solver();s.set(timeout=10000);s.add(*premises,violation);query=s.to_smt2();result=str(s.check());assert result==expected,(name,result)
 ctx=z3.Context();other=z3.Solver(ctx=ctx);other.set(timeout=10000);other.from_string(query);assert str(other.check())==result
 rows.append({'id':name,'expected':expected,'observed':result,'smt2':query,'witness':str(s.model()) if result=='sat' else None})
x,origin,width=z3.Ints('input origin width');delta=x-origin
# JavaScript BigInt division truncates toward zero. This explicit adjustment is
# the actual algorithm being modeled; floor is not assumed as its result.
q0=z3.If(delta>=0,delta/width,-((-delta)/width));q=z3.If(z3.And(delta<0,(-delta)%width!=0),q0-1,q0);out=origin+q*width
check('bucket-lower-bound',[width>0],out>x,'unsat')
check('bucket-upper-exclusive',[width>0],x>=out+width,'unsat')
check('bucket-idempotence',[width>0],origin+((out-origin)/width)*width!=out,'unsat')
check('omit-negative-floor-control',[width>0,delta<0],origin+q0*width>x,'sat')
n,p,s=z3.Ints('length prefix suffix');minimum=lambda a,b:z3.If(a<b,a,b)
kp=minimum(p,n);ks=minimum(s,n-kp);middle=n-kp-ks
bounds=[n>=0,p>=0,s>=0,p<=4096,s<=4096]
check('partial-nonnegative-middle',bounds,middle<0,'unsat')
check('partial-total-length',bounds,kp+middle+ks!=n,'unsat')
check('partial-short-full-exposure',bounds+[n<=p+s],middle!=0,'unsat')
check('overlapping-suffix-control',bounds,n-minimum(p,n)-minimum(s,n)<0,'sat')
y,m,d=z3.Ints('year month day');leap=z3.And(y%4==0,z3.Or(y%100!=0,y%400==0))
def days(month):return z3.If(month==2,z3.If(leap,29,28),z3.If(z3.Or(month==4,month==6,month==9,month==11),30,31))
valid=[y>=1,y<=9999,m>=1,m<=12,d>=1,d<=days(m)]
for unit,om,od in [('year',z3.IntVal(1),z3.IntVal(1)),('quarter',1+3*((m-1)/3),z3.IntVal(1)),('month',m,z3.IntVal(1)),('day',m,d)]:
 check(unit+'-valid-output',valid,z3.Or(om<1,om>12,od<1,od>days(om)),'unsat')
 check(unit+'-nonadvancing',valid,z3.Or(om>m,z3.And(om==m,od>d)),'unsat')
check('quarter-idempotence',[m>=1,m<=12],1+3*(((1+3*((m-1)/3))-1)/3)!=1+3*((m-1)/3),'unsat')
known,pinned,signature,input_valid,output_valid,budget=z3.Bools('known pinned signature input_valid output_valid budget')
admitted=z3.And(known,pinned,signature,input_valid,output_valid,budget)
check('every-emission-requires-input',[],z3.And(admitted,z3.Not(input_valid)),'unsat')
check('constant-bypass-input-control',[known,pinned,signature,output_valid,budget,z3.Not(input_valid)],z3.And(known,pinned,signature,output_valid,budget),'sat')
paths=['tools/security/prove-protection-functions.py','src/extensions/security/protection/functions.ts','src/extensions/security/protection/literals.ts','src/adapters/gregorian-date.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/contracts/CONTRACT-066-gregorian-date-operations.md']
out=Path('docs/helix/04-build/evidence/security/protection-functions-20261015');out.mkdir(parents=True,exist_ok=True)
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'checks':rows,'sourceDigests':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'scope':'Exact integer coefficient floor algebra (decimal scaling a premise), Unicode scalar count/no-overlap algebra (not grapheme or collation), selected Gregorian date output algebra, and explicit input-guard conjunction. Assumes actual parser/domain closure, complete guards, bounded integer fidelity, source snapshot and implementation correspond to these expressions. SAT controls expose truncation-toward-zero, overlapping disclosure and constant-input bypass. No TypeScript/core-literal/compiler/native refinement, total resource theorem, authorization, confidentiality, source authentication, native date equivalence or whole S19 qualification.','acceptanceCasesPromoted':[],'nativeInstallationProven':False}
(out/'formal.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'checks':len(rows),'unsat':sum(r['observed']=='unsat' for r in rows),'sat':sum(r['observed']=='sat' for r in rows)}))
