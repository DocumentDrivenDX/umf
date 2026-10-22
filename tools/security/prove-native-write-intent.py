"""Conditional response-observation model for explicit native assignments; not SQL refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
old_a,old_b,proposed=z3.Ints('hidden_before_A hidden_before_B public_assignment')
normal,field,original,declared,blind=z3.Bools('ordinary_update ordinary_Field effective_original_read blind_declared blind_granted')
eligible=z3.And(normal,field,z3.Or(original,z3.And(declared,blind)))
# 0 is one constant refusal; 1 is acknowledgment only. The fixed command route
# has no old/new/count output and checks intent before inspecting hidden data.
strong=lambda old:z3.If(eligible,1,0)
# Logical changed-Field guards deliberately allow no-op deltas. Applying that
# alone to an externally callable assignment endpoint is the weakened binding.
weak=lambda old:z3.If(z3.And(normal,z3.Or(old==proposed,z3.And(field,z3.Or(original,z3.And(declared,blind))))),1,0)
masked=z3.And(normal,field,z3.Not(original),z3.Not(blind))
rows=[]
def check(name,formula,expected,scope):
 s=z3.Solver();s.set(timeout=10000);s.add(formula);smt=s.to_smt2();actual=str(s.check());assert actual==expected,(name,actual)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(smt);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(smt)
 rows.append(dict(id=name,expected=expected,observed=actual,scope=scope,model=str(s.model()) if actual=='sat' else None,smt2Sha256=hashlib.sha256(smt.encode()).hexdigest()))
check('changed-only-assignment-leaks-hidden-equality',z3.And(masked,old_a==proposed,old_b!=proposed,weak(old_a)!=weak(old_b)),'sat','Same public assignment and authority/mask, different hidden amount; status distinguishes worlds.')
check('intent-refusal-independent-of-hidden-equality',z3.And(masked,strong(old_a)!=strong(old_b)),'unsat','One uniform refusal for masked/withheld without an allowed blind route, before hidden lookup.')
check('ack-requires-all-intent-permissions',z3.And(strong(old_a)==1,z3.Not(eligible)),'unsat','Actual original read or both declared and granted blind, plus both ordinary permissions.')
check('blind-grant-without-designation-refuses',z3.And(normal,field,z3.Not(original),blind,z3.Not(declared),strong(old_a)==1),'unsat','A grant cannot invent the Field-specific blind binding.')
check('blind-does-not-replace-ordinary-Field',z3.And(normal,z3.Not(field),declared,blind,strong(old_a)==1),'unsat','Explicit blind permission remains additional to ordinary Field authority.')
check('authorized-ack-independent-of-actual-delta',z3.And(eligible,old_a==proposed,old_b!=proposed,strong(old_a)!=strong(old_b)),'unsat','Acknowledgment has no affected-row count or old/new data in this model.')
check('logical-noop-remains-permitted-under-weakened-endpoint',z3.And(masked,old_a==proposed,weak(old_a)==1,strong(old_a)==0),'sat','Separates existing logical delta semantics from required native command-intent restriction.')
receipt=dict(status='conditional-command-intent-analysis-passed',solver=z3.get_version_string(),command=[sys.executable,*sys.argv],sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),checks=rows,scope='Unbounded mathematical integer amounts and fixed Boolean current authority/read class. Abstract acknowledgment/refusal only; no TypeScript/SQL refinement, SQLNULL/isolation/lock/role/source authenticity, timing, diagnostics, missing-object, crypto or lifecycle proof.',acceptanceCasesPromoted=[])
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],checks=len(rows))))
