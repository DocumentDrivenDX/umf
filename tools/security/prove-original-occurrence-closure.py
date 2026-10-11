"""Conditional assertion inventory closure; not a parser/owner/native refinement proof."""
from pathlib import Path
import hashlib, json, uuid, zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
TRUSS=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),TRUSS/'packages/postgresql/src/acceptance-json.ts',TRUSS/'packages/umf-bun/src/catalog-original-occurrence-inventory.ts',TRUSS/'packages/umf-bun/src/catalog-core-assertion-identities.ts',TRUSS/'packages/umf-bun/src/catalog-assertion-observations.ts',TRUSS/'tests/catalog-core-assertion-identities.test.ts',TRUSS/'docs/helix/04-build/acceptance-runtime-handoff.md']
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
Occurrence=z3.DeclareSort('OriginalOccurrence')
x,y,z=z3.Consts('occurrence substituted_occurrence inventory_position',Occurrence)
original=z3.Function('is_original_value',Occurrence,z3.BoolSort())
covered=z3.Function('is_indexed_value',Occurrence,z3.BoolSort())
assertion=z3.Function('is_semantic_assertion',Occurrence,z3.BoolSort())
classification=z3.Function('owner_classification',Occurrence,z3.IntSort())
reported=z3.Function('is_reported_assertion',Occurrence,z3.BoolSort())
# Classification0 is unavailable; 1 assertion; 2 nonassertive metadata;
# 3 absence of a declaration at an authored carrier (not absence of the value).
base=[z3.ForAll(x,z3.Implies(assertion(x),original(x))),z3.ForAll(x,z3.And(classification(x)>=0,classification(x)<=3))]
guards={
 'coverage':z3.ForAll(x,covered(x)==original(x)),
 'resolved':z3.ForAll(x,z3.Implies(covered(x),classification(x)!=0)),
 'meaning':z3.ForAll(x,z3.Implies(z3.And(covered(x),classification(x)!=0),(classification(x)==1)==assertion(x))),
 'report':z3.ForAll(x,reported(x)==z3.And(covered(x),classification(x)==1)),
}
full=list(guards.values())
def without(*names):return [v for k,v in guards.items() if k not in names]
missing=z3.And(original(x),assertion(x),z3.Not(reported(x)))
invented=z3.And(reported(x),z3.Not(assertion(x)))
sound=z3.ForAll(x,z3.Implies(z3.And(covered(x),classification(x)==1),assertion(x)))
authority,enforcement=z3.Bools('authenticated_registered_meaning installed_enforcement')
specs=[
 ('complete-interpretation-has-positive-model',base+full,[original(x),assertion(x),reported(x)],'sat'),
 ('complete-interpretation-forbids-missing-assertion',base+full,[missing],'unsat'),
 ('complete-interpretation-forbids-invented-assertion',base+full,[invented],'unsat'),
 ('exact-coverage-selection-forbid-foreign-reported-value',base+[guards['coverage'],guards['report']],[reported(x),z3.Not(original(x))],'unsat'),
 ('omit-source-coverage-admits-missing-assertion',base+without('coverage'),[missing,z3.Not(covered(x))],'sat'),
 ('omit-semantic-correspondence-admits-wrong-metadata',base+without('meaning'),[missing,covered(x),classification(x)==2],'sat'),
 ('omit-semantic-correspondence-admits-invented-assertion',base+without('meaning'),[invented,original(x)],'sat'),
 ('omit-unavailable-refusal-admits-opaque-assertion-omission',base+without('resolved'),[missing,covered(x),classification(x)==0],'sat'),
 ('omit-report-selection-admits-report-omission',base+without('report'),[missing,covered(x),classification(x)==1],'sat'),
 ('partial-sound-interpretation-forbids-invented-assertion',base+[sound,guards['report']],[invented],'unsat'),
 ('partial-sound-interpretation-does-not-prove-completeness',base+[sound,guards['coverage'],guards['report']],[missing,classification(x)==0],'sat'),
 ('complete-structural-coverage-does-not-prove-meaning',base+[guards['coverage'],guards['resolved'],guards['report']],[missing,classification(x)==2],'sat'),
 ('absence-carrier-does-not-invent-an-assertion',base+full,[original(x),classification(x)==3,reported(x)],'unsat'),
 ('equal-source-index-counts-admit-exchanged-occurrences',base+without('coverage'),[x!=y,z3.ForAll(z,original(z)==(z==x)),z3.ForAll(z,covered(z)==(z==y)),assertion(x),classification(y)==2,z3.Not(reported(x))],'sat'),
 ('logical-completeness-does-not-prove-authority-or-enforcement',base+full,[original(x),assertion(x),reported(x),z3.Not(authority),z3.Not(enforcement)],'sat'),
]
# Exact original byte carriers, not a digest-injectivity assumption.
Bytes=z3.DeclareSort('OriginalSourceBytes')
document=z3.Function('document_id',Occurrence,z3.StringSort())
source=z3.Function('original_source_bytes',Occurrence,Bytes)
pointer=z3.Function('decoded_pointer',Occurrence,z3.StringSort())
identity=z3.ForAll([x,y],z3.Implies(z3.And(document(x)==document(y),source(x)==source(y),pointer(x)==pointer(y)),x==y))
specs += [
 ('pointer-only-join-admits-cross-document-substitution',[identity],[x!=y,pointer(x)=='/modules/0/elements/0/kind',pointer(y)==pointer(x),document(x)=='doc-a',document(y)=='doc-b'],'sat'),
 ('document-pointer-join-admits-source-substitution',[identity],[x!=y,pointer(x)=='/modules/0/elements/0/kind',pointer(y)==pointer(x),document(x)=='doc-a',document(y)==document(x),source(x)!=source(y)],'sat'),
 ('complete-original-tuple-forbids-occurrence-substitution',[identity],[x!=y,pointer(x)==pointer(y),document(x)==document(y),source(x)==source(y)],'unsat'),
]
# Position-level membership does not enumerate multiple rules at one position.
# Full assertion report closure additionally needs exact rule-family membership.
Rule=z3.DeclareSort('SemanticRuleIdentity')
r,a,b=z3.Consts('rule_identity rule_a rule_b',Rule)
true_rule=z3.Function('original_semantic_rule',Occurrence,Rule,z3.BoolSort())
inventory_rule=z3.Function('inventoried_semantic_rule',Occurrence,Rule,z3.BoolSort())
report_rule=z3.Function('reported_semantic_rule',Occurrence,Rule,z3.BoolSort())
rule_base=[z3.ForAll([x,r],z3.Implies(true_rule(x,r),original(x))),
 z3.ForAll(x,assertion(x)==z3.Exists(r,true_rule(x,r))),
 z3.ForAll(x,reported(x)==z3.Exists(r,report_rule(x,r))),
 z3.ForAll(x,z3.Implies(z3.And(covered(x),classification(x)!=0),(classification(x)==1)==z3.Exists(r,inventory_rule(x,r))))]
