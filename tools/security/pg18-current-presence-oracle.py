"""Native value/presence/refinement boundary component; not P03 admission.
@covers US-056-AC6
"""
import argparse,copy,hashlib,importlib,json,os,pathlib,re,secrets,subprocess,sys,time,uuid,zipfile
import weft
p=argparse.ArgumentParser()
for n in ['umf-root','packet','wheel','output','presence-source']:p.add_argument('--'+n,type=pathlib.Path,required=True)
a=p.parse_args();root=a.umf_root.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
image='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
run_id=str(uuid.uuid4());name='umf-pg18-presence-'+run_id;attempted=False;observations=[];statements=[];result={'status':'incomplete','runId':run_id};password=secrets.token_hex(32)
sha=lambda b:hashlib.sha256(b).hexdigest()
def text(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',30),**kw)
def require(r):
 if r.returncode:raise RuntimeError(r.stderr[:2000])
 return r.stdout.strip()
def sql(s):statements.append(s);return require(command(['docker','exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],input=s))
def val(s):return json.loads(sql(s))
def literal(s):return "E'"+s.replace('\\','\\\\').replace("'","''")+"'"
def check(id,expected,actual):
 observations.append({'id':id,'expected':expected,'actual':actual});assert expected==actual,id
paths=[a.presence_source.resolve(),root/'tools/security/current-query-presence-source.ts',root/'tests/security/protection/current-query-presence-source.json',root/'tests/security/protection/current-query-source.json',root/'src/extensions/security/protection/disclosure.ts',pathlib.Path(__file__).resolve(),a.packet.resolve(),a.wheel.resolve(),root/'tests/security/protection/disclosure-fixtures.json',root/'tools/security/native_owned_cleanup.py']
def closure(path,seen):
 path=path.resolve()
 if path in seen:return
 assert path.is_file()and path.is_relative_to(root);seen.add(path)
 if path.suffix not in ['.ts','.js']:return
 for rel in re.findall(r'''(?:from\s*|import\s*)['"](\.[^'"]+)['"]''',path.read_text()):
  b=path.parent/rel;found=next((p for p in [b,pathlib.Path(str(b)+'.ts'),pathlib.Path(str(b)+'.json'),b/'index.ts']if p.is_file()),None);assert found is not None;closure(found,seen)
selected=set();closure(root/'src/extensions/security/protection/disclosure.ts',selected);paths+=sorted(selected)
frozen={str(p):p.read_bytes()for p in paths};native=pathlib.Path(importlib.import_module('weft.weft').__file__);shim=pathlib.Path(weft.__file__);frozen[str(native)]=native.read_bytes();frozen[str(shim)]=shim.read_bytes()
with zipfile.ZipFile(a.wheel)as z:
 binaries=[n for n in z.namelist()if n.endswith(('.so','.pyd'))];assert len(binaries)==1 and z.read(binaries[0])==frozen[str(native)]and z.read('weft/__init__.py')==frozen[str(shim)]
cleanup_ns={};exec(compile(frozen[str(root/'tools/security/native_owned_cleanup.py')],str(root/'tools/security/native_owned_cleanup.py'),'exec'),cleanup_ns)
packet=json.loads(frozen[str(a.packet.resolve())]);base=json.loads(frozen[str(root/'tests/security/protection/disclosure-fixtures.json')])['base'];vectors=[v for v in packet['vectors']if v['backend']=='postgresql'and v['kind']=='rows'];assert len(vectors)==4
assert packet['pinsBeforeAfter']==dict(wheelSha256=sha(frozen[str(a.wheel.resolve())]),nativeModuleSha256=sha(frozen[str(native)]),shimSha256=sha(frozen[str(shim)]))
result.update(sourceDigests={p:sha(v)for p,v in frozen.items()},observations=observations,sqlStatements=statements,scope='Owned excluded-admin fixture: actual compiler SQL/native data/refinement boundary only; no P03 admission, authenticated source/caller/current cut, disclosure enforcement or guarded release.')
try:
 assert name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines();attempted=True
 require(command(['docker','run','-d','--mount','type=tmpfs,destination=/var/lib/postgresql,tmpfs-size=536870912','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD',image],env={**os.environ,'POSTGRES_PASSWORD':password}))
 end=time.monotonic()+30
 while command(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>end:raise TimeoutError('Owned PostgreSQL readiness')
  time.sleep(.1)
 result['umfCommit']=require(command(['git','-C',str(root),'rev-parse','HEAD']));result['runtime']={'python':sys.version,'weftVersion':weft.__version__,'bun':require(command(['/opt/homebrew/bin/bun','--version'])),'psql':require(command(['docker','exec',name,'psql','--version']))};result['mounts']=json.loads(require(command(['docker','inspect',name,'--format','{{json .Mounts}}'])));assert len(result['mounts'])==1 and result['mounts'][0]['Type']=='tmpfs' and result['mounts'][0]['Destination']=='/var/lib/postgresql'
 result['imageId']=require(command(['docker','image','inspect',image,'--format','{{.Id}}']));assert require(command(['docker','inspect',name,'--format','{{.Image}}']))==result['imageId']
 result['engine']=val("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'),'client',current_setting('client_encoding'),'sessionUser',session_user,'currentUser',current_user)");assert result['engine']['number']=='180006'
 sql('CREATE SCHEMA private_stage;CREATE TABLE private_stage.current_values(private_key text PRIMARY KEY,eligible boolean NOT NULL,token text COLLATE "C",token_present boolean NOT NULL DEFAULT true);')
 # Native rows feed the actual issued Rust checker; no fixed supplied result rows.
 def capture():return val("SELECT coalesce(json_agg(json_build_object('key',private_key,'cells',json_build_object('token',json_build_object('family','string','value',token))) ORDER BY private_key),'[]'::json) FROM private_stage.current_values WHERE eligible IS TRUE")
 def native_results(artifact):
  query=artifact['sql']
  for param in sorted(artifact['parameters'],key=lambda p:p['ordinal'],reverse=True):
   assert param['nativeType']=='text';query=re.sub(r'\$'+str(param['ordinal'])+r'\b',lambda _:literal(param['value']),query)
  # row_to_json preserves the emitted column order, including the private tuple.
  rows=val('SELECT coalesce(json_agg(row_to_json(q)),\'[]\'::json) FROM ('+query+')q')
  return [list(row.values())for row in rows]
 issued=[]
 for vector in vectors:
  parent=weft.prepare_application_lineage(vector['request']);child=parent.prepare_current_query();binding=vector['binding'];artifact_text=child.lower_postgresql_bounded_current_rows_candidate_json(binding);check(vector['id']+':actual-artifact-parity',vector['artifact'],artifact_text);artifact=json.loads(artifact_text)
  sql('TRUNCATE private_stage.current_values;INSERT INTO private_stage.current_values(private_key,eligible,token) VALUES (\'k0\',true,'+literal('😀')+'),(\'k1\',true,\'z\'),(\'k2\',true,'+literal('é')+');')
  frame=json.loads(vector['input']);rows=capture();frame['scans']=[dict(scan='s0',expectedRowCount=str(len(rows)),rows=rows)];frame['resultRows']=native_results(artifact);raw=text(frame);report=json.loads(child.check_postgresql_bounded_current_rows_candidate_json(binding,raw));check(vector['id']+':native-frame-matches',True,report['matched']);assert report['authority']is False and report['securityReady']is False
  issued.append(dict(id=vector['id'],request=vector['request'],binding=binding,artifact=artifact_text,frame=raw,report=report))
  sql("UPDATE private_stage.current_values SET token=NULL WHERE private_key='k2'")
  bad=copy.deepcopy(frame);bad['scans'][0]['rows']=capture();bad['resultRows']=native_results(artifact)
  try:child.check_postgresql_bounded_current_rows_candidate_json(binding,text(bad))
  except (ValueError,TypeError)as e:observations.append(dict(id=vector['id']+':native-null-refuses',refused=True,errorType=type(e).__name__,diagnostic=str(e),frame=bad))
  else:raise AssertionError('Native NULL accepted as required String')
  null_state=val("SELECT json_build_object('present',token_present,'sqlNull',token IS NULL,'value',token) FROM private_stage.current_values WHERE private_key='k2'")
  sql("UPDATE private_stage.current_values SET token_present=false WHERE private_key='k2'")
  absent_state=val("SELECT json_build_object('present',token_present,'sqlNull',token IS NULL,'value',token) FROM private_stage.current_values WHERE private_key='k2'")
  check(vector['id']+':native-null-and-absence-distinct',True,null_state!=absent_state)
  check(vector['id']+':scalar-only-frame-collapses-native-presence',bad['scans'][0]['rows'],capture())
  observations.append(dict(id=vector['id']+':actual-native-presence-proposal',nullState=null_state,absentState=absent_state,qualification='Presence column is an observed proposed codec, not an admitted binding; current required-only frame cannot express it.'))
 # Exact original declared disclosure population has two orthogonal dimensions.
 cells=[row[0]for row in base['batch']['rows']];assert len(cells)==5
 sql('CREATE TABLE private_stage.disclosure_carrier(ordinal int PRIMARY KEY,column_descriptor jsonb NOT NULL,source_revision text NOT NULL,disposition text NOT NULL,payload_present boolean NOT NULL,payload jsonb,selection jsonb,output_domain jsonb,transform jsonb);')
 for i,c in enumerate(cells):
  j=lambda x:'NULL'if x is None else literal(text(x))+'::jsonb'
  payload=literal(text(c['value']))+'::jsonb'if 'value'in c else'NULL'
  sql('INSERT INTO private_stage.disclosure_carrier VALUES ('+str(i)+','+literal(text(base['batch']['columns'][0]))+'::jsonb,'+literal(base['batch']['domains'][0]['revision'])+','+literal(c['disposition'])+','+('true'if'value'in c else'false')+','+payload+','+j(c.get('selection'))+','+j(c.get('outputDomain'))+','+j(c.get('transform'))+');')
 carrier=val("SELECT json_agg(json_build_object('ordinal',ordinal,'columnDescriptor',column_descriptor,'sourceRevision',source_revision,'disposition',disposition,'payloadPresent',payload_present,'sqlNull',payload IS NULL,'jsonNull',payload='null'::jsonb,'payload',payload,'selection',selection,'outputDomain',output_domain,'transform',transform) ORDER BY ordinal) FROM private_stage.disclosure_carrier")
 def decode_carrier(rows):
  decoded=[]
  for i,row in enumerate(rows):
   if row['ordinal']!=i or row['columnDescriptor']!=base['batch']['columns'][0] or row['sourceRevision']!=base['batch']['domains'][0]['revision']:raise ValueError('Original column/source correspondence unavailable')
   d=row['disposition'];has=d in ['original','transformed']
   if d not in ['original','transformed','absent','withheld'] or row['payloadPresent']!=has or row['sqlNull']==has:raise ValueError('Native payload presence cannot represent disposition')
   metadata=[row['selection'],row['outputDomain'],row['transform']]
   if any(x is None for x in metadata)if d=='transformed'else any(x is not None for x in metadata):raise ValueError('Native disclosure provenance cannot represent disposition')
   cell={'disposition':d}
   if has:cell['value']=row['payload']
   if d=='transformed':cell.update(selection=row['selection'],outputDomain=row['outputDomain'],transform=row['transform'])
   decoded.append(cell)
  return decoded
 decoded=decode_carrier(carrier)
 for label,change in [('wrong-original-document',lambda c:c[0]['columnDescriptor']['field'].update(documentId='foreign')),('stale-source-revision',lambda c:c[0].update(sourceRevision='stale')),('false-payload-presence',lambda c:c[0].update(payloadPresent=False)),('missing-transform',lambda c:c[3].update(transform=None)),('unexpected-transform',lambda c:c[0].update(transform={'id':'mask','version':'v1'}))]:
  bad=copy.deepcopy(carrier);change(bad)
  try:decode_carrier(bad)
  except ValueError:observations.append({'id':label,'refused':True})
  else:raise AssertionError(label)
 native_batch=copy.deepcopy(base['batch']);native_batch['columns']=[carrier[0]['columnDescriptor']];native_batch['rows']=[[c]for c in decoded]
 inspector="const a=await import("+text(str(root/'src/extensions/security/protection/disclosure.ts'))+"); const x=JSON.parse(await Bun.stdin.text());console.log(JSON.stringify(a.inspectSecurityDisclosureV2(x.batch,x.policy,x.catalog,x.closure)));"
 def inspect(batch):return json.loads(require(command(['/opt/homebrew/bin/bun','-e',inspector],input=text(dict(batch=batch,policy=base['policy'],catalog=base['catalog'],closure=base['closure'])))))
 native_inspection=inspect(native_batch);check('actual-public-native-batch-inspection','validated-disclosure',native_inspection['status']);assert native_inspection['complete']is False and native_inspection['authority']is False
 for label,change in [('missing-null-value',lambda b:b['rows'][0][0].pop('value')),('foreign-output-domain',lambda b:b['rows'][3][0]['outputDomain'].update(documentId='foreign')),('wrong-transform-identity',lambda b:b['rows'][3][0]['transform'].update(id='mask'))]:
  bad=copy.deepcopy(native_batch);change(bad);check(label+':public-inspection','refused',inspect(bad)['status'])
 check('native-tagged-five-outcomes-roundtrip',cells,decoded)
 check('SQL-null-versus-JSON-null',[False,True,True,False,False],[c['sqlNull']for c in carrier])
 naive=val("SELECT json_agg(payload->>'string' ORDER BY ordinal) FROM private_stage.disclosure_carrier")
 check('weakened-nullable-scalar-collapses-four-distinct-states',[None,None,None,None,'masked'],naive)
 check('original-null-and-transformed-null-same-payload',carrier[0]['payload'],carrier[3]['payload']);check('original-null-and-transformed-null-different-disposition',True,carrier[0]['disposition']!=carrier[3]['disposition'])
 # A JSONB property bag provides an alternative presence encoding, not graph admission.
 sql("CREATE TABLE private_stage.token_bag(ordinal int PRIMARY KEY,bag jsonb NOT NULL);INSERT INTO private_stage.token_bag VALUES (0,'{}'),(1,'{\"token\":null}'),(2,'{\"token\":{\"string\":\"opaque-token\"}}');")
 bags=val("SELECT json_agg(json_build_object('ordinal',ordinal,'present',bag?'token','sqlNull',(bag->'token') IS NULL,'value',bag->'token') ORDER BY ordinal) FROM private_stage.token_bag")
 check('native-bag-presence',[False,True,True],[b['present']for b in bags]);check('native-bag-SQL-null',[True,False,False],[b['sqlNull']for b in bags]);check('native-bag-payload',[None,None,{'string':'opaque-token'}],[b['value']for b in bags])
 collapsed=val("SELECT json_agg(bag->>'token' ORDER BY ordinal) FROM private_stage.token_bag");check('native-bag-naive-collapse-first-two',[None,None],collapsed[:2])
 result['alternateBagCarrier']={'rows':bags,'naiveRows':collapsed,'qualification':'Owned JSONB substrate observations, not an Ashlar/Truss graph decoder or binding admission.'}
 # Current required-only source producer must refuse original optional semantics.
 source_observation=json.loads(frozen[str(a.presence_source.resolve())]);assert source_observation['membershipUnchanged']is True and source_observation['sourceDocumentValidation']['valid']is True
 for r in source_observation['recordValueReceipts']:assert r['validation']['valid']is True
 required_request=text(source_observation['requiredSourceRequest']);required_parent=weft.prepare_application_lineage(required_request);check('original-queryable-required-source-prepares',True,required_parent is not None)
 optional_request=text(source_observation['optionalSourceRequest']);before=len(statements)
 try:weft.prepare_application_lineage(optional_request)
 except (ValueError,TypeError)as e:
  assert str(e).startswith('WFT-APPLICATION-LINEAGE-AVAILABILITY:')
  result['optionalSourceRefusal']={'request':optional_request,'diagnostic':str(e),'nativeApplicationStatementsAdded':len(statements)-before,'originalRequiredRequest':required_request,'sourceObservationSha256':sha(frozen[str(a.presence_source.resolve())])}
 else:raise AssertionError('Optional source silently accepted by required-only producer')
 assert len(statements)==before
 if any(pathlib.Path(p).read_bytes()!=v for p,v in frozen.items()):raise RuntimeError('Captured source or artifact changed')
 result.update(status='native-carrier-refusal-component-passed',observations=observations,issuedQueries=issued,originalDisclosure={'batch':base['batch'],'nativeCarrier':carrier,'decodedCells':decoded,'nativeBatch':native_batch,'publicInspection':native_inspection,'naiveScalarRows':naive},sourceDigests={p:sha(v)for p,v in frozen.items()},sourcesUnchanged=True,sqlStatements=statements,scope='Actual PostgreSQL18.6 compiler SQL/driver values/issued Rust checker and physical disclosure carrier observations. The current-value relation is an owned declared fixture, not authenticated policy-selected complete source/caller/current-cut. Original disclosure rows are declared transport cells, not actual policy decisions or transforms. No P03, null/absence operator semantics, role/guarded release or backend admission is accepted.')
except BaseException as e:result.update(failure={'type':type(e).__name__,'message':str(e)},observations=observations);raise
finally:
 cleanup=cleanup_ns['cleanup_owned'](command,name,run_id,attempted);result['cleanup']=cleanup
 if not cleanup['verified']and result['status']=='native-carrier-refusal-component-passed':result['status']='component-passed-cleanup-unverified'
 index={};wheel_entry=None
 with zipfile.ZipFile(out/'sources.zip','w',zipfile.ZIP_DEFLATED)as archive:
  for i,(path,data)in enumerate(frozen.items()):
   if path in [str(native),str(shim)]:continue
   member='files/'+str(i)+'/'+pathlib.Path(path).name;archive.writestr(member,data);index[path]={'archive':member,'sha256':sha(data)}
   if path==str(a.wheel.resolve()):wheel_entry=member
  assert wheel_entry is not None
  index[str(native)]={'wheelArchive':wheel_entry,'wheelMember':binaries[0],'sha256':sha(frozen[str(native)])};index[str(shim)]={'wheelArchive':wheel_entry,'wheelMember':'weft/__init__.py','sha256':sha(frozen[str(shim)])}
  archive.writestr('index.json',json.dumps(index,indent=2))
 result['sourceArchiveSha256']=sha((out/'sources.zip').read_bytes())
 (out/'receipt.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['status']=='native-carrier-refusal-component-passed'
print(json.dumps({'status':result['status'],'observations':len(observations),'issuedQueries':len(issued),'cleanupVerified':cleanup['verified']}))
