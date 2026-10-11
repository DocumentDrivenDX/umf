"""Source-derived role guard laws, not a whole Python/SQL refinement proof."""
import ast, hashlib, itertools, json, sys, uuid
from pathlib import Path
from types import SimpleNamespace
import z3

ROOT=Path(__file__).resolve().parents[2]
SELF='tools/security/truss-role-transition-proof.py'
BASE='docs/helix/04-build/evidence/security/truss-installed-role-paths/'
MODULE=BASE+'source/packages/python/src/truss/_installed_admission_inventory.py'
NATIVE=BASE+'installed-role-paths-merged-native.json'
INTEGRATION=BASE+'integration.json'
CONTRACTS=['docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md',
           'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md',
           'docs/helix/01-frame/user-stories/US-056-security-bindings.md']
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:
 raise SystemExit('Exact root producer invocation required')
frozen={p:(ROOT/p).read_bytes() for p in [SELF,MODULE,NATIVE,INTEGRATION,*CONTRACTS]}
out=ROOT/'docs/helix/04-build/evidence/security/truss-role-guard-formal'/str(uuid.uuid4())
out.mkdir(parents=True)
for p,b in frozen.items():
 target=out/'preimages'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
(out/'start.json').write_text(json.dumps({'sourceSha256':pins,'argv':sys.argv},indent=2)+'\n')

def failure(kind,error,traceback):
 (out/'failed.json').write_text(json.dumps({'status':'failed','error':kind.__name__,'message':str(error),'sourceSha256':pins},indent=2)+'\n')
 sys.__excepthook__(kind,error,traceback)
sys.excepthook=failure

def require(value,message):
 if not value:raise ValueError(message)

def dump(node):return ast.dump(node,include_attributes=False)

def parsed(source):return ast.parse(source,mode='eval').body

native=json.loads(frozen[NATIVE]);integration=json.loads(frozen[INTEGRATION])
require(native['sourceSha256']['packages/python/src/truss/_installed_admission_inventory.py']==pins[MODULE], 'Original owner module pin mismatch')
require(integration['files']['installed-role-paths-merged-native.json']==pins[NATIVE], 'Original native receipt pin mismatch')
require(integration['ownerMainCommit']=='11f14e23a0fa747e6fca4fa61250fa41c78dcfef','Unknown owner source')
source=ast.parse(frozen[MODULE].decode())
fn=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='_reconcile_inventory')
guard,terminal=fn.body[-2:]
require(isinstance(guard,ast.If) and not guard.orelse and len(guard.body)==1,'Unknown guard tail')
require(dump(guard.body[0])==dump(ast.parse("reasons.append('role_transition_privilege')").body[0]),'Unknown guard reason')
require(isinstance(guard.test,ast.Call) and dump(guard.test.func)==dump(parsed('any')) and len(guard.test.args)==1 and not guard.test.keywords,'Unknown fold')
generator=guard.test.args[0]
require(isinstance(generator,ast.GeneratorExp) and len(generator.generators)==1,'Unknown fold domain')
loop=generator.generators[0]
require(isinstance(loop.target,ast.Name) and loop.target.id=='row' and isinstance(loop.target.ctx,ast.Store) and not loop.ifs and not loop.is_async
        and dump(loop.iter)==dump(parsed("sections['role-reachability'].rows")),'Filtered or foreign fold')
require(isinstance(terminal,ast.Return) and isinstance(terminal.value,ast.Call)
        and dump(terminal.value.func)==dump(parsed('Correspondence')),'Unknown terminal result')
classification=terminal.value.args[0]
require(isinstance(classification,ast.IfExp) and dump(classification.test)==dump(parsed('reasons'))
        and isinstance(classification.body,ast.Constant) and isinstance(classification.orelse,ast.Constant)
        and classification.body.value=='scoped_mismatch' and classification.orelse.value=='scoped_match','Unknown terminal classification')
for node in ast.walk(fn):
 if isinstance(node,ast.Return) and node is not terminal:
  require(isinstance(node.value,ast.Call) and dump(node.value.func)==dump(parsed('Correspondence'))
          and node.value.args and isinstance(node.value.args[0],ast.Constant)
          and node.value.args[0].value=='scoped_mismatch','Unmodelled early success return')
grammar=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign)
             and any(isinstance(t,ast.Name) and t.id=='GRAMMARS' for t in n.targets))
require(grammar['role-reachability']==('oid','name','member','immediate','settable','admin_option'),'Unknown row interpretation')

