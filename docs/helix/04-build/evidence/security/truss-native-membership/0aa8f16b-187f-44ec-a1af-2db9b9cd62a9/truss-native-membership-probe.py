"""Fixed graph membership on original Truss 0.16 DDL, not backend admission."""
import hashlib,json,os,secrets,subprocess,time,uuid
from pathlib import Path
root=Path.cwd().resolve()
paths=['tools/security/truss-native-membership-probe.py','tests/security/native/truss-layout-source-epoch-0.16.sql','tests/security/native/truss-graph-membership-overlay.sql','tests/security/native/pg-raw-membership-oracle.json','docs/helix/03-test/security/cases.json']
original=Path('/Users/erik/Projects/truss/docs/helix/04-build/evidence/source-epoch-layout-0.16.owner-export.sql')
frozen={p:(root/p).read_bytes() for p in paths};frozen[str(original)]=original.read_bytes()
if frozen[paths[1]]!=frozen[str(original)]:raise RuntimeError('Original owner export differs')
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
oracle=json.loads(frozen[paths[3]]);facts=oracle['facts'];actors=list(oracle['actors'])
case=next(c for c in json.loads(frozen[paths[4]])['cases'] if c['id']=='truss.B01')
run_id=str(uuid.uuid4());name='umf-truss-membership-'+run_id;container=None;attempted=False
out=root/'docs/helix/04-build/evidence/security/truss-native-membership'/run_id
out.mkdir(parents=True);observations=[];transcripts=[];receipt=None
credentials={a:secrets.token_hex(32) for a in ['postgres']+actors}
(out/'start.json').write_text(json.dumps({'runId':run_id,'sourcePins':pins,'originalCase':case},indent=2)+'\n')
for p in paths[:3]:(out/Path(p).name).write_bytes(frozen[p])
def command(args,**kw):return subprocess.run(args,capture_output=True,text=True,timeout=kw.pop('timeout',30),**kw)
def require(r):
 if r.returncode:raise RuntimeError('Native command failed: '+r.stderr[:400])
 return r.stdout.strip()
def admin(q):return require(command(['docker','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres'],input=q))
def check(label,expected,actual):
 observations.append({'id':label,'expected':expected,'observed':actual})
 if expected!=actual:raise AssertionError(label)
def actor_query(actor,q):
 marker='STATE_'+uuid.uuid4().hex
 r=command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -d postgres -U "$1"','auth',actor],input=credentials[actor]+'\n'+q+';\n\\echo '+marker+' :SQLSTATE\n')
 require(r);lines=r.stdout.strip().splitlines()
 if not lines or not lines[-1].startswith(marker+' '):raise RuntimeError('Native state marker missing')
 state=lines.pop().split()[1]
 transcripts.append({'actor':actor,'sql':q,'sqlstate':state,'stdout':lines,'stderr':r.stderr})
 return state,lines
def value(actor,q):
 state,lines=actor_query(actor,q);check(actor+':query-success','00000',state)
 if len(lines)!=1:raise RuntimeError('Expected one native JSON value')
 return json.loads(lines[0])
def lit(x):return "'"+str(x).replace("'","''")+"'"
def js(x):return lit(json.dumps(x,separators=(',',':')))+'::jsonb'
# Deliberately overlapping storage IDs: identity always includes native type.
ids={k:{row[0]:i+1 for i,row in enumerate(facts[k])} for k in ['employee','project','resource','company']}
seed=["INSERT INTO truss.schema_doc VALUES (0,1,'urn:umf:synthetic:graph-membership','1','0.8.0','fixture','{}','{}');"]
for t,n in [(1,'Staff'),(2,'Project'),(3,'Resource'),(4,'Client')]:
 seed.append("INSERT INTO truss.type_def(document_id,type_id,module,element,kind,since_rev,doc_ord,lineage_profile,lineage_bytes) VALUES ('urn:umf:synthetic:graph-membership',"+str(t)+",'fixture',"+lit(n)+",'entity',0,1,'synthetic',decode('01','hex'));")
for r,s,t,n in [(11,1,2,'Assignment'),(12,3,2,'Ownership'),(13,2,4,'ProjectClient'),(14,3,2,'WrongOwnership'),(15,1,2,'WrongAssignment')]:
 seed.append("INSERT INTO truss.rel_def(document_id,rel_type_id,module,rel_id,name,source_min,target_min,lifecycle,directed,since_rev,doc_ord) VALUES ('urn:umf:synthetic:graph-membership',"+str(r)+",'fixture',"+lit(n)+','+lit(n)+",0,0,'reference',true,0,1); INSERT INTO truss.rel_endpoint VALUES ("+str(r)+','+str(s)+','+str(t)+');')
private={r[0]:(r[1],r[2]) for r in facts['resource_private_carrier']}
def obj(i,t,p,ret=None):seed.append('INSERT INTO truss.object(id,type_id,props,retained,rev) VALUES ('+str(i)+','+str(t)+','+js(p)+','+('NULL' if ret is None else js(ret))+',0);')
for key,login in facts['employee']:obj(ids['employee'][key],1,{'201':login})
for key,client in facts['project']:obj(ids['project'][key],2,{'101':key})
for row in facts['company']:obj(ids['company'][row[0]],4,{'101':row[0]})
for key,title in facts['resource']:
 p,ret=private[key];obj(ids['resource'][key],3,{'101':key,'102':title,'999':p},{'privateHex':ret})
