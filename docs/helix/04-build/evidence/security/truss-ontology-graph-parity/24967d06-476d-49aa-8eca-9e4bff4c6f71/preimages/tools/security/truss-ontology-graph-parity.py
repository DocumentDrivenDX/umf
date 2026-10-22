"""Actual owner-export graph tables, retained original IR; installer-only parity."""
import hashlib,json,sys,tempfile,uuid,subprocess,importlib.metadata
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import pg8000.native,pgserver
ROOT=Path(__file__).resolve().parents[2];SELF='tools/security/truss-ontology-graph-parity.py'
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
TRUSS='/Users/erik/Projects/truss/';LAYOUT=TRUSS+'docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql'
IR='docs/helix/04-build/evidence/security/weft-handoff.json'
RAW='docs/helix/04-build/evidence/security/truss-ontology-capture-candidate/a91be6ca-a0de-417d-bc51-aec34faaeb41/native.json'
paths=[SELF,'tools/security/truss-ontology-graph-parity.ts',LAYOUT,IR,RAW,TRUSS+'packages/postgresql/src/security-predicate.ts',TRUSS+'packages/postgresql/src/security-graph-source.ts','docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md','docs/helix/01-frame/user-stories/US-056-security-bindings.md']
frozen={p:(ROOT/p).read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest();pins={p:sha(b) for p,b in frozen.items()}
out=ROOT/'docs/helix/04-build/evidence/security/truss-ontology-graph-parity'/str(uuid.uuid4());out.mkdir(parents=True)
for p,b in frozen.items():
 t=out/'preimages'/p.lstrip('/');t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins},indent=2)+'\n')
