"""Action-purpose information requirement and conditional owner compatibility."""
import hashlib,json
from pathlib import Path
import z3
rows=[]
def check(name,premises,violation,expected):
 s=z3.Solver();s.set(timeout=10000);s.add(*premises,violation);q=s.to_smt2();actual=str(s.check());assert actual==expected,(name,actual)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(q);assert str(replay.check())==actual
 rows.append({'id':name,'expected':expected,'observed':actual,'smt2':q,'witness':str(s.model()) if actual=='sat' else None})
reverse,ordinary,field,original,vault=z3.Ints('reverse ordinary field original vault');present=[reverse>=0,reverse<256,ordinary>=0,ordinary<256]
check('presence-is-not-distinctness',present,reverse==ordinary,'sat')
# Same serialized action set and reverse ID, different missing purposes.
source=z3.String('identical_source');decision=z3.Bool('deterministic_decision');read1,read2=z3.Ints('world1_read world2_read')
worlds=[source==z3.StringVal('actions:[a,b]; reverse:b'),reverse==1,read1==0,read2==1]
check('opposite-intended-results-with-identical-visible-source',worlds,z3.Xor(reverse!=read1,reverse!=read2),'sat')
check('no-source-only-decision-correct-in-both-worlds',worlds+[decision==(reverse!=read1)],decision==(reverse!=read2),'unsat')
policy_grants_reverse=z3.Bool('policy_grants_reverse');valid_declared_reverse=z3.Bool('valid_declared_reverse')
check('ban-all-policy-actions-rejects-legitimate-reverse-grant',[valid_declared_reverse,policy_grants_reverse,reverse!=ordinary],z3.Not(z3.Not(policy_grants_reverse)),'sat')
listed=z3.Array('caller_exclusion_list',z3.IntSort(),z3.BoolSort())
check('incomplete-exclusion-list-hides-alias',[reverse==ordinary,z3.Not(z3.Select(listed,reverse))],z3.Not(z3.Select(listed,reverse)),'sat')
# Declared purposes do not establish actual operation-owner designation. Owners
# must check their original source-bound profiles, not client annotations.
declared_ordinary=z3.Array('declared_ordinary',z3.IntSort(),z3.BoolSort());declared_reverse=z3.Array('declared_reverse',z3.IntSort(),z3.BoolSort())
source_separation=z3.And(z3.Select(declared_reverse,reverse),z3.Not(z3.Select(declared_ordinary,reverse)))
check('source-classification-alone-not-owner-compatibility',[source_separation],reverse==ordinary,'sat')
for role,actual in [('read',ordinary),('field',field),('original',original)]:
 check(role+'-owner-compatible-reverse-separation',[source_separation,z3.Select(declared_ordinary,actual)],reverse==actual,'unsat')
# Purpose closure is not permission. The exact-action evaluator must still ask
# for the reverse grant, and actual native control remains a separate premise.
granted=z3.Array('granted',z3.IntSort(),z3.BoolSort());execute_reverse=z3.Bool('execute_reverse')
check('ordinary-grant-does-not-imply-reverse',[reverse!=ordinary,z3.Select(granted,ordinary)],z3.Not(z3.Select(granted,reverse)),'sat')
check('missing-reverse-permission-blocks-execution',[execute_reverse==z3.Select(granted,reverse),z3.Not(z3.Select(granted,reverse))],execute_reverse,'unsat')
check('explicit-reverse-grant-stays-possible',[source_separation,reverse!=ordinary],z3.Select(granted,reverse),'sat')
check('reverse-grant-does-not-imply-vault-write',[vault!=reverse,z3.Select(granted,reverse)],z3.Not(z3.Select(granted,vault)),'sat')
complete,known,compatible,native=z3.Bools('complete known compatible native')
admitted=z3.And(complete,known,compatible,source_separation)
check('incomplete-purpose-source-refuses',[z3.Not(complete)],admitted,'unsat')
check('unknown-purpose-source-refuses',[z3.Not(known)],admitted,'unsat')
check('owner-mismatch-refuses',[z3.Not(compatible)],admitted,'unsat')
check('declaration-check-does-not-prove-native',[admitted],z3.Not(native),'sat')
paths=['scripts/security-ontology-v2-schema.py','spec/extensions/security-v0.2/ontology.schema.json','src/extensions/security/action-purpose-declarations.ts','src/extensions/security/action-purposes.ts','src/extensions/security/protection/obligations.ts','tools/security/prove-action-purpose-gap.py','tools/security/protection-action-purpose-spike.ts','src/extensions/security/protection/catalog.ts','src/extensions/security/write.ts','spec/extensions/security/ontology.schema.json','docs/helix/02-design/spikes/security/ontology-v0.2.schema.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
out=Path('docs/helix/04-build/evidence/security/protection-action-purpose-20261015');out.mkdir(parents=True,exist_ok=True)
r={'status':'conditional-analysis-passed','solverVersion':z3.get_version_string(),'checks':rows,'sourceDigests':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'scope':'Two-world information-gap counterexample and conditional purpose/source/owner/exact-action algebra. Source purpose classifications alone cannot prove actual owner designation. Assumes exhaustive known classification and owner-derived profile uses; does not prove parser, implementation, native custody, source authenticity, authenticated complete profile inventory or policy truth. Existing interpreter remains closed.','acceptanceCasesPromoted':[],'nativeInstallationProven':False}
(out/'formal.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'checks':len(rows),'unsat':sum(x['observed']=='unsat' for x in rows),'sat':sum(x['observed']=='sat' for x in rows)}))
