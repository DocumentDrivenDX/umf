"""Conditional occurrence-selection algebra. Not a source-code refinement proof."""
import argparse, hashlib, json
from pathlib import Path
import z3
p=argparse.ArgumentParser();p.add_argument('output');args=p.parse_args()
out=Path(args.output)
if out.exists(): raise RuntimeError('Fresh receipt path required')
root=Path.cwd()
if Path(__file__).resolve()!=(root/'tools/security/prove-disclosure-selection.py').resolve():
 raise RuntimeError('Execute the exact repository proof source from its root')
paths=['tools/security/prove-disclosure-selection.py','src/extensions/security/catalog-runtime-candidate.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
sources={s:hashlib.sha256((root/s).read_bytes()).hexdigest() for s in paths}
# Original ordered disclosure positions are flattened to distinct natural-number
# ranks. Faithfulness of that flattening, identity equality and rule eligibility
# to real sources is a premise. This proof does not parse/translate TypeScript.
i,j,k=z3.Ints('i j k'); n=z3.Int('population_size'); selected=z3.Int('selected')
active=z3.Function('active',z3.IntSort(),z3.BoolSort())
kind=z3.Function('kind',z3.IntSort(),z3.IntSort())
identity=z3.Function('identity',z3.IntSort(),z3.IntSort())
def inside(x):return z3.And(x>=0,x<n)
def contributes(x,t):return z3.And(inside(x),active(x),kind(x)==t)
# kind original=1, withheld=2, transformed=3. Non-contributors may have any kind.
withheld=z3.Exists(i,contributes(i,2))
conflict=z3.Exists([i,j],z3.And(contributes(i,3),contributes(j,3),identity(i)!=identity(j)))
transformed=z3.Exists(i,contributes(i,3))
# Base row permit and no missing protected obligation are assumed. The
# selection predicate is deliberately relational: total construction of the
# least element by the implementation is not proved here.
render_transform=z3.And(z3.Not(withheld),z3.Not(conflict),transformed)
def chosen(x):return z3.And(render_transform,contributes(x,3),z3.Not(z3.Exists(i,z3.And(contributes(i,3),i<x))))
base=[n>=0];queries=[]
def check(name,formula,expected):
 s=z3.Solver();s.set(timeout=20000);s.add(*base,formula);smt=s.sexpr();actual=str(s.check())
 if actual!=expected:raise RuntimeError(name+': '+actual)
 replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt)
 if str(replay.check())!=expected:raise RuntimeError('Replay differs: '+name)
 queries.append({'id':name,'expected':expected,'result':actual,'smt':smt,'model':str(s.model()) if actual=='sat' else None})
def prove(name,premises,violation):
 check(name+'-premises-nonvacuous',z3.And(*premises),'sat')
 check(name,z3.And(*premises,violation),'unsat')
prove('chosen-source-is-active-transform',[chosen(selected)],z3.Not(contributes(selected,3)))
prove('chosen-source-is-in-original-population',[chosen(selected)],z3.Not(inside(selected)))
prove('chosen-source-is-first-active-transform',[chosen(selected)],z3.And(contributes(j,3),j<selected))
prove('selected-occurrence-unique',[chosen(j),chosen(k)],j!=k)
prove('every-active-transform-has-selected-identity',[chosen(selected),contributes(j,3)],identity(j)!=identity(selected))
prove('active-withheld-prevents-selection',[contributes(j,2)],chosen(selected))
prove('distinct-active-identities-prevent-selection',[contributes(j,3),contributes(k,3),identity(j)!=identity(k)],chosen(selected))
prove('original-source-cannot-be-selected-transform',[inside(selected),active(selected),kind(selected)==1],chosen(selected))
prove('empty-population-has-no-selection',[n==0],chosen(selected))
prove('source-contributors-exclude-inactive-positions',[inside(j),z3.Not(active(j))],contributes(j,3))
# A second population changes kind/identity at one inactive position. Unlike
# assuming the conclusion via chosen(), these relations compare the two folds.
replacement_kind,replacement_identity=z3.Ints('replacement_kind replacement_identity')
def changed_kind(x):return z3.If(x==j,replacement_kind,kind(x))
def changed_identity(x):return z3.If(x==j,replacement_identity,identity(x))
def changed_contributes(x,t):return z3.And(inside(x),active(x),changed_kind(x)==t)
changed_withheld=z3.Exists(i,changed_contributes(i,2))
changed_conflict=z3.Exists([i,k],z3.And(changed_contributes(i,3),changed_contributes(k,3),changed_identity(i)!=changed_identity(k)))
changed_transformed=z3.Exists(i,changed_contributes(i,3))
def changed_chosen(x):return z3.And(z3.Not(changed_withheld),z3.Not(changed_conflict),changed_transformed,changed_contributes(x,3),z3.Not(z3.Exists(i,z3.And(changed_contributes(i,3),i<x))))
prove('inactive-update-preserves-contributor-set',[inside(j),z3.Not(active(j))],z3.Exists([i,k],contributes(i,k)!=changed_contributes(i,k)))
prove('inactive-update-preserves-selected-occurrence',[inside(j),z3.Not(active(j)),chosen(selected)],z3.Not(changed_chosen(selected)))
prove('inactive-update-cannot-create-selection',[inside(j),z3.Not(active(j)),changed_chosen(selected)],z3.Not(chosen(selected)))
check('duplicate-identity-positions-are-compatible',z3.And(chosen(j),contributes(k,3),j!=k,identity(j)==identity(k)),'sat')
# Explicit small countermodels show why weakened source selection is unsafe.
check('choose-last-mutant-changes-source-position',z3.And(n==2,contributes(0,3),contributes(1,3),identity(0)==identity(1),chosen(0),z3.Not(chosen(1))),'sat')
check('ignore-active-mutant-chooses-inactive-earlier-position',z3.And(n==2,z3.Not(active(0)),kind(0)==3,contributes(1,3),chosen(1)),'sat')
check('drop-identity-conflict-mutant-would-select',z3.And(n==2,contributes(0,3),contributes(1,3),identity(0)!=identity(1),z3.Not(withheld),z3.Not(chosen(0))),'sat')
check('drop-withheld-dominance-mutant-would-select',z3.And(n==2,contributes(0,2),contributes(1,3),z3.Not(conflict),z3.Not(chosen(1))),'sat')
prove('out-of-range-metadata-cannot-be-selected',[chosen(selected)],selected>=n)
for name,h in sources.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=h:raise RuntimeError('Source changed: '+name)
receipt={'version':'umf.security.disclosure-selection-algebra/0.1-candidate','status':'conditional-proof-passed','authority':False,'complete':False,'solverVersion':z3.get_version_string(),'sourceDigests':sources,'covers':['US-056-AC6','US-056-AC10'],'queries':queries,'scope':'Conditional unbounded ordered occurrence algebra for one field after base policy permit and protected-obligation admission. Faithful complete source flattening, exact transform identity and active rule contributions are premises. Establishes uniqueness, earliest eligible source, active/scope population membership, consensus, withholding/conflict refusal and compatibility of distinct duplicate-identity positions (not retained-output collection preservation). Every theorem has a separately satisfiable premise check. Alternate populations prove invariance of contributor membership and selected occurrence under arbitrary kind/identity updates at an inactive position. SAT controls expose later/inactive/wrong-identity/withholding mutants. Does not prove least-element construction/termination, TypeScript refinement, compiler or native behavior, authenticated source/current cut, transform values, wire admission, operator permission or guarded release.'}
out.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'queries':len(queries),'unsat':sum(q['result']=='unsat' for q in queries),'sat':sum(q['result']=='sat' for q in queries)}))
