from pathlib import Path
import hashlib,struct,json,importlib.util
path='/private/tmp/truss-main-integration-20261010/packages/python/src/truss/_current_query_pipe.py';spec=importlib.util.spec_from_file_location('original_current_pipe',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
f=json.loads(Path('/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/protection/live-original-integer-sum-source.json').read_text());ref=lambda e:{'documentId':'domain','moduleId':'m','elementId':e};dumps=lambda v:json.dumps(v,separators=(',',':')).encode()
sources={'policy':f['policy'],'catalog':f['catalog'],'closure':f['closure'],'ontology':f['ontology'],'associationBindings':[],'extensionSelection':None};initial=dumps({'kind':'initialize','requestId':'init','sources':sources});receipt=hashlib.sha256(struct.pack('>I',len(initial))+initial).hexdigest();routes=[{'id':'sum','use':f['sumProfile']['route']}]
pipe=module.CurrentQueryPipe(('/opt/homebrew/bin/bun','/private/tmp/umf-current-query-child-bundle-20261015-r3/current-query-child.mjs'),timeout_seconds=10)
try:
 a=json.loads(pipe.exchange(initial,source_receipt=receipt));assert a=={'kind':'initialized','requestId':'init','sourceReceipt':receipt}
 b=json.loads(pipe.exchange(dumps({'kind':'inspect-routes','requestId':'inspect','sourceReceipt':receipt,'owner':f['owner'],'routes':routes}),source_receipt=receipt));assert b['kind']=='routes-inspected' and b['routeResults'][0]['result']['status']=='inspected'
 operations=[{'id':'rules','kind':'read-rules','selection':{'type':ref('Resource')}},{'id':'cells','kind':'scan','selection':{'type':ref('Resource'),'fields':[ref('salary')]}},{'id':'original','kind':'action','request':{'action':'query-original-salary-sum','resources':[{'type':ref('Resource'),'key':[{'string':'r1'}]}],'targets':[ref('Resource')],'fields':[]}}]
 c=json.loads(pipe.exchange(dumps({'kind':'evaluate','requestId':'evaluate','sourceReceipt':receipt,'owner':f['owner'],'cut':f['logicalCut'],'operations':operations,'routes':routes}),source_receipt=receipt));assert c['kind']=='evaluation' and c['batch']['status']=='completed' and c['routeResults'][0]['result']['status']=='evaluated';assert c['batch']['authority'] is False
 assert c['batch']['operations'][2]['outcome']['rows']==[{'decision':'permit','dispositions':[]}]
 assert c['batch']['operations'][1]['outcome']['rows']==[[{'field':ref('salary'),'disposition':'transformed','outputType':ref('salaryMaskLabel'),'value':{'string':'[private]'}}]]
 assert c['routeResults'][0]['result']['plan']['use']==f['sumProfile']['route']
finally:pipe.close()
assert pipe._child.poll() is not None and pipe._cleanup_complete
Path('/private/tmp/live-original-integer-sum-child.json').write_text(json.dumps({'scope':'Actual private Python pipe to original Bun semantic child only; no DB/native issuer or protected release','sourceReceipt':receipt,'responses':[a,b,c],'fixtureSha256':hashlib.sha256(Path('/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/protection/live-original-integer-sum-source.json').read_bytes()).hexdigest(),'pipeSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'childCleanupComplete':True},indent=2)+'\n');print('Original Python pipe and semantic child: initialize/inspect/evaluate passed; child closed')
