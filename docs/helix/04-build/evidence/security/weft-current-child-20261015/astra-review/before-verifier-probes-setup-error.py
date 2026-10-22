import ast,copy,json,hashlib
from pathlib import Path
out=Path('/private/tmp/weft-current-child-interop-astra-20261015');source=out/'before-completeness.py';recordpath=Path('/private/tmp/weft-current-child-interop-20261015-r2/mixed.json');record=json.loads(recordpath.read_text());tree=ast.parse(source.read_text());body=None
for node in ast.walk(tree):
 if isinstance(node,ast.Try):
  start=next((i for i,x in enumerate(node.body) if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='evaluated' for t in x.targets)),None)
  stop=next((i for i,x in enumerate(node.body) if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='record' for t in x.targets)),None)
  if start is not None and stop is not None:body=node.body[start:stop];break
assert body is not None
module=ast.fix_missing_locations(ast.Module(body=body,type_ignores=[]));(out/'before-extracted-verifier.py').write_text(ast.unparse(module)+'\n');compiled=compile(module,'original-harness-actual-evaluation-verifier','exec');rows=[]
for mode in ['baseline','omit-batch-operations','omit-route-results','publish-plaintext-as-mask','wrong-resource-key','reverse-operation-order']:
 r=copy.deepcopy(record['evaluation'])
 if mode=='omit-batch-operations':r['batch']['operations']=[]
 if mode=='omit-route-results':r['routeResults']=[]
 if mode=='publish-plaintext-as-mask':
  op=next(x for x in r['batch']['operations'] if x['kind']=='scan');cell=op['outcome']['rows'][0][0];cell['disposition']='original';cell['value']={'integerToken':'100'};cell.pop('outputType',None)
 if mode=='wrong-resource-key':
  op=next(x for x in r['batch']['operations'] if x['kind']=='read-rules');op['outcome']['rows'][0]['resource']['key']=[{'string':'forged-resource'}]
 if mode=='reverse-operation-order':r['batch']['operations'].reverse()
 env=dict(exchange=lambda _:r,receipt='review-placeholder',f={'owner':{}},cut={},operations=record['operations'],routes=[{'id':'route'+str(i),'use':route} for i,route in enumerate(record['packet']['routes'])],action_ops=[x['id'] for x in record['operations'] if x['kind']=='action'],inactive=False,name='mixed',packet=record['packet'])
 try:exec(compiled,env);accepted=True;error=None
 except Exception as e:accepted=False;error=repr(e)
 rows.append(dict(mode=mode,acceptedByOriginalVerifier=accepted,error=error))
 assert accepted,(mode,error)
(out/'before-verifier-probes.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),recordSha256=hashlib.sha256(recordpath.read_bytes()).hexdigest(),scope='Exact original validation AST applied to retained actual mixed-case response; synthetic mutations, no rerun of wheel, Bun or native services.',controls=rows),indent=2)+'\n');print(json.dumps(rows))
