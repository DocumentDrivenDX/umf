"""Actual Weft projection packets -> versioned original UMF child via original Truss pipe.
Supplied logical cut only. No SQL, native admission, selected scalar or guarded release.
"""
import argparse,copy,hashlib,importlib,importlib.util,io,json,pathlib,struct,sys,tempfile,zipfile
p=argparse.ArgumentParser()
for key in ['producer','wheel','pipe','bundle','manifest','fixture','output']:p.add_argument('--'+key,type=pathlib.Path,required=True)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
dumps=lambda x:json.dumps(x,separators=(',',':'),ensure_ascii=False).encode()
protocol='umf.security.private-query-child/0.2-candidate'
paths=[pathlib.Path(__file__),a.wheel,a.pipe,a.bundle,a.manifest,a.fixture,*sorted(a.producer.glob('*.json'))]
captured={str(q.resolve()):q.read_bytes() for q in paths}
pins={q:sha(raw) for q,raw in captured.items()}
def captured_bytes(path):return captured[str(path.resolve())]
producer=json.loads(captured_bytes(a.producer/'receipt.json'));manifest=json.loads(captured_bytes(a.manifest))
assert manifest['protocol']==manifest['profile']==protocol and manifest['bundleSha256']==sha(captured_bytes(a.bundle))
assert manifest['capabilities']==['operator-free-read-projection'] and sha(captured_bytes(a.wheel))==producer['wheelSha256']
spec=importlib.util.spec_from_file_location('original_truss_pipe',a.pipe);pipe_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(pipe_module)
def ref(identity):return {'documentId':identity['documentId'],'moduleId':identity['module'],'elementId':identity['element']}
expected_queries={'plain-salary':('SELECT r.salary FROM Resource r','salary'),'false-salary':('SELECT r.salary FROM Resource r WHERE FALSE','salary'),'limit-zero-salary':('SELECT r.salary FROM Resource r LIMIT 0','salary'),'stored-token':('SELECT r.token FROM Resource r','token')}
assert [x['id'] for x in producer['checks']]==list(expected_queries)
observations=[]
with tempfile.TemporaryDirectory(prefix='umf-projection-weft-',dir='/private/tmp') as temp:
 root=pathlib.Path(temp)
 with zipfile.ZipFile(io.BytesIO(captured_bytes(a.wheel))) as archive:
  for entry in archive.infolist():assert (root/entry.filename).resolve().is_relative_to(root)
  archive.extractall(root)
 sys.path.insert(0,str(root));weft=importlib.import_module('weft');native=importlib.import_module('weft.weft')
 assert pathlib.Path(native.__file__).resolve().is_relative_to(root) and sha(pathlib.Path(native.__file__).read_bytes())==producer['nativeModuleSha256']
 assert pathlib.Path(weft.__file__).resolve().is_relative_to(root) and sha(pathlib.Path(weft.__file__).read_bytes())==producer['shimSha256']
 assert weft.prepare_application_lineage is native.prepare_application_lineage
 modulepins={str(q.relative_to(root)):sha(q.read_bytes()) for q in root.rglob('*') if q.suffix in ['.py','.so']}
 for expected in producer['checks']:
  name=expected['id'];request=json.loads(captured_bytes(a.producer/(name+'.request.json')));parent=weft.prepare_application_lineage(dumps(request).decode());prepared=parent.prepare_current_query()
  assert request['sql']==expected_queries[name][0]
  assert prepared.source_preparation() is parent
  raw=prepared.native_request_json().encode();packet=json.loads(raw)
  assert sha(raw)==expected['packetSha256'] and raw==captured_bytes(a.producer/(name+'.native.json'))
  assert packet['sourceRequestSha256']==sha(parent.source_request_json().encode())==expected['sourceRequestSha256']
  assert packet['routes']==[] and len(packet['projections'])==1 and all(x['input']['kind']!='field' for op in packet['operations'] for x in op['operands'])
  assert packet['authority'] is False and packet['securityReady'] is False
  originals={s['role']:s for s in request['opaqueSources']}
  assert {'policy','ontology','catalog','owner'}<=set(originals)
  for original in originals.values():assert sha(original['utf8'].encode())==original['sha256']
  for s in packet['sources']:
   original=originals[s['role']];assert s['identity']==original['identity'] and s['sha256']==original['sha256']==sha(original['utf8'].encode())
  sources={k:json.loads(originals[k]['utf8']) for k in ['policy','ontology','catalog','owner']}
  assert packet['modelPins']==[m['pin'] for m in request['modules']]
  documents=[]
  for m in request['modules']:
   assert sha(m['documentJson'].encode())==m['pin']['sha256'];documents.append({'revision':m['pin']['revision'],'document':json.loads(m['documentJson'])})
  closure={'pins':[{'documentId':m['documentId'],'revision':m['revision']} for m in packet['modelPins']],'documents':documents}
  # Original source fixture carries closure shape; preserve it rather than infer it.
  fixture=json.loads(captured_bytes(a.fixture))
  assert fixture['closure']['pins']==closure['pins'] and fixture['closure']['documents']==closure['documents']
  closure=fixture['closure'];field=packet['projections'][0]['field'];assert field==expected['projectionField']=={'documentId':'domain','revision':'query-value-core-r1','module':'m','element':expected_queries[name][1]}
  scan=packet['scans'][0];assert scan['type']==ref(scan['record'])
  projections=[{'id':'projection0','selection':{'type':scan['type'],'field':ref(field)}}]
  operations=[{'id':'rules','kind':'read-rules','selection':{'type':scan['type']}},{'id':'cells','kind':'scan','selection':{'type':scan['type'],'fields':[ref(field)]}}]
  cases=['baseline','empty'] if name=='stored-token' else ['baseline','empty','withheld','missing','conflict'] if name=='plain-salary' else ['baseline']
  for variant in cases:
   s=copy.deepcopy(sources);cut=copy.deepcopy(fixture['logicalCut'])
   if variant=='empty':cut['facts']=[x for x in cut['facts'] if x['type']['elementId'] not in ['Resource','Ownership']]
   if variant=='withheld':s['policy']['rules'][0]['disclosure'][0]['disposition']={'kind':'withheld'}
   if variant=='missing':s['policy']['rules'][0]['disclosure']=[]
   if variant=='conflict':
    rule=copy.deepcopy(s['policy']['rules'][0]);rule['id']='other-mask';rule['disclosure'][0]['disposition']['transform']='other-label';s['policy']['rules'].append(rule)
    transform=copy.deepcopy(s['catalog']['transforms'][1]);transform['id']='other-label';transform['parameters'][0]['value']={'string':'other'};s['catalog']['transforms'].append(transform)
   initial=dumps({'protocol':protocol,'kind':'initialize','requestId':'initialize','sources':{**{k:s[k] for k in ['policy','catalog','ontology']},'closure':closure,'associationBindings':[],'extensionSelection':None}});receipt=sha(struct.pack('>I',len(initial))+initial)
   pipe=pipe_module.CurrentQueryPipe(('/opt/homebrew/bin/bun',str(a.bundle)),timeout_seconds=20)
   try:
    def exchange(v):
     result=json.loads(pipe.exchange(v if isinstance(v,bytes) else dumps(v),source_receipt=receipt));assert result['protocol']==protocol and result['sourceReceipt']==receipt;return result
    initialized=exchange(initial);assert initialized['kind']=='initialized',(name,variant,initialized)
    context={'protocol':protocol,'sourceReceipt':receipt,'owner':s['owner'],'routes':[],'projections':projections}
    inspected=exchange({**context,'kind':'inspect-inputs','requestId':'inspect'});assert inspected['kind']=='inputs-inspected' and inspected['routeResults']==[]
    evaluated=exchange({**context,'kind':'evaluate','requestId':'evaluate','cut':cut,'operations':operations});assert evaluated['kind']=='evaluation' and evaluated['projectionResults']==inspected['projectionResults'] and evaluated['routeResults']==[]
    assert [x['id'] for x in inspected['projectionResults']]==['projection0']
    metadata=evaluated['projectionResults'][0]['result'];assert metadata['selection']==projections[0]['selection']
    assert metadata['status']=='inspected' and metadata['authority'] is False and metadata['complete'] is False
    batch=evaluated['batch'];assert batch['authority'] is False and batch['complete'] is False
    if variant in ['missing','conflict']:assert batch=={'status':'refused','complete':False,'authority':False,'operations':[]}
    else:
     cell={'field':ref(field),'disposition':'original','value':{'string':'opaque-token'}} if name=='stored-token' else {'field':ref(field),'disposition':'withheld'} if variant=='withheld' else {'field':ref(field),'disposition':'transformed','outputType':ref({**field,'element':'salaryMaskLabel'}),'value':{'string':'[private]'}}
     rule_rows=[] if variant=='empty' else [{'resource':{'type':scan['type'],'key':[{'string':'r1'}]},'decision':'permit','rules':[{'ruleIndex':0,'truth':'T'},{'ruleIndex':1,'truth':'T'}]}]
     expected_batch={'status':'completed','complete':False,'authority':False,'operations':[{'id':'rules','kind':'read-rules','outcome':{'status':'evaluated','complete':False,'authority':False,'rows':rule_rows}},{'id':'cells','kind':'scan','outcome':{'status':'rendered','complete':False,'authority':False,'rows':[] if variant=='empty' else [[cell]],'valueProfiles':[]}}]}
     assert batch==expected_batch,(name,variant,'Complete original operation/result correspondence failed')
    observations.append({'id':name+':'+variant,'actualPacketSha256':sha(raw),'sourceVariant':variant,'sourceReceipt':receipt,'inspect':inspected,'evaluation':evaluated,'scope':'Original read-source metadata/batch only; query FALSE/LIMIT is not executed here'})
   finally:pipe.close()
 assert modulepins=={str(q.relative_to(root)):sha(q.read_bytes()) for q in root.rglob('*') if q.suffix in ['.py','.so']}
assert all(sha(pathlib.Path(q).read_bytes())==h for q,h in pins.items())
receipt={'status':'passed','protocol':protocol,'pins':pins,'sourcesUnchanged':True,'loadedModulePins':modulepins,'observations':observations,'nativeAdmission':False,'securityReady':False,'casesPromoted':[],'scope':'Actual Weft packets and original Truss generic pipe -> actual V2 bundled original UMF computation; supplied cut, no SQL/FALSE/LIMIT execution, output scalar selection, native authority or backend qualification'}
(a.output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','cases':len(observations),'receipt':str(a.output/'receipt.json')}))
