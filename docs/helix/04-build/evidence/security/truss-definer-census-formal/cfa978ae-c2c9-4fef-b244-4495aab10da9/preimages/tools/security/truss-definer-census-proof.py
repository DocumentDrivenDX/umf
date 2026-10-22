"""Conditional source-derived census/filter and refusal-tail laws; not SQL refinement."""
import ast,hashlib,itertools,json,sys,uuid
from pathlib import Path
from types import SimpleNamespace
import z3
ROOT=Path(__file__).resolve().parents[2]
SELF='tools/security/truss-definer-census-proof.py'
BASE='docs/helix/04-build/evidence/security/truss-operator-routes/'
NATIVE=BASE+'installed-operator-final-native.json'
MODULE=BASE+'installed-operator-final-native.preimages/packages/python/src/truss/_installed_admission_inventory.py'
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
native_bytes=(ROOT/NATIVE).read_bytes();native=json.loads(native_bytes)
paths=[SELF,NATIVE,BASE+'installed-operator-final-native.start.json',BASE+'integration.json','docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md','docs/helix/01-frame/user-stories/US-056-security-bindings.md']
paths += [BASE+'installed-operator-final-native.preimages/'+p for p in native['sourceSha256']]
frozen={p:(ROOT/p).read_bytes() for p in paths};assert frozen[NATIVE]==native_bytes
out=ROOT/'docs/helix/04-build/evidence/security/truss-definer-census-formal'/str(uuid.uuid4());out.mkdir(parents=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
pins={p:sha(b) for p,b in frozen.items()}
for p,b in frozen.items():
 t=out/'preimages'/p;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins,'argv':sys.argv},indent=2)+'\n')
def require(condition,message):
 if not condition:raise ValueError(message)
def failed(kind,error,tb):
 (out/'failed.json').write_text(json.dumps({'status':'failed','message':str(error),'sourceSha256':pins},indent=2)+'\n');sys.__excepthook__(kind,error,tb)
sys.excepthook=failed
for p,h in native['sourceSha256'].items():require(pins[BASE+'installed-operator-final-native.preimages/'+p]==h,'Native input pin mismatch')
require(all(v['expected']==v['observed'] for v in native['observations']),'Native observation mismatch')
require(len(native['observations'])==107 and len(native['inventories'])==38,'Unknown native cohort')
integration=json.loads(frozen[BASE+'integration.json']);require(integration['fileSha256']['installed-operator-final-native.json']==pins[NATIVE],'Integration receipt mismatch')
source=ast.parse(frozen[MODULE].decode());dump=lambda n:ast.dump(n,include_attributes=False)
constants={t.id:ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and isinstance(n.value,(ast.Constant,ast.Dict)) for t in n.targets if isinstance(t,ast.Name)}
sql=constants['CALLABLE_DEFINERS'];require(' '.join(sql.split())=="SELECT p.oid::text AS oid,n.oid::text AS namespace_oid, n.nspname::text AS namespace,p.proname::text AS name, p.proargtypes::text AS argument_oids,p.proowner::text AS owner_oid, r.rolname::text AS owner,p.prosecdef AS definer, pg_catalog.has_schema_privilege(:role,n.oid,'USAGE') AS namespace_usage, pg_catalog.has_function_privilege(:role,p.oid,'EXECUTE') AS executable FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.prosecdef AND pg_catalog.has_function_privilege(:role,p.oid,'EXECUTE') ORDER BY p.oid",'Unknown full census SQL');predicate=' '.join(sql.split(' WHERE ',1)[1].split())
require(predicate=="p.prosecdef AND pg_catalog.has_function_privilege(:role,p.oid,'EXECUTE') ORDER BY p.oid",'Unrecognized SQL filter')
require("FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace" in sql and "JOIN pg_catalog.pg_roles r ON r.oid=p.proowner" in sql,'Unknown census source')
fn=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='_reconcile_inventory')
selected=fn.body[-3:]
expected=ast.parse("""if sections['callable-definers'].rows:
 reasons.append('callable_definer_privilege')
if any(row[1]!=inventory.ordinary_role and (row[4] or row[5]) for row in sections['role-reachability'].rows):
 reasons.append('role_transition_privilege')
return Correspondence('scoped_mismatch' if reasons else 'scoped_match',tuple(dict.fromkeys(reasons)),UNRESOLVED)
""").body
require([dump(n) for n in selected]==[dump(n) for n in expected],'Unknown terminal guards')
for node in ast.walk(fn):
 if isinstance(node,ast.Return) and node is not selected[-1]:
  require(isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='Correspondence' and isinstance(node.value.args[0],ast.Constant) and node.value.args[0].value=='scoped_mismatch','Unmodelled early success')