# Only this pure, structurally selected expression is translated or executed.
# It never executes the module, its SQL or its packet admission code.
name,ordinary=z3.Strings('selected_role ordinary_role')
settable,admin,other,prior=z3.Bools('selected_set selected_admin other_route prior_reason')
leaves={dump(parsed('row[1]')):name,dump(parsed('inventory.ordinary_role')):ordinary,
        dump(parsed('row[4]')):settable,dump(parsed('row[5]')):admin}
def translate(node,overrides=None):
 key=dump(node)
 if key in leaves:return (overrides or {}).get(key,leaves[key])
 if isinstance(node,ast.BoolOp):
  args=[translate(v,overrides) for v in node.values]
  if isinstance(node.op,ast.And):return z3.And(*args)
  if isinstance(node.op,ast.Or):return z3.Or(*args)
 if isinstance(node,ast.Compare) and len(node.ops)==1 and len(node.comparators)==1:
  a,b=translate(node.left,overrides),translate(node.comparators[0],overrides)
  if isinstance(node.ops[0],ast.NotEq):return a!=b
  if isinstance(node.ops[0],ast.Eq):return a==b
 raise ValueError('Unsupported actual policy expression: '+key)
actual=translate(generator.elt)
# For an arbitrary selected row, the remaining finite any() fold is an arbitrary
# Boolean. This models the exact Boolean fold law, not native completeness.
route=z3.Or(actual,other)
def result(predicate):return z3.If(z3.Or(prior,predicate),z3.StringVal(classification.body.value),z3.StringVal(classification.orelse.value))
output=result(route);allow=z3.StringVal('scoped_match')
distinct=name!=ordinary
set_only=z3.And(distinct,settable,z3.Not(admin))
admin_only=z3.And(distinct,z3.Not(settable),admin)
unsafe=z3.And(distinct,z3.Or(settable,admin))
clean=z3.And(z3.Not(prior),z3.Not(other))
no_set=translate(generator.elt,{dump(parsed('row[4]')):z3.BoolVal(False)})
no_admin=translate(generator.elt,{dump(parsed('row[5]')):z3.BoolVal(False)})
domain=z3.And(z3.Length(name)>0,z3.Length(name)<=128,z3.Length(ordinary)>0,z3.Length(ordinary)<=128,
              z3.Not(z3.Contains(name,z3.StringVal('\0'))),z3.Not(z3.Contains(ordinary,z3.StringVal('\0'))))
checks=[
 ('distinct-set-route-always-refuses',z3.And(set_only,output==allow),'unsat'),
 ('distinct-admin-route-always-refuses',z3.And(admin_only,output==allow),'unsat'),
 ('matching-unsafe-baseline-cannot-admit',z3.And(unsafe,z3.Not(prior),output==allow),'unsat'),
 ('prior-refusal-cannot-be-cleared',z3.And(prior,output==allow),'unsat'),
 ('ordinary-self-set-is-not-distinct-authority',z3.And(clean,name==ordinary,settable,z3.Not(admin),output!=allow),'unsat'),
 ('membership-only-scoped-match-population',z3.And(clean,distinct,z3.Not(settable),z3.Not(admin),output==allow),'sat'),
 ('set-only-scoped-refusal-population',z3.And(clean,set_only,output!=allow),'sat'),
 ('admin-only-scoped-refusal-population',z3.And(clean,admin_only,output!=allow),'sat'),
 ('erase-set-guard-admits-set-route',z3.And(clean,set_only,result(z3.Or(no_set,other))==allow),'sat'),
 ('erase-admin-guard-admits-admin-route',z3.And(clean,admin_only,result(z3.Or(no_admin,other))==allow),'sat'),
 ('erase-policy-append-admits-matching-unsafe-baseline',z3.And(clean,unsafe,result(z3.BoolVal(False))==allow),'sat'),
]
queries=[]; saved_formulas={}
for key,formula,expected in checks:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(domain,formula)
 smt=solver.sexpr();observed=str(solver.check());require(observed==expected,key+': '+observed)
 replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt)
 require(str(replay.check())==expected,key+': replay')
 formula_bytes=(smt+'\n(check-sat)\n').encode()
 saved_formulas[key+'.smt2']=formula_bytes
 (out/(key+'.smt2')).write_bytes(formula_bytes)
 queries.append({'id':key,'smtFile':key+'.smt2','smtSha256':hashlib.sha256(formula_bytes).hexdigest(),'expected':expected,'observed':observed,'replay':expected,
                 'witness':str(solver.model()) if expected=='sat' else None})

