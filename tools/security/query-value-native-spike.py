"""PG18 finite type/class/order primitives only. No actor/policy/registration qualification."""
import hashlib,json,os,pathlib,re,secrets,subprocess,sys,time,uuid
IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
sources=['tools/security/query-value-native-spike.py','tools/security/prove-query-value-sources.py'];pins_before={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in sources}
out=pathlib.Path(sys.argv[1]);assert not out.exists(),'Fresh receipt path required';name='umf-query-value-'+str(uuid.uuid4());container=None;checks=[];error=None
cases=[
 ('read-dto-type-diff',"SELECT json_build_array(pg_typeof(v)::text,pg_typeof('masked'::text)::text) FROM (VALUES(11)) t(v);",['integer','text'],None),
 ('incompatible-operand-before-limit-zero',"SELECT 1 FROM (VALUES('masked'::text)) t(v) WHERE v=11 LIMIT 0;",None,'42883'),
 ('incompatible-operand-even-empty',"SELECT 1 FROM (SELECT 'masked'::text v WHERE false) t WHERE v=11 LIMIT 0;",None,'42883'),
 ('read-nullability-changes-count',"SELECT json_build_array(count(v),count(NULL::text)) FROM (VALUES(11),(12)) t(v);",[2,0],None),
 ('generalized-equality-classes',"SELECT json_build_array(count(DISTINCT v),count(DISTINCT floor(v::numeric/10))) FROM (VALUES(11),(12)) t(v);",[2,1],None),
 ('deterministic-is-not-injective',"SELECT json_build_array(11<>12,floor(11::numeric/10)=floor(12::numeric/10));",[True,True],None),
 ('same-expression-scope',"SELECT to_json(md5('key-a:'||'11')=md5('key-a:'||'11'));",True,None),
 ('different-key-expression-scope',"SELECT json_build_array(11=11,md5('key-a:'||'11')<>md5('key-b:'||'11'));",[True,True],None),
 ('mixed-asc-desc',"SELECT json_agg(json_build_array(a,b) ORDER BY a ASC,b DESC) FROM (VALUES(1,1),(1,2),(2,1),(2,2)) t(a,b);",[[1,2],[1,1],[2,2],[2,1]],None),
 ('mixed-desc-asc',"SELECT json_agg(json_build_array(a,b) ORDER BY a DESC,b ASC) FROM (VALUES(1,1),(1,2),(2,1),(2,2)) t(a,b);",[[2,1],[2,2],[1,1],[1,2]],None),
 ('stored-original-live-domain',"WITH live(token) AS (VALUES('opaque-token'::text)) SELECT json_build_array(token,pg_typeof(token)::text) FROM live;",['opaque-token','text'],None),
 ('pre-storage-domain-is-not-live-member',"WITH live(token) AS (VALUES('opaque-token'::text)) SELECT clear FROM live;",None,'42703'),
 ('no-implicit-token-to-input-domain',"WITH live(token) AS (VALUES('opaque-token'::text)) SELECT token::integer FROM live;",None,'22P02'),
 ('sql-null-alone-loses-cell-tags',"SELECT json_build_object('rows',count(*),'scalarValues',count(v),'tags',json_agg(tag ORDER BY ordinal)) FROM (VALUES(0,'original-null',NULL::text),(1,'transformed-null',NULL::text),(2,'absent',NULL::text),(3,'withheld',NULL::text)) t(ordinal,tag,v);",{'rows':4,'scalarValues':0,'tags':['original-null','transformed-null','absent','withheld']},None),
]
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(result):
 if result.returncode:raise RuntimeError(result.stderr[:2000])
 return result.stdout.strip()
cleanup={};versions={}
try:
 container=require(command(['docker','create','--network','none','--name',name,'--label','umf.security.query-value-primitives=1','-e','POSTGRES_PASSWORD',IMAGE],env={**os.environ,'POSTGRES_PASSWORD':secrets.token_hex(32)},timeout=30));require(command(['docker','start',container],timeout=20))
 for _ in range(100):
  logs=command(['docker','logs',container],timeout=5)
  if logs.returncode==0 and 'PostgreSQL init process complete; ready for start up.' in logs.stdout and command(['docker','exec',container,'pg_isready','-U','postgres'],timeout=5).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('Native primitive server did not become ready')
 def sql(text):return command(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','postgres'],input='SET search_path=pg_catalog;\n'+text)
 versions['server']=require(sql("SELECT current_setting('server_version');"));assert versions['server'].startswith('18.6')
 versions['imageDigest']=IMAGE;versions['python']=sys.version
 for label,text,expected,sqlstate in cases:
  result=sql(text);actual=None;codes=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',result.stderr,re.M)
  if sqlstate:passed=result.returncode==3 and result.stdout=='' and codes==[sqlstate]
  else:
   if result.returncode==0 and result.stderr=='':actual=json.loads(result.stdout)
   passed=result.returncode==0 and result.stderr=='' and actual==expected
  checks.append({'id':label,'sql':text,'expected':expected,'expectedSqlstate':sqlstate,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'observed':actual,'passed':passed})
  assert passed,label
except BaseException as failure:error=repr(failure);raise
finally:
 if container:
  owned=json.loads(require(command(['docker','inspect',container])))[0]
  volumes=[m['Name'] for m in owned.get('Mounts',[]) if m.get('Type')=='volume']
  removal=command(['docker','rm','--force','--volumes',container],timeout=20)
  inventory=command(['docker','container','ls','-a','--no-trunc','--format','{{.ID}} {{.Names}}'])
  volume_inventory=command(['docker','volume','ls','--format','{{.Name}}'])
  container_absent=inventory.returncode==0 and all(container not in line.split() and name not in line.split() for line in inventory.stdout.splitlines())
  volumes_absent=volume_inventory.returncode==0 and not set(volumes).intersection(volume_inventory.stdout.splitlines())
  cleanup={'removeExitCode':removal.returncode,'containerInventoryExitCode':inventory.returncode,'volumeInventoryExitCode':volume_inventory.returncode,'containerAbsent':container_absent,'ownedVolumes':volumes,'ownedVolumesAbsent':volumes_absent}
 pins={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in sources}
 cleanup_ok=cleanup.get('removeExitCode')==0 and cleanup.get('containerAbsent') and cleanup.get('ownedVolumesAbsent')
 passed=error is None and cleanup_ok and pins==pins_before and len(checks)==len(cases)
 out.write_text(json.dumps({'status':'primitive-observations-passed' if passed else 'failed','versions':versions,'checks':checks,'error':error,'cleanup':cleanup,'selectedSourceDigestsBefore':pins_before,'selectedSourceDigests':pins,'sourcesUnchanged':pins==pins_before,'scope':'Finite isolated PostgreSQL owner-context VALUES/CTE type, equality-class, count and order primitives. Built-in MD5 here is only a deterministic expression/scope witness, not catalog/hash/key qualification. No ordinary actor authentication, RLS/RBAC/ABAC, policy/query compiler, immutable registration, storage/vault protection, current authority, protected query admission or backend case is qualified.','acceptanceCasesPromoted':[]},indent=2)+'\n')
 if error is None:assert passed,'Cleanup or selected-source custody failed'
print(json.dumps({'status':'primitive-observations-passed','cases':len(checks),'postgres':versions['server'],'cleaned':cleanup['containerAbsent']}))