require(constants['GRAMMARS']['callable-definers']==('oid','namespace_oid','namespace','name','argument_oids','owner_oid','owner','definer','namespace_usage','executable'),'Unknown row meaning')
wrapper=ast.FunctionDef(name='tail',args=ast.arguments(posonlyargs=[],args=[ast.arg(arg=x) for x in ('sections','inventory','reasons')],kwonlyargs=[],kw_defaults=[],defaults=[]),body=selected,decorator_list=[])
ns={'Correspondence':lambda result,reasons,unresolved:SimpleNamespace(result=result,reasons=reasons),'UNRESOLVED':()}
exec(compile(ast.fix_missing_locations(ast.Module(body=[wrapper],type_ignores=[])),MODULE,'exec'),ns)
D,E,N,O,P,R=z3.Bools('definer executable namespace_usage other_selected prior_reason unsafe_role')
# Translator admits this exact conjunction only. Native row completeness and true
# privilege values remain premises; namespace USAGE is not in the selected filter.
selected_row=z3.And(D,E);nonempty=z3.Or(selected_row,O);matched=z3.Not(z3.Or(nonempty,P,R))
queries=[('hidden-executable-definer-cannot-be-filtered','unsat',[D,E,z3.Not(N),z3.Not(selected_row)]),('nonempty-census-cannot-match','unsat',[nonempty,matched]),('prior-refusal-cannot-clear','unsat',[P,matched]),('empty-safe-profile-population','sat',[z3.Not(D),z3.Not(E),z3.Not(O),z3.Not(P),z3.Not(R),matched]),('hidden-operator-witness','sat',[D,E,z3.Not(N),z3.Not(P),z3.Not(R),z3.Not(matched)]),('namespace-filter-erasure','sat',[D,E,z3.Not(N),z3.Not(O),z3.Not(P),z3.Not(R),z3.Not(z3.Or(z3.And(D,E,N),O,P,R))])]
results=[]
for name,expected_result,assertions in queries:
 solver=z3.Solver();solver.add(*assertions);smt=solver.to_smt2().encode();(out/(name+'.smt2')).write_bytes(smt)
 outcome=str(solver.check());require(outcome==expected_result,'Unexpected solver result')
 independent=z3.Solver();independent.from_string(smt.decode());require(str(independent.check())==expected_result,'Independent parser mismatch')
 results.append({'id':name,'expected':expected_result,'observed':outcome,'smtSha256':sha(smt),'model':str(solver.model()) if outcome=='sat' else None})
vectors=[]
for d,e,n,o,p,r in itertools.product((False,True),repeat=6):
 rows=(('selected',),) if d and e or o else ()
 roles=(('1','ordinary',True,True,True,False),)+((('2','foreign',True,False,True,False),) if r else ())
 actual=ns['tail']({'callable-definers':SimpleNamespace(rows=rows),'role-reachability':SimpleNamespace(rows=roles)},SimpleNamespace(ordinary_role='ordinary'),['prior'] if p else [])
 require((actual.result=='scoped_match')==(not ((d and e) or o or p or r)),'Actual tail vector mismatch')
 vectors.append({'inputs':[d,e,n,o,p,r],'result':actual.result})
replays=[]
for inventory in native['inventories']:
 sections={s['name']:SimpleNamespace(rows=tuple(tuple(v) for v in s['rows'])) for s in inventory['sections']}
 result=ns['tail'](sections,SimpleNamespace(ordinary_role='inventory_ordinary'),[])
 nonempty=bool(sections['callable-definers'].rows)
 require(not nonempty or result.result=='scoped_mismatch','Native census was cleared')
 replays.append({'id':inventory['id'],'censusNonempty':nonempty,'tailResult':result.result})
for record in results:require(sha((out/(record['id']+'.smt2')).read_bytes())==record['smtSha256'],'Published SMT changed')
require(all((ROOT/p).read_bytes()==b for p,b in frozen.items()),'Source drift before publication')
receipt={'status':'pass','scope':'Exact SQL filter recognition and actual pure classifier tail, conditional on complete faithful immutable native rows; no full SQL/Python/temporal refinement','z3Version':z3.get_version_string(),'sourceSha256':pins,'queries':results,'vectors':vectors,'nativeTailReplays':replays,'qualifiedNativeImplementation':False,'acceptancePromoted':False,'limitations':['SQL completeness and PostgreSQL effective privilege semantics are premises, not solver outputs','No packet ingress, private producer authority, dependency closure, current cut or protected publication proof','Operator evidence covers only the fixed native implementation function route; planner hooks, support routines and extension/type/trigger paths remain open']}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'run':out.name,'queries':len(results),'vectors':len(vectors),'nativeTailReplays':len(replays),'status':'pass'}))