def edge(r,s,st,t,tt,p):seed.append('INSERT INTO truss.edge(rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES ('+','.join(map(str,[r,s,st,t,tt]))+','+js(p)+',0);')
for staff,project,active in facts['m2m_employee_project']:edge(11,ids['employee'][staff],1,ids['project'][project],2,{'301':active})
for resource,project in facts['m2m_resource_project']:edge(12,ids['resource'][resource],3,ids['project'][project],2,{})
for project,client in facts['project']:edge(13,ids['project'][project],2,ids['company'][client],4,{})
edge(14,ids['resource']['RD'],3,ids['project']['A'],2,{})
edge(15,ids['employee']['Alice'],1,ids['project']['D'],2,{'301':True})
seed_sql='\n'.join(seed)+'\n';(out/'seed.sql').write_text(seed_sql)
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture refused')
 attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 deadline=time.monotonic()+35
 while command(['docker','exec',container,'pg_isready','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Native readiness')
  time.sleep(.1)
 admin(frozen[paths[1]].decode());admin(seed_sql);admin(frozen[paths[2]].decode())
 for actor in actors:admin('ALTER ROLE '+actor+' PASSWORD '+lit(credentials[actor]))
 engine=json.loads(admin("SELECT json_build_object('number',current_setting('server_version_num'),'build',version())"));check('engine','170009',engine['number'])
 def rows(actor):return value(actor,"SELECT COALESCE(json_agg(json_build_array(resource_id,value) ORDER BY resource_id COLLATE \"C\"),'[]'::json) FROM truss.security_resources()")
 for actor in actors:
  check(actor+':native-ordinary',{'user':actor,'super':'off','bypass':False},value(actor,"SELECT json_build_object('user',session_user,'super',current_setting('is_superuser'),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))"))
  check(actor+':shared-oracle',oracle['actors'][actor]['rows'],rows(actor))
  expected=sorted(ids['resource'][k] for k in oracle['actors'][actor]['ids'])
  check(actor+':direct-rls-identities',expected,value(actor,"SELECT COALESCE(json_agg(id ORDER BY id),'[]'::json) FROM truss.object"))
  check(actor+':count',len(expected),value(actor,'SELECT to_json(count(*)) FROM truss.security_resources()'))
  for label,q in [('property-bag','SELECT props FROM truss.object'),('retained','SELECT retained FROM truss.object'),('hidden-edges','SELECT * FROM truss.edge'),('write','DELETE FROM truss.object'),('owner-transition','SET ROLE umf_graph_guardian')]:
   state,output=actor_query(actor,q);check(actor+':denied:'+label,'42501',state);check(actor+':no-output:'+label,[],output)
 # Physical endpoint constraint must reject reversed roles, despite IDs existing.
 state,output=actor_query('umf_sec_alice','INSERT INTO truss.edge(rel_type_id,source_id,source_type,target_id,target_type,rev) VALUES (11,1,2,1,1,0)')
 check('ordinary-edge-insert-denied','42501',state)
 # Installer is an explicit exclusion: failed insertion recorded separately.
 invalid=command(['docker','exec','-i',container,'psql','-X','-q','-A','-t','-U','postgres'],input="\\set VERBOSITY verbose\nINSERT INTO truss.edge(rel_type_id,source_id,source_type,target_id,target_type,rev) VALUES (11,1,2,1,1,0);\n\\echo STATE :SQLSTATE\n")
 require(invalid);check('native-reversed-endpoint-fk',True,'STATE 23503' in invalid.stdout and 'edge_endpoint_types_fk' in invalid.stderr)
 transcripts.append({'actor':'excluded-installer','sql':'reversed declared endpoint roles','stdout':invalid.stdout,'stderr':invalid.stderr})
 original_predicate=frozen[paths[2]].decode().split('AS $policy$\n')[1].split('\n$policy$;')[0]
 def predicate(p):admin('CREATE OR REPLACE FUNCTION truss.security_allowed(resource_id bigint,resource_type int) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $policy$\n'+p+'\n$policy$;')
 for label,weak,extra in [('inactive',original_predicate.replace("AND assignment.props->'301'='true'::jsonb",''),['RB']),('relationship',original_predicate.replace('own.rel_type_id=12 AND ','').replace('assignment.rel_type_id=11 AND ',''),['RD'])]:
  check(label+':changed',True,weak!=original_predicate);predicate(weak)
  leaked=rows('umf_sec_alice');check(label+':counterexample',True,all(k in [r[0] for r in leaked] for k in extra))
  predicate(original_predicate)
  for actor in actors:check(label+':restored:'+actor,oracle['actors'][actor]['rows'],rows(actor))
 if any((Path(p) if Path(p).is_absolute() else root/p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Frozen source changed')
 receipt={'status':'scoped-native-checks-passed','runId':run_id,'sourcePins':pins,'seedSha256':hashlib.sha256(seed_sql.encode()).hexdigest(),'engine':engine,'imageId':require(command(['docker','inspect','--format','{{.Image}}',container])),'observations':observations,'transcripts':transcripts,'scope':'Exact review-only Truss source-epoch0.16 DDL; synthetic fixed numeric field/type/relationship mapping; independent raw oracle actor rows. Ordinary SCRAM actors, overlapping typed storage IDs, hidden bag/retained/edges denied, typed endpoint FK and erased active/relationship controls. Excluded NOLOGIN table owner bypasses RLS for fixed definer projections. No Weft lowering, accepted catalog, canonical business-key binding, ambiguous/missing Staff refusal, force-RLS owner protection, general query/disclosure, authenticated installation/source-cut, current-authority drain or complete native diagnostics closure. No original acceptance case promotion.'}
except BaseException as e:
 (out/'failed.json').write_text(json.dumps({'error':type(e).__name__,'observations':observations,'transcripts':transcripts},indent=2)+'\n');raise
finally:
 if container is None and attempted:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous owned fixture')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing native receipt')
(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'observations':len(observations),'evidence':str(out)}))
