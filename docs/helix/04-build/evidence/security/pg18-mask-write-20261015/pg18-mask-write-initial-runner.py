"""Fixed P04 implementation component; unbound until reviewed. No general backend qualification."""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
# The exact reviewed image includes the e0414067 segment; reject accidental pins.
IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
if len(sys.argv)!=3 or sys.argv[1]!='--output':raise ValueError('Explicit component output required')
run_id=str(uuid.uuid4());output=Path(sys.argv[2]);sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('oracle',ROOT/'tests/security/native/pg18-mask-write-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(r):
 if r.returncode:raise RuntimeError(r.stderr[:3000])
 return r.stdout.strip()
sha=lambda b:hashlib.sha256(b).hexdigest();canonical=oracle.canonical
observations=[]
def check(label,expected,actual):
 if canonical(expected)!=canonical(actual):raise AssertionError(dict(label=label,expected=expected,actual=actual))
 observations.append(dict(id=label,expected=expected,observed=actual))
paths=set()
def closure(path):
 path=path.resolve()
 if path in paths:return
 if not path.is_relative_to(ROOT.resolve()) or not path.is_file():raise ValueError('Original source required')
 paths.add(path)
 if path.suffix in ['.ts','.js']:
  for rel in re.findall(r'(?:from\s*|import\s*)[\'"](\.[^\'"]+)[\'"]',path.read_text()):
   base=path.parent/rel;found=next((p for p in [base,Path(str(base)+'.ts'),Path(str(base)+'.json'),base/'index.ts'] if p.is_file()),None)
   if found is None:raise ValueError('Unresolved import')
   closure(found)
closure(ROOT/'tests/security/native/pg18-mask-write-declarations.ts')
paths.update(ROOT/p for p in ['tests/security/native/pg18-mask-write.py','tests/security/native/pg18-mask-write.sql','tests/security/native/pg18-mask-write-oracle.py','package.json','bun.lock'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}
raw=require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-mask-write-declarations.ts']));authored=json.loads(raw);check('exact-authored-source-profile',True,oracle.admit_sources(authored))
# Native semantics are admitted only for this exact authored source, never arbitrary rules.
for label,mutate in [('mask',lambda f:f['policy']['rules'][1]['disclosure'][0]['disposition']['value'].update(integerToken='1')),('action',lambda f:f['profile'].update(updateAction='read')),('blind-binding',lambda f:f['profile']['readProtection'].update(blindWriteActions=[])),('Field',lambda f:f['profile']['fieldActions'][1]['field'].update(elementId='resourceId')),('unknown',lambda f:f['canonicalPolicy'].update(future=True))]:
 altered=copy.deepcopy(authored);mutate(altered);check('source-refusal:'+label,False,oracle.admit_sources(altered))
name='umf-sec-pg18-mask-write-'+run_id;container=None;creation_attempted=False;receipt=None;volumes=[]
credentials={actor:secrets.token_hex(32) for actor in ['postgres',*oracle.ACTORS,oracle.OUTSIDER]}
def sql(q,actor='postgres',quiet=True):
 args=['psql','-X',*(['-q'] if quiet else []),'-At','-v','ON_ERROR_STOP=1']
 if actor=='postgres':return command(['docker','exec','-i',container,*args,'-U','postgres'],input=q)
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec "$@"','auth',*args,'-h','127.0.0.1','-U',actor,'-d','postgres'],input=credentials[actor]+'\nSET search_path=pg_catalog;\n'+q)
def value(q,actor='postgres'):return json.loads(require(sql(q,actor)))
def literal(v):return "E'"+v.replace('\\','\\\\').replace("'","''")+"'"
def number(v):return 'NULL' if v is None else str(int(v))+'::bigint'
def amount():return value("SELECT to_json(amount::text) FROM security_mask_write.resource WHERE id='r1';")
def effects():
 v=value("SELECT json_build_object('value',last_value::text,'called',is_called) FROM security_mask_write.effects;");return int(v['value']) if v['called'] else 0
def denied(q,actor,code='42501'):
 r=sql('\\set VERBOSITY verbose\n'+q,actor);codes=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',r.stderr,re.M)
 if r.returncode!=3 or r.stdout!='' or codes!=[code]:raise AssertionError(dict(exit=r.returncode,stdout=r.stdout,stderr=r.stderr))
 return dict(status='refused',sqlstate=code,rows=[])
REFUSAL=dict(status='refused',sqlstate='42501',rows=[])
def interrupted(signum,frame):raise SystemExit('Interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
def same_session(function):
 q="""DO $probe$ DECLARE responses jsonb:='[]'; proposed bigint; code text; BEGIN
 FOREACH proposed IN ARRAY ARRAY[100,201,0] LOOP
  BEGIN PERFORM security_mask_write.FUNCTION('r1',proposed); code:='acknowledged';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
  responses:=responses||to_jsonb(code);
 END LOOP;
 RAISE NOTICE 'intent_probe:%',json_build_object('pid',pg_backend_pid(),'actor',session_user,'responses',responses);
 END $probe$;""".replace('FUNCTION',function)
 r=sql(q,'umf_sec_mw_masked');require(r);matches=re.findall(r'^NOTICE:\s+intent_probe:(.*)$',r.stderr,re.M)
 if len(matches)!=1 or r.stdout:raise AssertionError('Missing same-session probe')
 return json.loads(matches[0])
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Existing fixture refused')
 creation_attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',IMAGE],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 info=json.loads(require(command(['docker','inspect',container])))[0];volumes=[m['Name'] for m in info['Mounts'] if m['Type']=='volume'];check('image',IMAGE.split('@')[1],info['Image']);deadline=time.monotonic()+20
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness expired')
  time.sleep(.1)
 check('engine','180006',value("SELECT to_json(current_setting('server_version_num'));"));require(sql((ROOT/'tests/security/native/pg18-mask-write.sql').read_text()))
 for actor in [*oracle.ACTORS,oracle.OUTSIDER]:require(sql('CREATE ROLE '+actor+" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '"+credentials[actor]+"'; GRANT USAGE ON SCHEMA security_mask_write TO "+actor+'; GRANT SELECT ON security_mask_write.disclosed TO '+actor+'; GRANT EXECUTE ON FUNCTION security_mask_write.assign_amount(text,bigint) TO '+actor+';'))
 for actor,(c,n,f,b) in oracle.ACTORS.items():require(sql('INSERT INTO security_mask_write.subject VALUES('+','.join([literal(actor),literal(c),str(n),str(f),str(b)])+');'))
 captured=value("SELECT json_agg(json_build_object('login',login,'readClass',read_class,'normal',normal_allowed,'field',field_allowed,'blind',blind_allowed) ORDER BY login) FROM security_mask_write.subject;");check('actual-enrolled-subject-facts',sorted(oracle.subjects(),key=lambda x:x['login']),captured)
 logical=json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-mask-write-declarations.ts'],input=json.dumps(dict(subjects=captured,vectors=oracle.VECTORS)))))
 check('source-preserved-through-logical-evaluation',authored,logical['sources']);check('exact-logical-vector-list',[v['id'] for v in oracle.VECTORS],[r['id'] for r in logical['results']])
 for v,r in zip(oracle.VECTORS,logical['results']):check('logical:'+v['id'],[oracle.logical(v['actor'],v['before'],v['proposed'])]*2+[False,False],[r['legacy'],r['current'],r['complete'],r['authority']])
 for actor in [*oracle.ACTORS,oracle.OUTSIDER]:
  check('identity:'+actor,[actor,actor,False,False],value("SELECT json_build_array(session_user,current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor))
  for q in ['SELECT amount FROM security_mask_write.resource;','SELECT * FROM security_mask_write.subject;',"UPDATE security_mask_write.resource SET amount=0 RETURNING old.amount,new.amount;"]:check('base-denied:'+actor+':'+q,REFUSAL,denied(q,actor))
  if actor in oracle.ACTORS:check('tagged-read:'+actor,oracle.disclosed(actor,'100'),value("SELECT coalesce(json_agg(v ORDER BY id),'[]'::json) FROM security_mask_write.disclosed v;",actor))
 for v in oracle.VECTORS:
  require(sql('UPDATE security_mask_write.resource SET amount='+number(v['before'])+" WHERE id='r1';"));before_effects=effects();q="SELECT security_mask_write.assign_amount('r1',"+number(v['proposed'])+');';allowed=oracle.intent(v['actor'])
  check('native:'+v['id'],dict(status='acknowledged') if allowed else REFUSAL,value(q,v['actor']) if allowed else denied(q,v['actor']))
  check('canonical:'+v['id'],v['proposed'] if allowed else v['before'],amount());check('effects:'+v['id'],before_effects+int(allowed and v['before']!=v['proposed']),effects())
 require(sql("UPDATE security_mask_write.resource SET amount=100 WHERE id='r1';"))
 check('same-session-guesses-strong',['42501']*3,same_session('assign_amount')['responses'])
 for isolation in ['REPEATABLE READ','SERIALIZABLE']:check('unsupported-isolation:'+isolation,dict(status='refused',sqlstate='0A000',rows=[]),denied('BEGIN ISOLATION LEVEL '+isolation+"; SELECT pg_current_snapshot(); SELECT security_mask_write.assign_amount('r1',0);",'umf_sec_mw_masked','0A000'))
 # Native context errors can follow a public snapshot row; use a separate strict probe later.
 receipt=dict(status='component-passed',acceptanceReceipt=False,casePromoted=None,runId=run_id,sourceDigests=sources,observations=observations,authored=authored,logicalResults=logical['results'],scope='Fixed assignment-intent component; P04 remains unbound pending remaining controls and independent review.',nativeInventory=dict(image=info['Image'],cleanup=None))
finally:
 if creation_attempted:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture')
  if matches:
   own=json.loads(require(command(['docker','inspect',matches[0]])))[0]
   if own['Config']['Labels'].get('umf.security.run')!=run_id:raise RuntimeError('Foreign cleanup refused')
   volumes=[m['Name'] for m in own['Mounts'] if m['Type']=='volume']
   for volume in volumes:
    users=require(command(['docker','container','ls','-a','--filter','volume='+volume,'--format','{{.ID}}'])).splitlines()
    if any(not own['Id'].startswith(u) for u in users):raise RuntimeError('Shared volume refused')
   require(command(['docker','rm','-fv',matches[0]]))
  cleanup=dict(containerAbsent=name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines(),volumesAbsent=not any(v in require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines() for v in volumes));assert all(cleanup.values())
  if receipt is not None:receipt['nativeInventory']['cleanup']=cleanup
if receipt is None:raise RuntimeError('No receipt')
if any(sha((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Source drift')
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],observations=len(observations),output=str(output))))
