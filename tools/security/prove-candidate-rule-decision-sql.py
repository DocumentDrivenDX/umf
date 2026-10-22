"""Interpret actual parsed decision SQL in a closed, total-predicate subset."""
import copy,hashlib,json
from pathlib import Path
import z3
SELF=Path('tools/security/prove-candidate-rule-decision-sql.py')
BASIS=Path('docs/helix/04-build/evidence/security/candidate-rule-decision-proof-input.json')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown decision SQL proof source')
basis=json.loads(BASIS.read_text())
sources={**basis['sourceDigests'],str(SELF):hashlib.sha256(SELF.read_bytes()).hexdigest(),str(BASIS):hashlib.sha256(BASIS.read_bytes()).hexdigest()}
if basis['status']!='passed' or any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Stale parser/emitter basis')
def obj(value,keys):
 if not isinstance(value,dict) or set(value)!=set(keys):raise RuntimeError('Unsupported AST object: '+str(value))
 return value
def node(value,name):return obj(value,[name])[name]
def names(value):
 result=[]
 for v in value:
  token=obj(node(v,'String'),['sval'])['sval']
  if not isinstance(token,str):raise RuntimeError('Non-string identifier')
  result.append(token)
 return result
def column(value,name):
 c=obj(node(value,'ColumnRef'),['fields'])
 if names(c['fields'])!=[name]:raise RuntimeError('Foreign column')
def text(value):
 if 'CollateClause' in value:
  c=obj(node(value,'CollateClause'),['arg','collname'])
  if names(c['collname'])!=['pg_catalog','C']:raise RuntimeError('Foreign collation')
  value=c['arg']
 c=obj(node(value,'TypeCast'),['arg','typeName']);t=obj(c['typeName'],['names','typemod'])
 if names(t['names'])!=['pg_catalog','text'] or t['typemod']!=-1:raise RuntimeError('Foreign cast')
 return obj(obj(node(c['arg'],'A_Const'),['sval'])['sval'],['sval'])['sval']
R=z3.DeclareSort('DecisionRule');r=z3.Const('r',R)
present=z3.Function('present',R,z3.BoolSort());effect=z3.Function('effect',R,z3.IntSort());truth=z3.Function('truth',R,z3.IntSort())
# Effects permit/require/forbid = 0/1/2; truth False/True/NULL = 0/1/2.
premises=[z3.ForAll(r,z3.And(effect(r)>=0,effect(r)<=2,truth(r)>=0,truth(r)<=2))]
counter=0
def predicate(value,row=None):
 global counter
 if 'BoolExpr' in value:
  b=obj(node(value,'BoolExpr'),['boolop','args']);args=[predicate(v,row) for v in b['args']]
  if b['boolop']=='NOT_EXPR' and len(args)==1:return z3.Not(args[0])
  if b['boolop']=='AND_EXPR' and len(args)>=2:return z3.And(*args)
  if b['boolop']=='OR_EXPR' and len(args)>=2:return z3.Or(*args)
  raise RuntimeError('Unsupported Boolean operator')
 if 'SubLink' in value:
  if row is not None:raise RuntimeError('Nested/correlated SELECT unsupported')
  s=obj(node(value,'SubLink'),['subLinkType','subselect'])
  if s['subLinkType']!='EXISTS_SUBLINK':raise RuntimeError('Unsupported sublink')
  q=obj(node(s['subselect'],'SelectStmt'),['targetList','fromClause','whereClause','limitOption','op'])
  if q['limitOption']!='LIMIT_OPTION_DEFAULT' or q['op']!='SETOP_NONE' or len(q['targetList'])!=1 or len(q['fromClause'])!=1:raise RuntimeError('Unsupported SELECT')
  if q['targetList']!=[{'ResTarget':{'val':{'A_Const':{'ival':{'ival':1}}}}}]:raise RuntimeError('Unsupported EXISTS target')
  if q['fromClause']!=[{'RangeVar':{'relname':'candidate_rule_truths','inh':True,'relpersistence':'p'}}]:raise RuntimeError('Foreign truth relation')
  counter+=1;bound=z3.Const('sql_rule_'+str(counter),R)
  return z3.Exists(bound,z3.And(present(bound),predicate(q['whereClause'],bound)))
 if row is None:raise RuntimeError('Column outside truth relation')
 if 'NullTest' in value:
  n=obj(node(value,'NullTest'),['arg','nulltesttype']);column(n['arg'],'truth')
  if n['nulltesttype']!='IS_NULL':raise RuntimeError('Unsupported NULL test')
  return truth(row)==2
 if 'BooleanTest' in value:
  b=obj(node(value,'BooleanTest'),['arg','booltesttype']);column(b['arg'],'truth')
  if b['booltesttype']=='IS_TRUE':return truth(row)==1
  if b['booltesttype']=='IS_NOT_TRUE':return truth(row)!=1
  raise RuntimeError('Unsupported truth test')
 a=obj(node(value,'A_Expr'),['kind','name','lexpr','rexpr']);column(a['lexpr'],'effect')
 if a['kind']!='AEXPR_OP' or names(a['name'])!=['pg_catalog','=']:raise RuntimeError('Foreign operator')
 if 'CollateClause' not in a['rexpr']:raise RuntimeError('Effect comparison lacks explicit C collation')
 token=text(a['rexpr'])
 if token not in ['permit','require','forbid']:raise RuntimeError('Unknown effect')
 return effect(row)==['permit','require','forbid'].index(token)