rule_meaning=z3.ForAll([x,r],z3.Implies(z3.And(covered(x),classification(x)!=0),inventory_rule(x,r)==true_rule(x,r)))
rule_selection=z3.ForAll([x,r],report_rule(x,r)==z3.And(covered(x),inventory_rule(x,r)))
rule_full=base+rule_base+full+[rule_meaning,rule_selection]
specs += [
 ('complete-rule-inventory-has-positive-model',rule_full,[original(x),true_rule(x,a),report_rule(x,a)],'sat'),
 ('complete-rule-inventory-reports-two-rules-at-one-position',rule_full,[original(x),a!=b,true_rule(x,a),true_rule(x,b),report_rule(x,a),report_rule(x,b)],'sat'),
 ('complete-rule-inventory-forbids-missing-rule',rule_full,[true_rule(x,a),z3.Not(report_rule(x,a))],'unsat'),
 ('complete-rule-inventory-forbids-invented-rule',rule_full,[report_rule(x,a),z3.Not(true_rule(x,a))],'unsat'),
 ('position-completeness-admits-one-of-two-rules-omitted',base+full+rule_base+[rule_selection],[original(x),assertion(x),classification(x)==1,reported(x),a!=b,true_rule(x,a),true_rule(x,b),inventory_rule(x,a),z3.Not(inventory_rule(x,b)),report_rule(x,a),z3.Not(report_rule(x,b))],'sat'),
 ('omit-rule-meaning-admits-one-of-two-rules-omitted',base+rule_base+[guards['coverage'],guards['resolved'],rule_selection],[a!=b,true_rule(x,a),true_rule(x,b),inventory_rule(x,a),z3.Not(inventory_rule(x,b)),report_rule(x,a),z3.Not(report_rule(x,b))],'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/original-occurrence-closure'/str(uuid.uuid4());out.mkdir(parents=True)
checks=[]
for name,premises,query,expected in specs:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,*query);formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise RuntimeError(name+': '+observed)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.add(z3.parse_smt2_string(formula,ctx=ctx));replayed=str(replay.check())
 if replayed!=expected:raise RuntimeError(name+': replay '+replayed)
 checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':replayed,'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Source changed')
with zipfile.ZipFile(out/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for i,(p,b) in enumerate(frozen.items()):archive.writestr(str(i)+'/'+Path(p).name,b)
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],
 'premises':['Exact original value inventory and selected occurrence identity; lexer correspondence is not proven here','Resolved classifications agree with original registered owner meaning; actual owner implementation/registration is not proven here','Position report selection exactly follows classifications; full rule reporting additionally requires exact rule-family interpretation and selection','Original document/source-byte/pointer tuple is injective; no SHA collision-freedom theorem','Local solver installation and fresh SMT replay; not hermetic'],
 'scope':'Quantified occurrence-position and distinct rule-family logical closure and omission/substitution counterexamples, not JavaScript/JSON parser refinement, complete semantic profile, database enforcement or native report admission','acceptancePromoted':False,'currentImplementation':'complete:false and interpretationQualified:false; sourceCoverageComplete is structural only'}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