# Cross-check the restricted translator against actual Python expression execution
# for all32 distinct/self, SET, ADMIN, other-route and prior-reason combinations.
expression=ast.Expression(generator.elt);ast.fix_missing_locations(expression)
code=compile(expression,MODULE,'eval');vectors=[]
for different,s,a,o,p in itertools.product((False,True),repeat=5):
 row=('1','foreign' if different else 'ordinary',True,False,s,a)
 py=eval(code,{'__builtins__':{}},{'row':row,'inventory':SimpleNamespace(ordinary_role='ordinary')})
 require(type(py) is bool,'Nonboolean actual predicate')
 concrete=z3.simplify(z3.substitute(actual,(name,z3.StringVal(row[1])),(ordinary,z3.StringVal('ordinary')),
                                    (settable,z3.BoolVal(s)),(admin,z3.BoolVal(a))))
 require(z3.is_true(concrete)==py and (z3.is_true(concrete) or z3.is_false(concrete)),'Translator truth-table mismatch')
 expected='scoped_mismatch' if p or py or o else 'scoped_match'
 symbolic=z3.simplify(z3.substitute(output,(name,z3.StringVal(row[1])),(ordinary,z3.StringVal('ordinary')),
                     (settable,z3.BoolVal(s)),(admin,z3.BoolVal(a)),(other,z3.BoolVal(o)),(prior,z3.BoolVal(p))))
 require(symbolic.as_string()==expected,'Terminal fold mismatch')
 vectors.append({'different':different,'set':s,'admin':a,'other':o,'prior':p,'result':expected})

# Replay only the policy predicate over original native rows, not SQL effects.
native_rows=[]
for packet in native['inventories']:
 section=next(s for s in packet['sections'] if s['name']=='role-reachability')
 require(tuple(section['columns'])==grammar['role-reachability'],'Foreign native columns')
 original_rows=section['rows'];answers=[]
 for row in original_rows:
  require(len(row)==6 and all(type(row[i]) is bool for i in (2,3,4,5)),'Native row grammar')
  answers.append(eval(code,{'__builtins__':{}},{'row':row,'inventory':SimpleNamespace(ordinary_role='inventory_ordinary')}))
 native_rows.append({'id':packet['id'],'rows':len(original_rows),'rolePolicyRefusal':any(answers)})
for key in ('direct-set-only','indirect-set-only','admin-only'):
 require(next(r for r in native_rows if r['id']==key)['rolePolicyRefusal'],key+': native policy witness')
require(not next(r for r in native_rows if r['id']=='membership-only')['rolePolicyRefusal'],'Membership-only witness')
require(all((ROOT/p).read_bytes()==b for p,b in frozen.items()),'Source drift')
require(all((out/p).read_bytes()==b for p,b in saved_formulas.items()),'Saved formula drift')
receipt={'status':'conditional-source-guard-proof-passed','solverVersion':z3.get_version_string(),
 'scope':'Actual source-derived pointwise predicate and finite Boolean any-fold/terminal laws. Not a whole Python, packet-admission, PostgreSQL role graph, native effect, temporal cut or compiler refinement proof.',
 'sourceSha256':pins,'ownerMainCommit':integration['ownerMainCommit'],'actualPredicate':ast.unparse(generator.elt),
 'guardReason':'role_transition_privilege','queries':queries,'truthTable':vectors,'nativePolicyReplay':native_rows,
 'assumptions':['Execution reaches the selected tail; all prior successes are excluded by the source-shape check',
  'Analysis assumes complete finite immutable role rows, exact strings and exact Boolean fields; packet shape admission does not establish native completeness',
  'Selected role names are nonempty NUL-free strings within the retained128-character ordinary-role bound (a superset of native identifier lengths)',
  'Native SET/ADMIN facts are faithful and current; their authentication/completeness/coherent cut is not proved',
  'Other rows fold through Python any with this exact predicate; other_route abstracts their Boolean disjunction',
  'Prior reasons abstract every preceding refusal, including baseline drift; reasons are not removed after this tail'],
 'criteria':['US-056-AC5','US-056-AC9','US-056-AC10'],'originalRequiredCases':132,'acceptancePromoted':False,
 'nativeEvidence':'Retained63-observation PG16.15/pg8000 1.31.5 fixture supplies independent direct/indirect SET and ADMIN-only effect witnesses; this producer does not rerun native SQL.'}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'directory':str(out.relative_to(ROOT)),'queries':len(queries),'unsat':sum(q['observed']=='unsat' for q in queries),'sat':sum(q['observed']=='sat' for q in queries),'truthVectors':len(vectors),'nativeInventories':len(native_rows),'status':receipt['status']}))
