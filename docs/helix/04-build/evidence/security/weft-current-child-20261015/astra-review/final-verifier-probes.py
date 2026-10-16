import ast,copy,json,hashlib
from pathlib import Path
from types import SimpleNamespace
out=Path('/private/tmp/weft-current-child-interop-astra-20261015');source=Path('/Users/erik/.codex/worktrees/security-main-integration/umf/tools/security/weft-current-child-interop.py');(out/'final-harness.py').write_bytes(source.read_bytes());tree=ast.parse(source.read_text());records=Path('/private/tmp/weft-current-child-interop-20261015-r6');frozen=Path('/private/tmp/weft-current-rows-frozen-20261015');fixture=json.loads((frozen/'tests/current-query-designation/fixtures/original-owner-source.json').read_text());request=json.loads((frozen/'tests/current-query-designation/fixtures/mixed-original-uses.request.json').read_text())
def target(stmt,name):return isinstance(stmt,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in stmt.targets)
def code(nodes,name):
 m=ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[]));(out/(name+'.py')).write_text(ast.unparse(m)+'\n');return compile(m,name,'exec')
casefor=next(n for n in ast.walk(tree) if isinstance(n,ast.For) and isinstance(n.target,ast.Tuple) and [x.id for x in n.target.elts if isinstance(x,ast.Name)]==['name','sql','inactive'])
start=next(i for i,n in enumerate(casefor.body) if target(n,'packet'));stop=next(i for i,n in enumerate(casefor.body) if target(n,'initial'));producer=code(casefor.body[start:stop],'final-producer-verifier')
t=next(n for n in casefor.body if isinstance(n,ast.Try));start=next(i for i,n in enumerate(t.body) if target(n,'evaluated'));stop=next(i for i,n in enumerate(t.body) if target(n,'record'));response=code(t.body[start:stop],'final-response-verifier')
helpers=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='field_ref']+[n for n in ast.walk(tree) if target(n,'mixed') or target(n,'expected_signatures')]
shared=dict(json=json,sha=lambda b:hashlib.sha256(b).hexdigest());exec(code(helpers,'final-signature-oracle'),shared)
dumps=lambda v:json.dumps(v,separators=(',',':'),ensure_ascii=False)
rows=[]
def check(name,fn,expected):
 try:fn();accepted=True;error=None
 except AssertionError as e:accepted=False;error=repr(e)
 except Exception as e:raise RuntimeError('Invalid probe setup '+name) from e
 rows.append(dict(name=name,accepted=accepted,expectedAcceptance=expected,passed=accepted==expected,error=error));assert accepted==expected,rows[-1]
def response_probe(record,mutate=lambda r:None):
 r=copy.deepcopy(record['evaluation']);mutate(r);env=dict(shared,exchange=lambda _:r,receipt='review-placeholder',f=fixture,cut=fixture['logicalCut'],operations=record['operations'],routes=[dict(id='route'+str(i),use=x) for i,x in enumerate(record['packet']['routes'])],action_ops=[x['id'] for x in record['operations'] if x['kind']=='action'],inactive=record['id']=='inactive-assignment',name=record['id'],packet=record['packet'],designation=record['designation']);exec(response,env)
def producer_probe(record,mutate=lambda p,d:None):
 p=copy.deepcopy(record['packet']);d=copy.deepcopy(record['designation']);mutate(p,d);req=copy.deepcopy(request)
 sqls={'mixed':request['sql'],'inactive-assignment':request['sql'],'self-join':'SELECT a.token FROM Resource a JOIN Resource b ON a.token=b.token','false-predicate':'SELECT r.salary FROM Resource r WHERE FALSE AND r.salary=100','field-free-count':'SELECT COUNT(*) FROM Resource r'};req['sql']=sqls[record['id']]
 child=SimpleNamespace(native_request_json=lambda:dumps(p),designation_json=lambda:dumps(d));parent=SimpleNamespace(source_request_json=lambda:dumps(req));env=dict(shared,child=child,parent=parent,f=fixture,req=req,name=record['id']);exec(producer,env)
actual={p.stem:json.loads(p.read_text()) for p in records.glob('*.json') if p.name!='receipt.json'}
for name,r in actual.items():check('response-positive-'+name,lambda r=r:response_probe(r),True);check('producer-positive-'+name,lambda r=r:producer_probe(r),True)
r=actual['mixed']
check('response-omit-batch',lambda:response_probe(r,lambda x:x['batch'].update(operations=[])),False)
check('response-omit-routes',lambda:response_probe(r,lambda x:x.update(routeResults=[])),False)
check('response-reorder-operations',lambda:response_probe(r,lambda x:x['batch']['operations'].reverse()),False)
check('response-duplicate-route',lambda:response_probe(r,lambda x:x['routeResults'].append(copy.deepcopy(x['routeResults'][0]))),False)
def plaintext(x):
 cell=next(v for v in x['batch']['operations'] if v['kind']=='scan')['outcome']['rows'][0][0];cell.update(disposition='original',value={'integerToken':'100'});cell.pop('outputType',None)
check('response-plaintext-instead-of-mask',lambda:response_probe(r,plaintext),False)
def wrongkey(x):next(v for v in x['batch']['operations'] if v['kind']=='read-rules')['outcome']['rows'][0]['resource']['key']=[{'string':'wrong'}]
check('response-wrong-resource',lambda:response_probe(r,wrongkey),False)
check('response-missing-cells',lambda:response_probe(r,lambda x:next(v for v in x['batch']['operations'] if v['kind']=='scan')['outcome'].update(rows=[])),False)
check('response-inactive-activated',lambda:response_probe(actual['inactive-assignment'],lambda x:x['routeResults'][0]['result']['rows'][0].update(selection='selected',activeBranches=[0])),False)
for name,mut in [
 ('omit-salary-projection',lambda p,d:p['projections'].pop(0)),('omit-route',lambda p,d:p['routes'].pop(0)),('duplicate-route',lambda p,d:p['routes'].append(copy.deepcopy(p['routes'][0]))),('reorder-routes',lambda p,d:p['routes'].reverse()),('omit-source',lambda p,d:p['sources'].pop()),('foreign-projection-revision',lambda p,d:p['projections'][0]['field'].update(revision='foreign')),('wrong-primary-action',lambda p,d:p.update(primaryAction='other-read')),('wrong-field-operand',lambda p,d:p['operations'][0]['operands'][0]['input']['identity'].update(element='token'))]:
 check('producer-'+name,lambda mut=mut:producer_probe(r,mut),False)
(out/'final-verifier-probes.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),scope='Exact source AST guard blocks against captured actual final reports; synthetic tampering only, not new SQL/native execution.',controls=rows),indent=2)+'\n');print(json.dumps(dict(controls=len(rows),allPassed=True)))
