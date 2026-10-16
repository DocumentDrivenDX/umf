"""Actual explicit SUM typed Weft packet -> original UMF child, on an explicitly supplied cut.
Host evidence only: no native source issuer, permission, SQL or guarded release.
"""
import argparse,copy,hashlib,importlib,importlib.util,json,pathlib,struct,sys,tempfile,zipfile
p=argparse.ArgumentParser();p.add_argument('--frozen',type=pathlib.Path,required=True);p.add_argument('--wheel',type=pathlib.Path,required=True);p.add_argument('--truss',type=pathlib.Path,required=True);p.add_argument('--bundle',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
WHEEL='a2fe09d2a8d7bc240cf0ab0be385a77b087dcb98c96da6039c831c825ab03964';MODULE='412e591c0dbf11efefefca7e075eb633104b2e025c3d972ad6620ea235e32691';BUNDLE='36e2c63fb0d942c9b94141f1753bcd9b56aad9e32dec5aa1a9ee27aabc674248';FROZEN='e786d5433afc9af0d8f1615130fcdd4ae6ae6d6f05519f4037e61b621b3eb4c0'
fpath=a.frozen/'tests/current-query-designation/fixtures/original-live-sum-owner-source.json';rpath=a.frozen/'tests/current-query-designation/fixtures/live-original-integer-sum.request.json';pipepath=a.truss/'packages/python/src/truss/_current_query_pipe.py'
pins={str(q):sha(q.read_bytes()) for q in [pathlib.Path(__file__),a.wheel,a.bundle,fpath,rpath,pipepath,a.frozen/'source-manifest.json']};assert pins[str(a.wheel)]==WHEEL and pins[str(a.bundle)]==BUNDLE and pins[str(a.frozen/'source-manifest.json')]==FROZEN
manifest=json.loads((a.frozen/'source-manifest.json').read_text());assert all(sha((a.frozen/q).read_bytes())==h for q,h in manifest['files'].items())
f=json.loads(fpath.read_text());request=json.loads(rpath.read_text());assert pins[str(fpath)]=='d9a87aa6b230eacf38b7b56451725cdf226a492610c2872c585008badd8c7b15'
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
 cases=[('sum',request['sql'],False),('grouped-sum','SELECT r.token,SUM(r.salary) AS total FROM Resource r GROUP BY r.token',False),('false-sum','SELECT SUM(r.salary) AS total FROM Resource r WHERE FALSE',False),('inactive-sum',request['sql'],True),('field-free-count','SELECT COUNT(*) FROM Resource r',False)]
 scalar=([('s0','Resource')],[],[('s0','outputs/0/argument','salary','aggregate','sum',['nullity'])],['query-original-salary-sum'])
 expected_signatures={'sum':scalar,'false-sum':scalar,'inactive-sum':scalar,'grouped-sum':([('s0','Resource')],[('s0','outputs/0/expression','token')],[('s0','groups/0','token','group','group',['equality']),('s0','outputs/1/argument','salary','aggregate','sum',['nullity'])],[None,'query-original-salary-sum']),'field-free-count':([('s0','Resource')],[],[],[])}
 for name,sql,inactive in cases:
  req=copy.deepcopy(request);req['sql']=sql;parent=weft.prepare_application_lineage(dumps(req).decode());child=parent.prepare_current_query();assert child.source_preparation() is parent
  packet=json.loads(child.native_request_json());designation=json.loads(child.designation_json());assert packet['authority'] is False and packet['securityReady'] is False
  assert packet['version']=='weft.current-query.native-input/0.2-candidate' and packet['capabilities']==['live-original-integer-sum']
  def operand(path,element,action):
   return {'path':path,'input':{'kind':'field','scan':'s0','identity':{'documentId':'domain','revision':'query-value-core-r1','module':'m','element':element},'logicalType':{'family':'integer','facets':{'integerWidth':{'bits':64,'signed':True}},'nullable':False} if element=='salary' else {'family':'string','facets':{},'nullable':False},'originalAction':action}}
  def operation(path,kind,operator=None,operands=None,output=None,boolean=None):return {'path':path,'kind':kind,'operator':operator,'operands':operands or [],'outputType':output,'boolean':boolean,'direction':None}
  grouped=name=='grouped-sum'
  sum_path='outputs/1' if grouped else 'outputs/0'
  sums=[operation(sum_path,'sum','aggregate',[operand(sum_path+'/argument','salary','query-original-salary-sum')],{'family':'integer','facets':{},'nullable':not grouped})]
  expected_operations=([operation('groups/0','group','group',[operand('groups/0','token',None)])] if grouped else [])+sums
  if name=='false-sum':expected_operations.insert(0,operation('filters/0','boolean',boolean=False))
  if name=='field-free-count':expected_operations=[operation('outputs/0','count',output={'family':'integer','facets':{},'nullable':False})]
  assert packet['operations']==expected_operations
  assert packet['sourceRequestSha256']==sha(parent.source_request_json().encode());assert packet['primaryAction']==designation['primaryAction']==f['owner']['disclosure']['readAction'];assert packet['designationSha256']==sha(child.designation_json().encode());assert packet['modelPins']==[x['pin'] for x in req['modules']]
  assert packet['sources']==designation['sources']
  assert [x['role'] for x in packet['sources']]==['policy','ontology','catalog','owner']
  for source in packet['sources']:
   original=next(x for x in req['opaqueSources'] if x['role']==source['role']);assert source['sha256']==original['sha256'] and source['identity']==original['identity']
  expected_scans,expected_projections,expected_routes,expected_actions=expected_signatures[name]
  assert [(x['scan'],x['type']['elementId']) for x in packet['scans']]==expected_scans
  assert [(x['scan'],x['path'],x['field']['element']) for x in packet['projections']]==expected_projections
  assert [(x['scan'],x['path'],x['field']['elementId'],x['operator'],x['operation'],x['required']) for x in packet['routes']]==expected_routes
  assert [x['originalAction'] for x in designation['uses']]==expected_actions
  for scan in packet['scans']:assert scan['type']=={'documentId':'domain','moduleId':'m','elementId':'Resource'} and scan['record']=={'documentId':'domain','revision':'query-value-core-r1','module':'m','element':'Resource'}
  for projection in packet['projections']:assert projection['field']=={'documentId':'domain','revision':'query-value-core-r1','module':'m','element':projection['field']['element']}
  fields=[(op,x) for op in packet['operations'] for x in op['operands'] if x['input']['kind']=='field']
  assert len(fields)==len(packet['routes'])==len(designation['uses'])
  assert [(x['scan'],x['path']) for x in packet['routes']]==[(x['input']['scan'],x['path']) for _,x in fields]
  assert [(x['scan'],x['path']) for x in designation['uses']]==[(x['scan'],x['path']) for x in packet['routes']]
  for route,(operation,operand) in zip(packet['routes'],fields):
   assert route['field']==field_ref(operand['input']['identity']) and route['operator']==operation['operator'] and route['operation']==operation['kind']
  routes=[{'id':'route'+str(i),'use':route} for i,route in enumerate(packet['routes'])]
  # Packet routes are mode-free original UMF arguments, never action/mode edits.
  assert all('mode' not in x['use'] and 'originalAction' not in x['use'] for x in routes)
  initial=dumps({'kind':'initialize','requestId':'initialize','sources':{**{k:f[k] for k in ['policy','catalog','closure','ontology']},'associationBindings':[],'extensionSelection':None}});receipt=sha(struct.pack('>I',len(initial))+initial)
  pipe=pipe_module.CurrentQueryPipe(('/opt/homebrew/bin/bun',str(a.bundle)),timeout_seconds=20)
  try:
   initialized=json.loads(pipe.exchange(initial,source_receipt=receipt));assert initialized['kind']=='initialized'
   def exchange(value):return json.loads(pipe.exchange(dumps(value),source_receipt=receipt))
   inspected=exchange({'kind':'inspect-routes','requestId':'inspect','sourceReceipt':receipt,'owner':f['owner'],'routes':routes});assert inspected['kind']=='routes-inspected';assert [x['id'] for x in inspected['routeResults']]==[x['id'] for x in routes];assert [x['result']['use'] for x in inspected['routeResults']]==packet['routes']
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
    assert selected==([{'documentId':'domain','moduleId':'m','elementId':'token'}] if grouped else [])
    operations.append({'id':scan['scan']+'-rules','kind':'read-rules','selection':{'type':scan['type']}})
    operations.append({'id':scan['scan']+'-cells','kind':'scan','selection':{'type':scan['type'],'fields':selected}})
   for i,route in enumerate(packet['routes']):
    use=next(x for x in designation['uses'] if x['scan']==route['scan'] and x['path']==route['path']);operand=next(x['input'] for op in packet['operations'] for x in op['operands'] if x['path']==route['path']);assert use['originalAction']==operand['originalAction'];assert use['field']==route['field'] and use['target']==route['type']
    action=use['originalAction']
    if action is not None:
     resources=[{'type':x['type'],'key':x['key']} for x in cut['facts'] if x['type']==route['type']];op={'id':'action'+str(i),'kind':'action','request':{'action':action,'resources':resources,'targets':[route['type']],'fields':[]}};operations.append(op);action_ops.append(op['id'])
   evaluated=exchange({'kind':'evaluate','requestId':'evaluate','sourceReceipt':receipt,'owner':f['owner'],'cut':cut,'operations':operations,'routes':routes});assert evaluated['kind']=='evaluation';batch=evaluated['batch'];assert batch['status']=='completed' and batch['authority'] is False and batch['complete'] is False
   assert [(x['id'],x['kind']) for x in batch['operations']]==[(x['id'],x['kind']) for x in operations]
   assert [x['id'] for x in evaluated['routeResults']]==[x['id'] for x in routes]
   assert [x['result']['plan']['use'] for x in evaluated['routeResults']]==packet['routes']
   expected='deny' if inactive else 'permit'
   for operation in batch['operations']:
    outcome=operation['outcome'];assert outcome['authority'] is False and outcome['complete'] is False
    if operation['kind']=='read-rules':
     assert outcome['status']=='evaluated' and len(outcome['rows'])==1 and all(x['decision']==expected for x in outcome['rows']);assert [x['resource'] for x in outcome['rows']]==[{'type':packet['scans'][0]['type'],'key':[{'string':'r1'}]}]
    if operation['kind']=='scan':
     selected=next(x for x in operations if x['id']==operation['id'])['selection']['fields'];cells=[]
     for field in selected:
      if field['elementId']=='salary':cells.append({'field':field,'disposition':'transformed','outputType':{**field,'elementId':'salaryMaskLabel'},'value':{'string':'[private]'}})
      elif field['elementId']=='token':cells.append({'field':field,'disposition':'original','value':{'string':'opaque-token'}})
      else:raise AssertionError('Unexpected fixture Field')
     assert outcome['status']=='rendered' and outcome['rows']==([] if inactive else [cells]);assert outcome['valueProfiles']==[]
     rules=next(x['outcome'] for x in batch['operations'] if x['id']==operation['id'].replace('-cells','-rules'));assert len(outcome['rows'])==sum(x['decision']=='permit' for x in rules['rows'])
    if operation['id'] in action_ops:assert outcome['status']=='evaluated' and len(outcome['rows'])==1 and all(x['decision']==expected for x in outcome['rows'])
   for route_index,route in enumerate(evaluated['routeResults']):
    result=route['result'];assert result['status']=='evaluated' and result['authority'] is False and result['complete'] is False
    assert len(result['plan']['branches'])==1
    branch=result['plan']['branches'][0];is_sum=result['plan']['use']['operation']=='sum'
    assert branch['status']==('requires-original-action' if is_sum else 'compatible-disclosed-properties')
    assert branch['queryValue']=={'origin':'live-field','field':{'documentId':'domain','moduleId':'m','elementId':'salary' if is_sum else 'token'}}
    assert branch['projection']=={'kind':'transformed' if is_sum else 'original','field':{'documentId':'domain','moduleId':'m','elementId':'salaryMaskLabel' if is_sum else 'token'}}
    assert branch['conflictingModes'] is False
    assert [c['mode'] for c in branch['constraints']]==(['original-authorized','original-authorized'] if is_sum else ['disclosed','disclosed'])
    assert len(result['rows'])==1 and result['rows'][0]['resource']=={'type':packet['scans'][0]['type'],'key':[{'string':'r1'}]}
    for row in result['rows']:
     assert row['readDecision']==expected
     if inactive:assert row['selection']=='read-denied' and row['activeBranches']==[]
     if not inactive:
      assert row['activeBranches']==[0]
      assert row['selection']=='selected';branches=[x for x in result['plan']['branches'] if x['index'] in row['activeBranches']];assert branches
      for branch in branches:
       assert branch['status'] in ['requires-original-action','compatible-disclosed-properties'],branch
       if branch['status']=='requires-original-action':assert next(x for x in designation['uses'] if x['scan']==result['plan']['use']['scan'] and x['path']==result['plan']['use']['path'])['originalAction'] is not None
   if name=='field-free-count':assert not routes and not packet['projections'] and len(operations)==2 and operations[1]['selection']['fields']==[]
   if name=='false-sum':assert routes and action_ops # no pre-authorization constant fold
   if name in ['sum','false-sum','inactive-sum']:assert operations[1]['selection']['fields']==[] # original-only operand is never public salary rendering
   record={'id':name,'scope':'Actual compiler metadata and original UMF computation over supplied immutable fixture cut; no native admission','packet':packet,'designation':designation,'inspection':inspected,'evaluation':evaluated,'operations':operations};(a.output/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n')
  finally:pipe.close()
  assert pipe._child.poll() is not None and pipe._cleanup_complete
  observations.append({'id':name,'routes':len(routes),'scans':len(packet['scans']),'actionOperations':len(action_ops),'expectedDecision':expected,'childCleanupComplete':True})
 # Actual producer controls: no action borrowed across operation selectors, and no
 # capability fallback when the SUM declaration itself is missing.
 distinct=copy.deepcopy(request);distinct['sql']='SELECT COUNT(DISTINCT r.salary) AS n FROM Resource r'
 distinct_child=weft.prepare_application_lineage(dumps(distinct).decode()).prepare_current_query()
 distinct_designation=json.loads(distinct_child.designation_json());assert len(distinct_designation['uses'])==1
 assert distinct_designation['uses'][0]['operation']=='countDistinct' and distinct_designation['uses'][0]['originalAction'] is None
 missing=copy.deepcopy(request);source=next(x for x in missing['opaqueSources'] if x['role']=='query-designation');profile=json.loads(source['utf8']);profile['bindings']=[x for x in profile['bindings'] if x['operation']!='sum'];source['utf8']=dumps(profile).decode();source['sha256']=sha(source['utf8'].encode())
 try:weft.prepare_application_lineage(dumps(missing).decode()).prepare_current_query()
 except ValueError as error:assert str(error).startswith('WFT-CURRENT-QUERY-OPERANDS:'),str(error)
 else:raise AssertionError('SUM admitted without its original action designation')
 (a.output/'producer-controls.json').write_text(json.dumps({'countDistinctDoesNotBorrowSumAction':distinct_designation,'missingSumDesignationRefused':True,'scope':'Compiler declaration checks only; no original permission or native authority'},indent=2)+'\n')
 assert all(sha((root/q).read_bytes())==h for q,h in modulepins.items())
assert all(sha(pathlib.Path(q).read_bytes())==h for q,h in pins.items());assert all(sha((a.frozen/q).read_bytes())==h for q,h in manifest['files'].items())
(a.output/'receipt.json').write_text(json.dumps({'status':'passed','python':sys.version,'pins':pins,'loadedModules':modulepins,'frozenFilesVerified':len(manifest['files']),'checks':observations,'nativeAdmission':False,'acceptanceCasesPromoted':[],'scope':'Actual wheel typed packet through original UMF child and Truss pipe over supplied fixture data. No SQL, native source/Subject/authority, runtime scope or guarded release; SUM metadata and supplied-cut decisions are not native aggregate admission or exact SQL accumulation.'},indent=2)+'\n');print(json.dumps({'status':'passed','cases':len(observations),'nativeAdmission':False}))