def result(value):
 if 'CaseExpr' not in value:
  token=text(value)
  if token not in ['permit','deny','indeterminate']:raise RuntimeError('Unknown decision')
  return z3.IntVal(['permit','deny','indeterminate'].index(token))
 c=obj(node(value,'CaseExpr'),['args','defresult']);out=result(c['defresult'])
 if not c['args']:raise RuntimeError('Empty CASE')
 for branch in reversed(c['args']):
  b=obj(node(branch,'CaseWhen'),['expr','result']);out=z3.If(predicate(b['expr']),result(b['result']),out)
 return out
def expression(ast):
 a=obj(ast,['version','stmts'])
 if a['version']!=170004 or len(a['stmts'])!=1:raise RuntimeError('Foreign parser profile')
 q=obj(node(obj(a['stmts'][0],['stmt'])['stmt'],'SelectStmt'),['targetList','limitOption','op'])
 if q['limitOption']!='LIMIT_OPTION_DEFAULT' or q['op']!='SETOP_NONE' or len(q['targetList'])!=1:raise RuntimeError('Unsupported top SELECT')
 target=obj(node(q['targetList'][0],'ResTarget'),['name','val'])
 if target['name']!='decision':raise RuntimeError('Foreign output')
 return target['val']
profiles=basis['artifacts'];nonempty=[a for a in profiles if a['ruleIds']];empty=[a for a in profiles if not a['ruleIds']]
if len(nonempty)!=6 or len(empty)!=1 or len({json.dumps(a['decisionAst'],sort_keys=True) for a in nonempty})!=1:raise RuntimeError('Unexpected emitted decision profiles')
actual_ast=expression(nonempty[0]['decisionAst']);actual=result(actual_ast)
refusals=[]
def first(value,name):
 if isinstance(value,dict):
  if name in value:return value[name]
  for child in value.values():
   found=first(child,name)
   if found is not None:return found
 elif isinstance(value,list):
  for child in value:
   found=first(child,name)
   if found is not None:return found
 return None
for name in ['uncollated-effect','unknown-string-member','foreign-relation','foreign-operator']:
 mutant=copy.deepcopy(actual_ast)
 if name=='uncollated-effect':
  a=first(mutant,'A_Expr');a['rexpr']=a['rexpr']['CollateClause']['arg']
 elif name=='unknown-string-member':first(mutant,'String')['future']=True
 elif name=='foreign-relation':first(mutant,'RangeVar')['relname']='foreign_truths'
 else:first(mutant,'A_Expr')['name'][0]['String']['sval']='public'
 try:result(mutant)
 except RuntimeError:refusals.append({'id':name,'refused':True})
 else:raise RuntimeError('Unsupported AST accepted: '+name)