checks=[];connections=[];server=None;temporary=None
try:
 if importlib.metadata.version('pgserver')!='0.1.4+truss.pg16.15' or importlib.metadata.version('pg8000')!='1.31.5':raise ValueError('Unqualified runtime')
 temporary=tempfile.TemporaryDirectory(prefix='umf-graph-parity-');server=pgserver.get_server(Path(temporary.name)/'db',cleanup_mode='delete')
 uri=urlparse(server.get_uri());host=parse_qs(uri.query).get('host',[uri.hostname])[0];port=uri.port or 5432
 def connect(user):
  c=pg8000.native.Connection(user=user,database=uri.path.lstrip('/'),unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5);connections.append(c);return c
 def expect(name,expected,observed):
  checks.append({'id':name,'expected':expected,'observed':observed})
  if expected!=observed:raise ValueError(name)
 admin=connect('postgres');expect('postgresql16.15',[['160015']],admin.run('SHOW server_version_num'));expect('bun1.4.2','1.4.2',subprocess.run(['bun','--version'],capture_output=True,text=True,check=True,timeout=5).stdout.strip())
 compiler=out/'frozen-lowerer';compiler.mkdir()
 for name,p in [('bridge.ts','tools/security/truss-ontology-graph-parity.ts'),('security-predicate.ts',TRUSS+'packages/postgresql/src/security-predicate.ts'),('security-graph-source.ts',TRUSS+'packages/postgresql/src/security-graph-source.ts')]: (compiler/name).write_bytes(frozen[p])
 artifact=next(a for a in json.loads(frozen[IR])['artifacts'] if a['id']=='natural-count-self-join')
 lower=subprocess.run(['bun',str(compiler/'bridge.ts')],input=json.dumps({'artifact':artifact}),text=True,capture_output=True,timeout=15)
 if lower.returncode or lower.stderr or len(lower.stdout)>1000000:raise ValueError('Frozen bridge unavailable')
 packet=json.loads(lower.stdout)
 if packet['version']!='umf.security.graph-parity-candidate/0.1.0':raise ValueError('Unknown candidate')
 (out/'lowered-predicate.json').write_text(json.dumps({'artifactId':artifact['id'],'compiledOwnerIr':artifact['handoff']['securityLogicalPlan'],'packet':packet},indent=2)+'\n')
 admin.run(frozen[LAYOUT].decode());admin.run("INSERT INTO truss.schema_doc VALUES(0,0,'domain','1','3','fixture','{}','{}'); CREATE ROLE pc_actor LOGIN NOSUPERUSER NOBYPASSRLS")
 for name,s in packet['specs'].items():
  admin.run("INSERT INTO truss.type_def(document_id,type_id,module,element,kind,since_rev,doc_ord,lineage_profile,lineage_bytes) VALUES('domain',:t,'m',:e,'record',0,0,'fixture',decode('01','hex'))",t=int(s['owner']),e=name)
  for field,prop,col,scalar in s['fields']:
   admin.run("INSERT INTO truss.prop_def(prop_id,type_id,element,name,scalar_type,nullability,cardinality,home,since_rev,doc_ord) VALUES(:p,:t,:e,:n,:s,'required','one','json',0,0)",p=int(prop),t=int(s['owner']),e=field,n=col,s=scalar)
 for rel,assoc,source,target,name in [(41,4,1,2,'Assignment'),(51,5,3,2,'Ownership')]:
  admin.run("INSERT INTO truss.rel_def(document_id,rel_type_id,module,rel_id,name,source_min,target_min,lifecycle,directed,assoc_type_id,since_rev,doc_ord) VALUES('domain',:r,'m',:n,:n,0,0,'independent',true,:a,0,0)",r=rel,n=name,a=assoc)
  admin.run('INSERT INTO truss.rel_endpoint VALUES(:r,:s,:t)',r=rel,s=source,t=target)
 objects=[(1,1,{'101':'Alice','102':'pc_actor'}),(2,1,{'101':'Bob','102':'pc_other'}),(1,2,{'201':'A'}),(11,2,{'201':'B'}),(12,2,{'201':'D'}),(20,3,{'301':'RA'}),(21,3,{'301':'RAB'}),(22,3,{'301':'RB'}),(23,3,{'301':'RD'}),(24,3,{'301':'RO'})]
 for oid,t,props in objects:admin.run('INSERT INTO truss.object(id,type_id,props,rev) VALUES(:i,:t,:p::jsonb,0)',i=oid,t=t,p=json.dumps(props))
 edges=[(100,41,1,1,1,2,{'401':'Alice','402':'A','403':True}),(101,41,1,1,11,2,{'401':'Alice','402':'B','403':False}),(102,41,2,1,11,2,{'401':'Bob','402':'B','403':True}),(200,51,20,3,1,2,{'501':'RA','502':'A'}),(201,51,22,3,11,2,{'501':'RB','502':'B'}),(202,51,23,3,12,2,{'501':'RD','502':'D'}),(203,51,21,3,1,2,{'501':'RAB','502':'A'}),(204,51,21,3,11,2,{'501':'RAB','502':'B'})]
 for i,r,s,st,t,tt,p in edges:admin.run('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES(:i,:r,:s,:st,:t,:tt,:p::jsonb,0)',i=i,r=r,s=s,st=st,t=t,tt=tt,p=json.dumps(p))
 sources=packet['sources'];guard_parts=['((SELECT valid FROM ('+v['validitySql']+') q)::boolean) IS TRUE' for v in sources.values()]
 for name,columns in [('Staff',['id']),('Project',['id']),('Resource',['id']),('Assignment',['employee_id','project_id']),('Ownership',['resource_id','project_id']),('Staff',['native_login'])]:
  guard_parts.append('NOT EXISTS(SELECT 1 FROM ('+sources[name]['sql']+') q GROUP BY '+','.join('"'+c+'"' for c in columns)+' HAVING count(*)<>1)')
 for rel,source_type,target_type,source_property,target_property,source_identity,target_identity in [(41,1,2,'401','402','101','201'),(51,3,2,'501','502','301','201')]:
  guard_parts.append("NOT EXISTS(SELECT 1 FROM truss.edge e LEFT JOIN truss.object s ON s.id=e.source_id AND s.type_id=e.source_type LEFT JOIN truss.object t ON t.id=e.target_id AND t.type_id=e.target_type WHERE e.rel_type_id="+str(rel)+" AND (e.source_type<>"+str(source_type)+" OR e.target_type<>"+str(target_type)+" OR s.id IS NULL OR t.id IS NULL OR (e.props->>'"+source_property+"') IS DISTINCT FROM (s.props->>'"+source_identity+"') OR (e.props->>'"+target_property+"') IS DISTINCT FROM (t.props->>'"+target_identity+"')))")
 guard=' AND '.join('('+p+')' for p in guard_parts)
 generated="""CREATE SCHEMA parity; REVOKE ALL ON SCHEMA parity FROM PUBLIC; GRANT USAGE ON SCHEMA parity TO pc_actor; CREATE FUNCTION parity.read_receipt(resource text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$ BEGIN IF NOT ("""+guard+""") THEN RAISE EXCEPTION 'Graph candidate unavailable' USING ERRCODE='42501'; END IF; RETURN ("""+packet['sql']+"""); END $body$; REVOKE ALL ON FUNCTION parity.read_receipt(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION parity.read_receipt(text) TO pc_actor;"""
 (out/'installed.sql').write_text(generated);admin.run(generated)
 actor=connect('pc_actor');actor.run('BEGIN')
 resources=['RA','RAB','RB','RD','RO','UNKNOWN'];initial=[True,True,False,False,False,False]
 for resource,expected in zip(resources,initial):expect('graph-initial-'+resource,[[expected]],actor.run('SELECT parity.read_receipt(:r)',r=resource))
 raw=json.loads(frozen[RAW]);expect('same-original-raw-population',raw['completeFactCuts'][0]['relations']['employee'],[[o[2]['101'],o[2]['102']] for o in objects if o[1]==1])
 expect('qualified-native-id-collision',[[2]],admin.run('SELECT count(*) FROM truss.object WHERE id=1'))
 actor.run('ROLLBACK')
 def denied(name,mutation):
  admin.run('BEGIN');admin.run(mutation)
  # Installer executes SET SESSION AUTHORIZATION so original subject is pc_actor;
  # all fixture corruption and observations share this original transaction.
  admin.run('SET SESSION AUTHORIZATION pc_actor')
  admin.run('SAVEPOINT refusal')
  try:admin.run("SELECT parity.read_receipt('RA')")
  except pg8000.exceptions.DatabaseError as error:expect(name,'42501',error.args[0].get('C'))
  else:raise ValueError(name+' admitted')
  finally:admin.run('ROLLBACK TO SAVEPOINT refusal');admin.run('RESET SESSION AUTHORIZATION');admin.run('ROLLBACK')
 mutations=[('missing-active',"UPDATE truss.edge SET props=props-'403' WHERE id=100"),('wrong-active-domain',"UPDATE truss.edge SET props=jsonb_set(props,'{403}','\"true\"') WHERE id=100"),('wrong-logical-endpoint',"UPDATE truss.edge SET props=jsonb_set(props,'{402}','\"B\"') WHERE id=100"),('wrong-native-endpoint',"UPDATE truss.edge SET target_id=11 WHERE id=100"),('duplicate-staff-key',"INSERT INTO truss.object(id,type_id,props,rev) VALUES(3,1,'{\"101\":\"Alice\",\"102\":\"other\"}',0)"),('duplicate-subject-login',"INSERT INTO truss.object(id,type_id,props,rev) VALUES(3,1,'{\"101\":\"Carol\",\"102\":\"pc_actor\"}',0)"),('retired-resource-type',"UPDATE truss.type_def SET retired_rev=0 WHERE type_id=3"),('retired-assignment-relation',"UPDATE truss.rel_def SET retired_rev=0 WHERE rel_type_id=41"),('missing-owner-property',"UPDATE truss.edge SET props=props-'501' WHERE id=200"),('wrong-active-metadata',"UPDATE truss.prop_def SET scalar_type='string' WHERE prop_id=403"),('missing-resource-key',"UPDATE truss.object SET props='{}' WHERE type_id=3 AND id=24")]
 for name,mutation in mutations:denied(name,mutation)
 expect('restored-preflight',[[True]],admin.run('SELECT '+guard))
 admin.run("UPDATE truss.edge SET props=jsonb_set(props,'{403}','false') WHERE id=100")
 for resource in resources:expect('graph-revoked-'+resource,[[False]],actor.run('SELECT parity.read_receipt(:r)',r=resource))
 expect('no-ordinary-graph-read',[[False,False]],admin.run("SELECT has_table_privilege('pc_actor','truss.object','SELECT'),has_table_privilege('pc_actor','truss.edge','SELECT')"))
 receipt={'status':'pass','sourceSha256':pins,'observations':checks,'executedSqlSha256':sha(generated.encode()),'loweredPredicateSha256':sha((out/'lowered-predicate.json').read_bytes()),'scope':'Installer-only actual owner-export graph storage and original normalized IR parity; explicit authored preflight, fixed metadata mapping','limitations':['No original catalog staging or authenticated owner artifact/source/cut admission','Natural key properties are fixture-attested; authored preflight checks incidence correspondence, not canonical key-bucket codec/namespace authority','Security-definer fixture owner is postgres; no production role/callable closure or protected original admission/publication','No concurrent authority/revocation schedule or complete backend acceptance','No automatic compiler/SQL refinement proof'],'acceptancePromoted':False}
except BaseException as error:
 try:(out/'failed.json').write_text(json.dumps({'error':type(error).__name__,'observations':checks,'sourceSha256':pins},indent=2)+'\n')
 finally:raise RuntimeError('Graph parity fixture failed; inspect bounded receipt') from None
finally:
 errors=[]
 for c in connections:
  try:c.close()
  except BaseException as e:errors.append(type(e).__name__)
 if server is not None:
  try:server.cleanup()
  except BaseException as e:errors.append(type(e).__name__)
 if temporary is not None:
  try:temporary.cleanup()
  except BaseException as e:errors.append(type(e).__name__)
 if errors:raise RuntimeError('Graph fixture cleanup failed') from None
if any((ROOT/p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Source drift')
(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'run':out.name,'observations':len(checks),'status':'pass'}))
