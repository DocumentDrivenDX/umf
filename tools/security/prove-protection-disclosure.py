"""Conditional transport algebra; no executable/parser/native refinement theorem."""
from pathlib import Path
import hashlib,json,z3
rows=[]
def check(name,premises,violation,expected):
 s=z3.Solver();s.set(timeout=10000);s.add(*premises,violation);query=s.to_smt2();actual=str(s.check());assert actual==expected,(name,actual)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.from_string(query);replay.set(timeout=10000);assert str(replay.check())==actual
 rows.append({'id':name,'expected':expected,'observed':actual,'smt2':query,'witness':str(s.model()) if actual=='sat' else None})
Value=z3.Datatype('Value');Value.declare('null');Value.declare('literal',('payload',z3.StringSort()));Value=Value.create()
Cell=z3.Datatype('Cell');Cell.declare('original',('canonicalDomain',z3.IntSort()),('originalValue',Value));Cell.declare('absent');Cell.declare('withheld');Cell.declare('transformed',('outputDomain',z3.IntSort()),('transformId',z3.IntSort()),('transformedValue',Value));Cell=Cell.create()
f,g,t=z3.Ints('canonical output transform');v,w=z3.Consts('v w',Value)
check('original-null-distinct-absence',[],Cell.original(f,Value.null)==Cell.absent,'unsat')
check('original-null-distinct-withheld',[],Cell.original(f,Value.null)==Cell.withheld,'unsat')
check('transformed-null-distinct-original-null',[],Cell.transformed(g,t,Value.null)==Cell.original(f,Value.null),'unsat')
check('absent-distinct-withheld',[],Cell.absent==Cell.withheld,'unsat')
check('transformed-domain-retained',[f!=g],Cell.transformed(f,t,v)==Cell.transformed(g,t,v),'unsat')
check('original-literal-spelling-retained',[v!=w],Cell.original(f,v)==Cell.original(f,w),'unsat')
# Projecting all null-like representations to SQL NULL loses the disjoint tag.
cell=z3.Const('cell',Cell)
def null_projection(c):return z3.If(z3.Or(Cell.is_absent(c),Cell.is_withheld(c)),Value.null,z3.If(Cell.is_original(c),Cell.originalValue(c),Cell.transformedValue(c)))
check('lossy-sql-null-countermodel',[],z3.And(Cell.original(f,Value.null)!=Cell.withheld,null_projection(Cell.original(f,Value.null))==null_projection(Cell.withheld)),'sat')
column,source,stored_output,presentation_input=z3.Ints('column source stored_output presentation_input')
stored=z3.Bool('stored');binding=z3.And(stored,column==stored_output)
check('stored-original-uses-carrier-domain',[binding],column!=stored_output,'unsat')
check('prestorage-domain-override-countermodel',[stored,source!=stored_output,column==source],column!=stored_output,'sat')
check('stored-token-presentation-input',[binding,presentation_input==column],presentation_input!=stored_output,'unsat')
known,pinned,metadata,budget=z3.Bools('known pinned metadata budget')
n,bad=z3.Ints('cell_count bad_index');valid=z3.Array('valid',z3.IntSort(),z3.BoolSort());i=z3.Int('i')
all_valid=z3.ForAll(i,z3.Implies(z3.And(i>=0,i<n),z3.Select(valid,i)))
accepted=z3.And(known,pinned,metadata,budget,n>=0,all_valid)
check('invalid-cell-clears-entire-batch',[n>0,bad>=0,bad<n,z3.Not(z3.Select(valid,bad))],accepted,'unsat')
check('prefix-release-countermodel',[n>1,bad>0,bad<n,z3.Select(valid,0),z3.Not(z3.Select(valid,bad))],z3.Select(valid,0),'sat')
check('empty-batch-still-checks-metadata',[n==0,z3.Not(metadata)],accepted,'unsat')
check('skip-empty-metadata-countermodel',[n==0,z3.Not(metadata),known,pinned,budget],z3.Or(n==0,accepted),'sat')
# Host-supplied exact pins are not an authentication theorem.
authentic=z3.Bool('authentic');check('pins-do-not-prove-authenticity',[accepted],z3.Not(authentic),'sat')
paths=['tools/security/prove-protection-disclosure.py','src/extensions/security/protection/disclosure.ts','src/extensions/security/protection/literals.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
out=Path('docs/helix/04-build/evidence/security/protection-disclosure-20261015');out.mkdir(parents=True,exist_ok=True)
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'checks':rows,'sourceDigests':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'scope':'Disjoint algebraic cell tags and literal/domain identity, stored carrier vs pre-storage domain, whole-batch conjunction including empty metadata and countermodels for SQL NULL/prefix release/metadata omission/authenticity. Assumes executable closed parser, exact guards, source closure and implementation refine these expressions. Not TypeScript refinement, native custody, transformation correctness, row policy truth, source authentication, total resource theorem or whole S20 qualification.','acceptanceCasesPromoted':[],'nativeInstallationProven':False}
(out/'formal.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'checks':len(rows),'unsat':sum(r['observed']=='unsat' for r in rows),'sat':sum(r['observed']=='sat' for r in rows)}))