unknown=z3.Exists(r,z3.And(present(r),truth(r)==2))
grant=z3.And(z3.Exists(r,z3.And(present(r),effect(r)==0,truth(r)==1)),z3.ForAll(r,z3.Implies(z3.And(present(r),effect(r)==1),truth(r)==1)),z3.ForAll(r,z3.Implies(z3.And(present(r),effect(r)==2),truth(r)==0)))
semantic=z3.If(unknown,2,z3.If(grant,0,1))
queries=[]
def check(name,assertion,expected):
 s=z3.Solver();s.set(timeout=20000);s.add(*premises,assertion);smt=s.sexpr();observed=str(s.check())
 if observed!=expected:raise RuntimeError(name+': '+observed)
 replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);replayed=str(replay.check())
 if replayed!=expected:raise RuntimeError('Replay differs')
 queries.append({'id':name,'smt':smt,'result':observed,'replayResult':replayed,'model':str(s.model()) if observed=='sat' else None})
check('actual-parsed-decision-unbounded-correspondence',actual!=semantic,'unsat')
check('actual-empty-selection-denies',result(expression(empty[0]['decisionAst']))!=1,'unsat')
check('actual-unknown-priority-refuses',z3.And(unknown,actual!=2),'unsat')
check('actual-no-permit-denies-known-population',z3.And(z3.Not(unknown),z3.Not(z3.Exists(r,z3.And(present(r),effect(r)==0,truth(r)==1))),actual!=1),'unsat')
check('actual-nonempty-permit-positive',z3.And(actual==0,z3.Exists(r,z3.And(present(r),effect(r)==0,truth(r)==1))),'sat')
mutant=copy.deepcopy(actual_ast);mutant['CaseExpr']['args'].pop(0)
check('removed-unknown-case-actual-ast-control',z3.And(unknown,result(mutant)!=semantic),'sat')
mutant=copy.deepcopy(actual_ast)
def weaken(value):
 if isinstance(value,dict):
  if 'BooleanTest' in value and value['BooleanTest']['booltesttype']=='IS_NOT_TRUE':value['BooleanTest']['booltesttype']='IS_TRUE'
  for child in value.values():weaken(child)
 elif isinstance(value,list):
  for child in value:weaken(child)
weaken(mutant)
check('inverted-require-test-actual-ast-control',z3.And(z3.Not(unknown),result(mutant)!=semantic),'sat')
check('nonempty-denied-positive',z3.And(actual==1,z3.Not(unknown),z3.Exists(r,z3.And(present(r),effect(r)==0,truth(r)==1)),z3.Exists(r,z3.And(present(r),effect(r)==2,truth(r)==1))),'sat')
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Captured source changed')
receipt={'status':'conditional-proof-passed','sourcesUnchanged':True,'sourceDigests':sources,'solverVersion':z3.get_version_string(),'queries':queries,'refusals':refusals,'profiles':[a['id'] for a in profiles],'nativeImplementationQualified':False,'covers':['US-056-AC2'],'scope':'Actual parsed emitted decision SELECT for six retained nonempty profiles and empty selection. Closed AST interpreter admits only CASE, EXISTS over candidate_rule_truths, total Boolean/NULL tests, qualified pg_catalog text equality and C-collated effect literals. Unbounded abstract complete faithful truth rows with nonnull known effect tokens and False/True/NULL truth; proves decision-body correspondence to an independently stated semantic fold. Trusted parser behavior and the AST interpreter SQL denotation are premises. Does not prove CTE condition compilation/evaluation, arbitrary emitter inputs or ASTs, database name/operator/type resolution outside this qualified subset, source/cut authority, disclosure, native execution or authorization.'}
Path('docs/helix/04-build/evidence/security/candidate-rule-decision-sql-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
