"""Actual typed Weft packet -> original UMF child, on an explicitly supplied cut.
Host evidence only: no native source issuer, permission, SQL or guarded release.
"""
import argparse,copy,hashlib,importlib,importlib.util,json,pathlib,struct,sys,tempfile,zipfile
p=argparse.ArgumentParser();p.add_argument('--frozen',type=pathlib.Path,required=True);p.add_argument('--wheel',type=pathlib.Path,required=True);p.add_argument('--truss',type=pathlib.Path,required=True);p.add_argument('--bundle',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
WHEEL='3e9bd6f6ac42c944dd12e36ce3ea0481ca116a3ab639ef2c2ede933751ff17a8';MODULE='6b8af80b8d6da4216b1338e79e869faee4f5cd25af8500034368ef709005f523';BUNDLE='36e2c63fb0d942c9b94141f1753bcd9b56aad9e32dec5aa1a9ee27aabc674248';FROZEN='74b074b6f594df2a26bbbc8e39288ab8c261e23b7e655b1e4a786b5fdfc6cfbe'
fpath=a.frozen/'tests/current-query-designation/fixtures/original-owner-source.json';rpath=a.frozen/'tests/current-query-designation/fixtures/mixed-original-uses.request.json';pipepath=a.truss/'packages/python/src/truss/_current_query_pipe.py'
pins={str(q):sha(q.read_bytes()) for q in [pathlib.Path(__file__),a.wheel,a.bundle,fpath,rpath,pipepath,a.frozen/'source-manifest.json']};assert pins[str(a.wheel)]==WHEEL and pins[str(a.bundle)]==BUNDLE and pins[str(a.frozen/'source-manifest.json')]==FROZEN
manifest=json.loads((a.frozen/'source-manifest.json').read_text());assert all(sha((a.frozen/q).read_bytes())==h for q,h in manifest['files'].items())
f=json.loads(fpath.read_text());request=json.loads(rpath.read_text());assert pins[str(fpath)]=='2f826621bd3187857f1b4fbab5d9c818891b0df96d55d6a1d379638906e2ebda'
# The exact compiler-carried original bytes, not a reconstructed source hash.
for role in ['policy','catalog','ontology','owner']:
 source=next(x for x in request['opaqueSources'] if x['role']==role);assert sha(source['utf8'].encode())==source['sha256'] and json.loads(source['utf8'])==f[role]
for model in request['modules']:
 assert sha(model['documentJson'].encode())==model['pin']['sha256'];assert json.loads(model['documentJson'])==f['closure']['documents'][0]['document'];assert model['pin']['revision']==f['closure']['pins'][0]['revision']
spec=importlib.util.spec_from_file_location('original_truss_pipe',pipepath);pipe_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(pipe_module)
dumps=lambda x:json.dumps(x,separators=(',',':'),ensure_ascii=False).encode()
def field_ref(identity):return {'documentId':identity['documentId'],'moduleId':identity['module'],'elementId':identity['element']}
def same(a,b):return a==b
observations=[]
with tempfile.TemporaryDirectory(prefix='umf-weft-child-',dir='/private/tmp') as temp:
 root=pathlib.Path(temp)
 with zipfile.ZipFile(a.wheel) as archive:
  for entry in archive.infolist():assert (root/entry.filename).resolve().is_relative_to(root)
  archive.extractall(root)
 sys.path.insert(0,str(root));weft=importlib.import_module('weft');native=importlib.import_module('weft.weft');assert pathlib.Path(weft.__file__).resolve().is_relative_to(root);assert pathlib.Path(native.__file__).resolve().is_relative_to(root);assert sha(pathlib.Path(native.__file__).read_bytes())==MODULE;assert weft.prepare_application_lineage is native.prepare_application_lineage
 modulepins={str(q.relative_to(root)):sha(q.read_bytes()) for q in root.rglob('*') if q.suffix in ['.so','.py']}
 cases=[('mixed',request['sql'],False),('self-join','SELECT a.token FROM Resource a JOIN Resource b ON a.token=b.token',False),('false-predicate','SELECT r.salary FROM Resource r WHERE FALSE AND r.salary=100',False),('field-free-count','SELECT COUNT(*) FROM Resource r',False),('inactive-assignment',request['sql'],True)]
 for name,sql,inactive in cases:
  req=copy.deepcopy(request);req['sql']=sql;parent=weft.prepare_application_lineage(dumps(req).decode());child=parent.prepare_current_query();assert child.source_preparation() is parent
  packet=json.loads(child.native_request_json());designation=json.loads(child.designation_json());assert packet['authority'] is False and packet['securityReady'] is False
  assert packet['sourceRequestSha256']==sha(parent.source_request_json().encode());assert packet['primaryAction']==designation['primaryAction']==f['owner']['disclosure']['readAction'];assert packet['designationSha256']==sha(child.designation_json().encode());assert packet['modelPins']==[x['pin'] for x in req['modules']]
  for source in packet['sources']:
   original=next(x for x in req['opaqueSources'] if x['role']==source['role']);assert source['sha256']==original['sha256'] and source['identity']==original['identity']
  routes=[{'id':'route'+str(i),'use':route} for i,route in enumerate(packet['routes'])]
  # Packet routes are mode-free original UMF arguments, never action/mode edits.
  assert all('mode' not in x['use'] and 'originalAction' not in x['use'] for x in routes)
  initial=dumps({'kind':'initialize','requestId':'initialize','sources':{**{k:f[k] for k in ['policy','catalog','closure','ontology']},'associationBindings':[],'extensionSelection':None}});receipt=sha(struct.pack('>I',len(initial))+initial)
  pipe=pipe_module.CurrentQueryPipe(('/opt/homebrew/bin/bun',str(a.bundle)),timeout_seconds=20)
  try:
   initialized=json.loads(pipe.exchange(initial,source_receipt=receipt));assert initialized['kind']=='initialized'
   def exchange(value):return json.loads(pipe.exchange(dumps(value),source_receipt=receipt))
   inspected=exchange({'kind':'inspect-routes','requestId':'inspect','sourceReceipt':receipt,'owner':f['owner'],'routes':routes});assert inspected['kind']=='routes-inspected'
   operations=[];action_ops=[];cut=copy.deepcopy(f['logicalCut'])
   if inactive:
    active=next(x for x in cut['facts'] if x['type']['elementId']=='Assignment')['fields'];next(x for x in active if x['field']['elementId']=='active')['value']={'boolean':False}
   for scan in packet['scans']:
    selected=[]
    def add(field):
     if field not in selected:selected.append(field)
    for projection in packet['projections']:
     if projection['scan']==scan['scan']:add(field_ref(projection['field']))
    for route in inspected['routeResults']:
     result=route['result'];assert result['status']=='inspected' and result['authority'] is False and result['complete'] is False;assert result['sources']['readAction']==packet['primaryAction']
     if result['use']['scan']==scan['scan'] and not all(x['mode']=='original-authorized' for x in result['sources']['baseConstraints']):add(result['use']['field'])
    operations.append({'id':scan['scan']+'-rules','kind':'read-rules','selection':{'type':scan['type']}})
    if selected:operations.append({'id':scan['scan']+'-cells','kind':'scan','selection':{'type':scan['type'],'fields':selected}})
   for i,route in enumerate(packet['routes']):
    use=next(x for x in designation['uses'] if x['scan']==route['scan'] and x['path']==route['path']);operand=next(x['input'] for op in packet['operations'] for x in op['operands'] if x['path']==route['path']);assert use['originalAction']==operand['originalAction'];assert use['field']==route['field'] and use['target']==route['type']
    action=use['originalAction']
    if action is not None:
     resources=[{'type':x['type'],'key':x['key']} for x in cut['facts'] if x['type']==route['type']];op={'id':'action'+str(i),'kind':'action','request':{'action':action,'resources':resources,'targets':[route['type']],'fields':[]}};operations.append(op);action_ops.append(op['id'])
   evaluated=exchange({'kind':'evaluate','requestId':'evaluate','sourceReceipt':receipt,'owner':f['owner'],'cut':cut,'operations':operations,'routes':routes});assert evaluated['kind']=='evaluation';batch=evaluated['batch'];assert batch['status']=='completed' and batch['authority'] is False and batch['complete'] is False
   expected='deny' if inactive else 'permit'
   for operation in batch['operations']:
    outcome=operation['outcome'];assert outcome['authority'] is False and outcome['complete'] is False
    if operation['kind']=='read-rules':assert outcome['status']=='evaluated' and outcome['rows'] and all(x['decision']==expected for x in outcome['rows'])
    if operation['id'] in action_ops:assert outcome['status']=='evaluated' and outcome['rows'] and all(x['decision']==expected for x in outcome['rows'])
   for route_index,route in enumerate(evaluated['routeResults']):
    result=route['result'];assert result['status']=='evaluated' and result['authority'] is False and result['complete'] is False
    for row in result['rows']:
     assert row['readDecision']==expected
     if not inactive:
      assert row['selection']=='selected';branches=[x for x in result['plan']['branches'] if x['index'] in row['activeBranches']];assert branches
      for branch in branches:
       assert branch['status'] in ['requires-original-action','compatible-disclosed-properties'],branch
       if branch['status']=='requires-original-action':assert next(x for x in designation['uses'] if x['scan']==result['plan']['use']['scan'] and x['path']==result['plan']['use']['path'])['originalAction'] is not None
   if name=='field-free-count':assert not routes and not packet['projections'] and len(operations)==1
   if name=='self-join':assert len(packet['scans'])==2 and {x['use']['scan'] for x in routes}=={'s0','s1'}
   if name=='false-predicate':assert routes and action_ops # no pre-authorization constant fold
   record={'id':name,'scope':'Actual compiler metadata and original UMF computation over supplied immutable fixture cut; no native admission','packet':packet,'designation':designation,'inspection':inspected,'evaluation':evaluated,'operations':operations};(a.output/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n')
  finally:pipe.close()
  assert pipe._child.poll() is not None and pipe._cleanup_complete
  observations.append({'id':name,'routes':len(routes),'scans':len(packet['scans']),'actionOperations':len(action_ops),'expectedDecision':expected,'childCleanupComplete':True})
 assert all(sha((root/q).read_bytes())==h for q,h in modulepins.items())
assert all(sha(pathlib.Path(q).read_bytes())==h for q,h in pins.items());assert all(sha((a.frozen/q).read_bytes())==h for q,h in manifest['files'].items())
(a.output/'receipt.json').write_text(json.dumps({'status':'passed','python':sys.version,'pins':pins,'loadedModules':modulepins,'frozenFilesVerified':len(manifest['files']),'checks':observations,'nativeAdmission':False,'acceptanceCasesPromoted':[],'scope':'Actual wheel typed packet through original UMF child and Truss pipe over supplied fixture data. No SQL, native source/Subject/authority, runtime scope or guarded release; COUNT metadata is not aggregate backend admission.'},indent=2)+'\n');print(json.dumps({'status':'passed','cases':len(observations),'nativeAdmission':False}))
