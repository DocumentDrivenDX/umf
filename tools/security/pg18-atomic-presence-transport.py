"""Owned native atomic-cell transport component, never backend admission.
@covers US-056-AC6 @covers US-056-AC10
"""
import argparse,copy,csv,hashlib,io,json,os,pathlib,secrets,selectors,subprocess,sys,time,uuid,zipfile
p=argparse.ArgumentParser()
for n in ['umf-root','producer-inputs','cases','emitted','probe','probe-project','probe-manifest','weft-root','reviewed-source-inventory','output']:p.add_argument('--'+n,type=pathlib.Path,required=True)
p.add_argument('--expected-probe-sha256',required=True)
p.add_argument('--preflight-only',action='store_true')
p.add_argument('--supplemental-producer-controls',type=pathlib.Path)
p.add_argument('--reviewed-lowerer-packet',type=pathlib.Path,required=True)
p.add_argument('--reviewed-lowerer-sha256',required=True)
a=p.parse_args();root=a.umf_root.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
image='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
run_id=str(uuid.uuid4());name='umf-pg18-atomic-presence-'+run_id;attempted=False;tmpfs_only_verified=False;observations=[];statements=[];operations=[]
result={'status':'incomplete','runId':run_id,'observations':observations,'operations':operations};password=secrets.token_hex(32)
def encoded(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def sha(b):return hashlib.sha256(b).hexdigest()
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',30),**kw)
def require(r):
 if r.returncode:raise RuntimeError(r.stderr[:2000])
 return r.stdout

def check(label,expected,actual):
 observations.append({'id':label,'expected':expected,'actual':actual})
 if type(expected) is not type(actual) or expected!=actual:raise AssertionError(label)
def literal(text):return "E'"+text.replace('\\','\\\\').replace("'","''")+"'"
def identifier(text):
 if not isinstance(text,str) or not text or '\0' in text:raise ValueError('Unsupported native identifier')
 return '"'+text.replace('"','""')+'"'
def sql(text):
 statements.append(text)
 return require(command(['docker','exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],input=text))
def scalar(text):return json.loads(sql(text))
null_marker='umf_sql_null_'+uuid.uuid4().hex

def driver(text):
 statements.append(text)
 raw=require(command(['docker','exec','-i',name,'psql','-X','--csv','-P','null='+null_marker,'-v','ON_ERROR_STOP=1','-U','postgres'],input=text))
 rows=list(csv.reader(io.StringIO(raw)));assert rows
 # A unique sentinel is outside complete cell JSON and private tuple JSON.
 return rows[0],[[None if cell==null_marker else cell for cell in row]for row in rows[1:]]
def send(proc,value,timeout_seconds=30):
 data=(encoded(value)+'\n').encode();offset=0;fd=proc.stdin.fileno();deadline=time.monotonic()+timeout_seconds
 selector=selectors.DefaultSelector();os.set_blocking(fd,False);selector.register(fd,selectors.EVENT_WRITE)
 try:
  while offset<len(data):
   remaining=deadline-time.monotonic()
   if remaining<=0 or not selector.select(remaining):raise TimeoutError('Held probe complete-send deadline')
   try:count=os.write(fd,memoryview(data)[offset:offset+65536])
   except BlockingIOError:continue
   if not count:raise BrokenPipeError('Held probe input closed')
   offset+=count
 finally:
  selector.close();os.set_blocking(fd,True)
def receive(proc,timeout_seconds=30):
 fd=proc.stdout.fileno();deadline=time.monotonic()+timeout_seconds;data=bytearray();maximum=64_000_000
 selector=selectors.DefaultSelector();os.set_blocking(fd,False);selector.register(fd,selectors.EVENT_READ)
 try:
  while True:
   remaining=deadline-time.monotonic()
   if remaining<=0 or not selector.select(remaining):raise TimeoutError('Held probe complete-response deadline')
   try:chunk=os.read(fd,min(65536,maximum-len(data)+1))
   except BlockingIOError:continue
   if not chunk:raise ValueError('Probe response ended before complete line')
   data.extend(chunk)
   if len(data)>maximum:raise ValueError('Probe output bound')
   boundary=data.find(b'\n')
   if boundary>=0:
    if boundary!=len(data)-1:raise ValueError('Extra probe response bytes')
    return json.loads(data.decode('utf-8'))
 finally:
  selector.close();os.set_blocking(fd,True)
def finish(proc,code,timeout_seconds=30):
 proc.stdin.close();check('probe-terminal-exit',code,proc.wait(timeout=timeout_seconds))
 for stream,label in [(proc.stderr,'stderr'),(proc.stdout,'stdout')]:
  fd=stream.fileno();selector=selectors.DefaultSelector();os.set_blocking(fd,False);selector.register(fd,selectors.EVENT_READ)
  deadline=time.monotonic()+timeout_seconds
  try:
   while True:
    remaining=deadline-time.monotonic()
    if remaining<=0 or not selector.select(remaining):raise TimeoutError('Held probe terminal-pipe deadline')
    try:chunk=os.read(fd,1)
    except BlockingIOError:continue
    check('probe-empty-terminal-'+label+'-bytes',0,len(chunk));break
  finally:
   selector.close();os.set_blocking(fd,True)

frozen={}
def retain(path):
 path=path.resolve();frozen[str(path)]=path.read_bytes()
for path in [pathlib.Path(__file__),root/'tools/security/native_owned_cleanup.py',a.producer_inputs,a.cases,a.emitted,a.probe,a.probe_manifest,a.reviewed_lowerer_packet,a.reviewed_source_inventory]:retain(path)
assert sha(frozen[str(a.probe.resolve())])==a.expected_probe_sha256
assert sha(frozen[str(a.reviewed_lowerer_packet.resolve())])==a.reviewed_lowerer_sha256
with zipfile.ZipFile(a.reviewed_lowerer_packet)as reviewed:
 lowerer_manifest=json.loads(reviewed.read('manifest.json'))
 for entry in lowerer_manifest['sourceFiles']:
  path=(a.weft_root/entry['path']).resolve();assert path.is_relative_to(a.weft_root.resolve());retain(path);assert sha(frozen[str(path)])==entry['sha256'];assert reviewed.read('overlay/'+entry['path'])==frozen[str(path)]
for relative,h in json.loads(frozen[str(a.reviewed_source_inventory.resolve())]).items():
 path=(a.weft_root/relative).resolve();assert path.is_relative_to(a.weft_root.resolve());retain(path);assert sha(frozen[str(path)])==h
manifest=json.loads(frozen[str(a.probe_manifest.resolve())]);assert manifest['requiredLowererReviewPacketSha256']==a.reviewed_lowerer_sha256
for relative,h in manifest['files'].items():
 path=(a.probe_project/relative).resolve();retain(path);assert sha(frozen[str(path)])==h
producer=json.loads(frozen[str(a.producer_inputs.resolve())]);logical={row['id']:row for row in producer['packets']}
for relative,h in producer['sourcePins'].items():
 path=(root/relative).resolve();assert path.is_relative_to(root);retain(path);assert sha(frozen[str(path)])==h
# Conservative package source snapshot; transitive external compiler/runtime closure is not hermetic.
for directory,subdirs,files in os.walk(a.weft_root.resolve()):
 subdirs[:]=[d for d in subdirs if d not in ['target','.git','node_modules','distributions']]
 for filename in sorted(files):
  path=pathlib.Path(directory)/filename;relative=path.relative_to(a.weft_root.resolve())
  if path.suffix=='.rs' or path.name in ['Cargo.toml','Cargo.lock'] or path.suffix=='.json' and str(relative).startswith('spec/'):retain(path)
cases={row['id']:row['request']for row in json.loads(frozen[str(a.cases.resolve())])['cases']};emitted=json.loads(frozen[str(a.emitted.resolve())]);assert len(emitted)==41 and len({row['id']for row in emitted})==41
assert set(row['id']for row in emitted)=={key for key,value in logical.items()if value['result']['status']=='rendered'}
if a.supplemental_producer_controls:
 retain(a.supplemental_producer_controls);extra=json.loads(frozen[str(a.supplemental_producer_controls.resolve())]);assert extra['status']=='passed' and extra['count']==59
 templates={row['id']:row for row in emitted}
 for observation in extra['observations']:
  packet=copy.deepcopy(observation['packet']);base_id=packet['id'];assert base_id in ['allowed:string','allowed:withheld','allowed:transformed-null'];assert packet['source']==logical[base_id]['source']
  packet['id']='review-'+observation['id'];packet['result']=observation['result'];assert packet['result']['status']=='rendered'
  logical[packet['id']]=packet;cases[packet['id']]=cases[base_id];row=copy.deepcopy(templates[base_id]);row['id']=packet['id'];emitted.append(row)
inspector="const {inspectSecurityDisclosureV2}=await import("+json.dumps(str(root/'src/extensions/security/protection/disclosure.ts'))+");const inputs=JSON.parse(await Bun.stdin.text());console.log(JSON.stringify(inputs.map(x=>inspectSecurityDisclosureV2(x.batch,x.source.policy,x.source.catalog,x.source.closure))));"
producer_code="const {compileCandidateCatalogProgram}=await import("+json.dumps(str(root/'src/extensions/security/catalog-program-candidate.ts'))+");const {evaluateCandidateCatalogReadDisclosureBatchWithinOperation:produce}=await import("+json.dumps(str(root/'src/extensions/security/catalog-runtime-candidate.ts'))+");const {CandidateSecurityOperationBudget}=await import("+json.dumps(str(root/'src/extensions/security/operation-budget-candidate.ts'))+");const p=JSON.parse(await Bun.stdin.text());const s=p.source;console.log(JSON.stringify(produce(compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology),s.owner,p.cut,p.selection,new CandidateSecurityOperationBudget(100000))));"
def inspect(batch,source):return json.loads(require(command(['/opt/homebrew/bin/bun','-e',inspector],input=encoded([dict(batch=batch,source=source)]))))[0]
cleanup_ns={};exec(compile(frozen[str(root/'tools/security/native_owned_cleanup.py')],str(root/'tools/security/native_owned_cleanup.py'),'exec'),cleanup_ns)
if a.preflight_only:
 for row in emitted:
  packet=logical[row['id']];actual=json.loads(require(command(['/opt/homebrew/bin/bun','-e',producer_code],input=encoded(packet))))
  check(row['id']+':actual-producer',packet['result'],actual);check(row['id']+':whole-v2','validated-disclosure',inspect(actual['batch'],packet['source'])['status'])
 for path,data in frozen.items():assert pathlib.Path(path).read_bytes()==data,path
 preflight={'status':'preflight-passed','nativeExecuted':False,'plannedPositiveOperations':len(emitted),'plannedNegativeOperations':5,'observations':observations,'sourceDigests':{path:sha(data)for path,data in frozen.items()},'scope':'Exact reviewed source/binary/input correspondence and actual producer/whole V2 validation only; no Docker invocation, SQL, typed native checker or cleanup claim.'}
 (out/'preflight.json').write_text(json.dumps(preflight,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':preflight['status'],'operations':len(emitted),'sourcePins':len(frozen),'nativeExecuted':False}));sys.exit(0)

def execute(row,negative=None):
 packet=logical[row['id']];binding=row['binding'];source=packet['source'];original=packet['result'];batch=original['batch'];request=canonical(cases[row['id']])
 actual_producer=json.loads(require(command(['/opt/homebrew/bin/bun','-e',producer_code],input=encoded(packet))))
 check(row['id']+':fresh-actual-producer',original,actual_producer)
 check(row['id']+':actual-original-batch-validation','validated-disclosure',inspect(batch,source)['status'])
 check(row['id']+':header',dict((key,value)for key,value in batch.items()if key!='rows'),binding['header'])
 check(row['id']+':resource-count',len(original['resources']),len(batch['rows']))
 assert len(binding['cells'])==1 and binding['cells'][0]['column']=='token_cell'
 relation=binding['relation'];assert relation=={'schema':'private_stage','table':'held_cells','eligibleColumn':'eligible','rowKeyColumn':'private_key'}
 sql('TRUNCATE private_stage.held_cells;')
 for resource,cells in zip(original['resources'],batch['rows']):
  assert len(cells)==1
  sql('INSERT INTO private_stage.held_cells VALUES ('+literal(canonical(resource))+',true,'+literal(encoded(cells[0]))+');')
 sql("INSERT INTO private_stage.held_cells VALUES ('excluded-fixture-row',false,'{\"disposition\":\"withheld\"}');")
 if negative=='invalid-selected-occurrence':
  altered=copy.deepcopy(batch['rows'][0][0]);altered['selection']={'ruleIndex':999,'disclosureIndex':999}
  sql('UPDATE private_stage.held_cells SET token_cell='+literal(encoded(altered))+' WHERE eligible;')
 proc=subprocess.Popen([str(a.probe.resolve())],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  send(proc,{'requestJson':request});prepared=receive(proc);assert prepared['phase']=='prepared';check('exact-held-preparation-pin',binding['preparationSha256'],sha(prepared['preparationJson'].encode()))
  binding_text=canonical(binding);send(proc,{'bindingJson':binding_text});compiled=receive(proc);assert compiled['phase']=='compiled';artifact=json.loads(compiled['artifactJson']);check('actual-compiled-artifact',row['compiled'],artifact)
  check('actual-compiled-pin',row['frame']['compiledArtifactSha256'],sha(compiled['artifactJson'].encode()));assert artifact['parameters']==[]
  headers,expected=driver('SELECT private_key,token_cell FROM private_stage.held_cells WHERE eligible IS TRUE ORDER BY private_key;')
  check('complete-capture-column-order',['private_key','token_cell'],headers)
  headers,native=driver(artifact['sql']+';');check('compiled-native-column-order',['output_0','__weft_source_rows'],headers)
  frame={key:value for key,value in row['frame'].items()if key not in ['rows','resultRows','expectedRowCount']};frame['rows']=[{'key':key,'cells':[cell]}for key,cell in expected];frame['expectedRowCount']=str(len(expected));frame['resultRows']=copy.deepcopy(native)
  if negative=='missing-result':frame['resultRows']=[]
  if negative=='extra-result':frame['resultRows']=copy.deepcopy(native)+copy.deepcopy(native)
  if negative=='scalar-null-collapse':frame['resultRows'][0][0]=None
  if negative=='changed-header':frame['header']=copy.deepcopy(frame['header']);frame['header']['policy']['revision']='other'
  send(proc,{'frameJson':encoded(frame)});checked=receive(proc)
  record={'id':row['id'],'negative':negative,'requestJson':request,'bindingJson':binding_text,'preparationJson':prepared['preparationJson'],'artifactJson':compiled['artifactJson'],'driverColumnNames':headers,'actualDriverRows':copy.deepcopy(native),'negativeInputLayer':'staged-native-cell' if negative=='invalid-selected-occurrence' else 'checker-frame-corruption' if negative else None,'expectedCapture':expected,'frame':frame,'checker':checked}
  operations.append(record)
  if negative not in [None,'invalid-selected-occurrence']:
   check('actual-native-frame-refusal',{'phase':'refused','authority':False},checked);finish(proc,1);return
  assert checked['phase']=='checked';report=json.loads(checked['reportJson']);check('actual-native-checker-matched',True,report['matched']);check('no-native-authority',[False,False],[report['authority'],report['securityReady']]);finish(proc,0)
  by_key={json.loads(sideband)['rows'][0]['key']:json.loads(cell)for cell,sideband in native};check('native-resource-key-bag',sorted(canonical(resource)for resource in original['resources']),sorted(by_key))
  reconstructed={**artifact['disclosureHeader'],'rows':[[by_key[canonical(resource)]]for resource in original['resources']]}
  inspected=inspect(reconstructed,source);record['nativeBatch']=reconstructed;record['publicInspection']=inspected
  check('whole-native-v2-validation','refused'if negative else'validated-disclosure',inspected['status'])
  if negative is None:
   check('actual-native-batch',batch,reconstructed)
   for key,_ in expected:assert json.loads(key)in original['resources']
 finally:
  if proc.poll()is None:proc.kill();proc.wait()
try:
 assert name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines();attempted=True
 require(command(['docker','run','-d','--mount','type=tmpfs,destination=/var/lib/postgresql,tmpfs-size=536870912','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD',image],env={**os.environ,'POSTGRES_PASSWORD':password}))
 deadline=time.monotonic()+30
 while command(['docker','exec',name,'pg_isready','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Owned fixture readiness')
  time.sleep(.1)
 result['mounts']=json.loads(require(command(['docker','inspect',name,'--format','{{json .Mounts}}'])));assert len(result['mounts'])==1 and result['mounts'][0]['Type']=='tmpfs' and result['mounts'][0]['Destination']=='/var/lib/postgresql';tmpfs_only_verified=True
 result['imageId']=require(command(['docker','image','inspect',image,'--format','{{.Id}}'])).strip();check('exact-running-image',result['imageId'],require(command(['docker','inspect',name,'--format','{{.Image}}'])).strip())
 result['engine']=scalar("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'),'currentUser',current_user,'sessionUser',session_user,'encoding',current_setting('client_encoding'));");check('exact-engine','180006',result['engine']['number'])
 sql('CREATE SCHEMA private_stage;CREATE TABLE private_stage.held_cells(private_key text COLLATE "C" PRIMARY KEY,eligible boolean NOT NULL,token_cell text NOT NULL);')
 for row in emitted:execute(row)
 positive=next(row for row in emitted if row['id']=='allowed:string')
 for negative in ['missing-result','extra-result','scalar-null-collapse','changed-header']:execute(positive,negative)
 transformed=next(row for row in emitted if row['id']=='allowed:transformed-null');execute(transformed,'invalid-selected-occurrence')
 for path,data in frozen.items():assert pathlib.Path(path).read_bytes()==data,path
 result.update(status='native-atomic-presence-component-passed',sourcesUnchanged=True,positiveOperations=len(emitted),negativeOperations=5,sourceDigests={path:sha(data)for path,data in frozen.items()},sqlStatements=statements,scope='Actual atomic producer cells over supplied logical facts, actual borrowed Rust lowerer/checker, independently captured complete owned eligible relation, actual PostgreSQL18.6 SQL/driver TEXT cells and original whole V2 inspection. Invalid selected occurrence demonstrates structural transport can match while required whole V2 validation refuses. Excluded administrator fixture does not authenticate original source/caller/Subject/current cut, production mapping/role/native authority, operators or guarded release. No required case promotion; external closure non-hermetic, endpoint source pins are not held-file/ABA proof.')
except Exception as error:
 result.update(status='failed',errorType=type(error).__name__,error=str(error));raise
finally:
 cleanup=cleanup_ns['cleanup_owned'](command,name,run_id,attempted)
 cleanup['containerRemovalVerified']=cleanup['verified'];cleanup['tmpfsOnlyLayoutVerified']=tmpfs_only_verified
 cleanup['storageCleanupVerified']=not attempted or (tmpfs_only_verified and cleanup['containerRemovalVerified'])
 cleanup['verified']=cleanup['containerRemovalVerified'] and cleanup['storageCleanupVerified']
 cleanup['storageCleanupScope']='exact tmpfs-only storage and container absence' if tmpfs_only_verified else 'no fixture attempted' if not attempted else 'container removal only; unobserved or unexpected storage remains unverified'
 result['cleanup']=cleanup
 if result['status']=='native-atomic-presence-component-passed'and not cleanup['verified']:result['status']='native-passed-cleanup-unverified'
 with zipfile.ZipFile(out/'source-inputs.zip','w',zipfile.ZIP_DEFLATED)as archive:
  for index,(path,data)in enumerate(sorted(frozen.items())):archive.writestr('inputs/'+str(index),data)
  archive.writestr('manifest.json',encoded({path:{'entry':'inputs/'+str(index),'sha256':sha(data)}for index,(path,data)in enumerate(sorted(frozen.items()))}))
 (out/'receipt.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'status':result['status'],'operations':len(operations),'observations':len(observations),'cleanupVerified':cleanup['verified']}))
