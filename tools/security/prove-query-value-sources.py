"""Conditional source/domain algebra and falsifying models, not compiler/native refinement."""
import hashlib,json,pathlib,sys
import z3
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
mode,ontology,catalog,disposition=z3.Ints('effective_mode ontology_mode catalog_mode read_disposition')
live,dto,pre,operand=z3.Ints('live_domain read_dto_domain pre_storage_domain operand_domain')
stored,verified,complete,no_gaps,eligible,present,designated,distinct,purpose,permission,properties,paired,pair_scope,random_token,reverse,live_null,dto_null,operand_null,read_value=z3.Bools('stored verified_sources complete_compiler no_selected_gaps read_row_eligible live_present exact_designation distinct_action original_action_purpose current_action_permission retained_properties paired_operation same_native_scope random_token reverse_grant live_nullable dto_nullable operand_nullable read_value_available')
rows=z3.Int('source_rows')
# modes0 prohibited1 disclosed2 original-authorized; catalog3 means proven not applicable.
# dispositions0 ORIGINAL1 catalog TRANSFORMED2 WITHHELD3 ABSENT.
base=[mode>=0,mode<=2,ontology>=0,ontology<=2,catalog>=0,catalog<=3,disposition>=0,disposition<=3,rows>=0,live>=0,dto>=0,pre>=0,operand>=0,z3.Implies(z3.Or(stored,disposition==1),catalog!=3),z3.Implies(disposition==0,read_value==present),z3.Implies(disposition==1,read_value),z3.Implies(z3.Or(disposition==2,disposition==3),z3.Not(read_value)),z3.Implies(disposition==3,z3.Not(present))]
mode_ok=z3.And(mode==ontology,z3.Or(catalog==3,mode==catalog),mode!=0)
selected=z3.If(mode==2,live,z3.If(disposition==1,dto,live))
nullable=z3.If(mode==2,live_null,z3.If(disposition==1,dto_null,live_null))
origin=z3.If(mode==2,0,z3.If(disposition==1,1,0)) #0live Field1read DTO2pre-storage/reverse
common=z3.And(verified,complete,no_gaps,mode_ok,z3.Or(z3.Not(paired),pair_scope),z3.Not(z3.And(mode==1,random_token,paired)))
domain=z3.And(operand==selected,operand_null==nullable)
action=z3.Or(mode!=2,z3.And(designated,distinct,purpose))
preflight=z3.And(common,domain,action)
value=z3.And(eligible,z3.If(mode==2,z3.And(present,permission),z3.And(read_value,properties)))
admit=z3.And(preflight,value)
queries=[
 ('stored-original-never-prestorage',[admit,stored,mode==2,origin==2],'unsat'),
 ('disclosed-dto-cannot-use-original-domain',[admit,mode==1,disposition==1,dto!=live,operand==live],'unsat'),
 ('nullable-read-output-not-overwritten-by-required-live',[admit,mode==1,disposition==1,z3.Not(live_null),dto_null,z3.Not(operand_null)],'unsat'),
 ('withheld-disclosed-value-refuses',[admit,mode==1,disposition==2],'unsat'),
 ('explicit-absence-is-not-a-scalar-value',[admit,mode==1,disposition==3],'unsat'),
 ('missing-original-designation-refuses',[admit,mode==2,z3.Not(designated)],'unsat'),
 ('matching-properties-do-not-issue-authority',[admit,properties,z3.Not(verified)],'unsat'),
 ('original-action-does-not-bypass-read-row-restriction',[admit,mode==2,permission,z3.Not(eligible)],'unsat'),
 ('conflicting-source-modes-have-no-route',[preflight,ontology==1,catalog==2],'unsat'),
 ('prohibition-refuses-even-empty-query',[preflight,ontology==0,rows==0],'unsat'),
 ('selected-compiler-gap-refuses',[preflight,z3.Not(no_gaps)],'unsat'),
 ('paired-properties-do-not-replace-common-scope',[admit,paired,properties,z3.Not(pair_scope)],'unsat'),
 ('random-token-disclosed-pair-refuses',[admit,mode==1,paired,random_token],'unsat'),
 ('separate-original-under-presentation-withholding-positive',[admit,mode==2,disposition==2,stored,z3.Not(reverse),z3.Not(properties)],'sat'),
 ('typed-disclosed-dto-positive',[admit,mode==1,disposition==1,dto!=live],'sat'),
 ('equal-bytes-do-not-merge-authority-routes',[mode==2,disposition==0,operand==live,z3.Not(designated),z3.Not(admit),properties],'sat'),
 ('weak-domain-check-misbinds-original-to-dto',[common,action,value,mode==1,disposition==1,dto!=live,operand==live],'sat'),
 ('weak-action-check-accepts-unrelated-action',[common,domain,value,mode==2,z3.Not(designated)],'sat'),
 ('weak-empty-branch-skips-prohibition',[rows==0,ontology==0,z3.Not(preflight),z3.Or(rows==0,preflight)],'sat'),
]
# Data origin is not recoverable from type/domain equality alone.
public_origin,public_domain=z3.Ints('public_projection_origin public_projection_domain')
projection_origin=z3.If(disposition==1,1,z3.If(z3.Or(disposition==2,disposition==3),3,0))
projection_domain=z3.If(disposition==1,dto,live)
queries += [
 ('known-absence-cannot-be-original-operand',[admit,mode==2,disposition==3],'unsat'),
 ('valid-rendered-dto-need-not-invent-live-input',[admit,mode==1,disposition==1,z3.Not(present),read_value],'sat'),
 ('same-domain-still-distinct-live-origin',[admit,stored,mode==2,live==pre,z3.Not(reverse),origin==0],'sat'),
 ('domain-only-check-cannot-prevent-prestorage-substitution',[admit,stored,mode==2,live==pre,z3.If(z3.And(stored,mode==2),2,origin)==2],'sat'),
 ('hidden-original-cannot-unmask-public-projection',[admit,mode==2,disposition==2,public_origin==projection_origin,public_origin==0],'unsat'),
 ('hidden-original-cannot-retype-dto-projection',[admit,mode==2,disposition==1,dto!=live,public_domain==projection_domain,public_domain==live],'unsat'),
 ('per-use-dual-domains-positive',[admit,mode==2,disposition==1,dto!=live,public_domain==dto,operand==live],'sat'),
 ('weak-global-field-map-unmasks-output',[admit,mode==2,disposition==2,public_origin==origin],'sat'),
]
# Determinism is a function, not an injectivity axiom; different inputs may share a class.
x,y=z3.Ints('input_x input_y');f=z3.Function('deterministic_transform',z3.IntSort(),z3.IntSort());g=z3.Function('other_key_scope',z3.IntSort(),z3.IntSort())
queries += [('deterministic-transform-need-not-be-injective',[x!=y,f(x)==f(y)],'sat'),('per-scope-functions-need-not-share-equality',[x==y,f(x)!=g(y)],'sat')]
# Exact ordered directions are separate from a global asc/desc capability set.
a=z3.Array('original_directions',z3.IntSort(),z3.BoolSort());b=z3.Array('emitted_directions',z3.IntSort(),z3.BoolSort());i=z3.Int('order_index');bound=z3.And(i>=0,i<2);exact=z3.ForAll(i,z3.Implies(bound,z3.Select(a,i)==z3.Select(b,i)))
queries += [('exact-directions-forbid-position-loss',[exact,z3.Exists(i,z3.And(bound,z3.Select(a,i)!=z3.Select(b,i)))],'unsat'),('global-order-capabilities-hide-position-swap',[z3.Select(a,0)==False,z3.Select(a,1)==True,z3.Select(b,0)==True,z3.Select(b,1)==False,z3.Not(exact)],'sat')]
checks=[]
for name,clauses,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*base,*clauses);text=solver.to_smt2();observed=str(solver.check());assert observed==expected,(name,observed)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(text);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(text);checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':expected,'formulaSha256':hashlib.sha256(text.encode()).hexdigest(),'model':str(solver.model()) if observed=='sat' else None})
paths=['tools/security/prove-query-value-sources.py','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/technical-designs/TD-079-security-semantics.md','docs/helix/03-test/test-plans/STP-079-security-semantics.md']
(out/'receipt.json').write_text(json.dumps({'status':'conditional-query-value-origin-model-passed','solverVersion':z3.get_version_string(),'checks':checks,'selectedSourceDigests':{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths},'acceptanceCasesPromoted':[],'scope':'Candidate mode conjunction/source/domain model, with source authenticity/completeness, faithful selected dispositions, mode ownership, actual descriptors and native scope correctness as external premises. Per-value read eligibility is distinct from collection filtering. Transformed here means a catalog-backed successful read value; source-only legacy constant probes are separate observations. This candidate scalar profile refuses explicit absence until qualified presence/operator encoding; legacy permission to observe known absence is a different claim. Shows constraints and weakening countermodels; no actual compiler, TypeScript, SQL, custody, current-authority or whole-query refinement/admission proof.'},indent=2)+'\n')
print(json.dumps({'queries':len(checks),'unsat':sum(x['observed']=='unsat' for x in checks),'sat':sum(x['observed']=='sat' for x in checks)}))
