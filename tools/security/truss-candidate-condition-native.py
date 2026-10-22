"""Owned PostgreSQL truth diagnostics for actual draft SQL; no graph acceptance."""
import hashlib,json,os,time,uuid
from pathlib import Path
SELF=Path('tools/security/truss-candidate-condition-native.py')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown native runner source')
plan_path=Path('docs/helix/03-test/security/cases.json');plan_digest=hashlib.sha256(plan_path.read_bytes()).hexdigest()
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01';os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
source=runner.read_bytes();marker='receipt=None\ntry:\n'
if source.decode().count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
context={'__name__':'fixture_helpers'};exec(compile(source.decode().split(marker)[0],str(runner),'exec'),context)
if hashlib.sha256(plan_path.read_bytes()).hexdigest()!=plan_digest:raise RuntimeError('Helper case plan changed')
command=context['command'];require=context['require'];sql=context['sql'];value=context['value'];run_id=context['run_id'];name=context['name']
foundation_path=Path('docs/helix/04-build/evidence/security/truss-candidate-condition.json');foundation=json.loads(foundation_path.read_text())
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
sources={**foundation['sourceDigests'],**context['sources'],str(plan_path):plan_digest,str(foundation_path):digest(foundation_path),str(runner):hashlib.sha256(source).hexdigest(),str(SELF):digest(SELF)}
decision_path=Path('docs/helix/04-build/evidence/security/candidate-rule-decision-proof-input.json');decision_basis=json.loads(decision_path.read_text())
sources.update({**decision_basis['sourceDigests'],str(decision_path):digest(decision_path)})
if decision_basis['status']!='passed':raise RuntimeError('Decision SQL basis failed')
if foundation['status']!='passed' or any(digest(p)!=h for p,h in sources.items()):raise RuntimeError('Source custody differs')
observations=[];receipt=None
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Refusing preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 version=value("SELECT json_build_object('number',current_setting('server_version_num'),'build',version());")
 if version['number']!='170009':raise RuntimeError('Unqualified native engine')
 require(sql('CREATE SCHEMA candidate; CREATE TABLE candidate.ownership(own_id text PRIMARY KEY,resource_key text NOT NULL,project_key text); CREATE TABLE candidate.works_on(staff_key bigint NOT NULL,project_key text); CREATE TABLE candidate.facts(type_id int NOT NULL,own_id text,resource_key text,project_key text,staff_key bigint);'))
 schedules=[
  ('joined',"INSERT INTO candidate.ownership VALUES('o1','r1','p1'); INSERT INTO candidate.works_on VALUES(1,'p1');",True),
  ('split-graph',"INSERT INTO candidate.ownership VALUES('o1','r1','p1'); INSERT INTO candidate.works_on VALUES(1,'p2'),(2,'p1');",False),
  ('split-owner',"INSERT INTO candidate.ownership VALUES('o1','r1','p2'),('o2','r2','p1'); INSERT INTO candidate.works_on VALUES(1,'p1');",False),
  ('no-owner',"INSERT INTO candidate.works_on VALUES(1,'p1');",False),
  ('no-edge',"INSERT INTO candidate.ownership VALUES('o1','r1','p1');",False),
  ('missing-project-diagnostic',"INSERT INTO candidate.ownership VALUES('o1','r1','p1'); INSERT INTO candidate.works_on VALUES(1,NULL);",None),
  ('irrelevant-unknown',"INSERT INTO candidate.ownership VALUES('o1','r2','p1'); INSERT INTO candidate.works_on VALUES(1,NULL);",False),
  ('true-after-unknown',"INSERT INTO candidate.ownership VALUES('o0','r1','p0'),('o1','r1','p1'); INSERT INTO candidate.works_on VALUES(1,NULL),(1,'p1');",True),
 ]
 for name_case,setup,truth in schedules:
  require(sql('TRUNCATE candidate.ownership,candidate.works_on,candidate.facts; '+setup+" INSERT INTO candidate.facts SELECT 12,own_id,resource_key,project_key,NULL FROM candidate.ownership; INSERT INTO candidate.facts SELECT 11,NULL,NULL,project_key,staff_key FROM candidate.works_on; INSERT INTO candidate.facts VALUES(13,'foreign','r1','p1',1);"))
  for artifact in foundation['artifacts']:
   expected=truth if artifact['id'] in ['mixed','mixed-typed'] or truth is None else not truth
   observed=value('PREPARE draft_condition(text,bigint) AS SELECT json_build_object(\'truth\','+artifact['sql']+'); EXECUTE draft_condition(\'r1\',1);')['truth']
   observations.append({'id':name_case+'/'+artifact['id'],'expected':expected,'observed':observed})
   if observed!=expected:raise RuntimeError('Native truth differs: '+json.dumps(observations[-1]))
 # Fault injection: retaining correlation but removing a selected-type predicate
 # lets an otherwise matching foreign row supply the absent owner or edge.
 typed=next(a for a in foundation['artifacts'] if a['id']=='mixed-typed')
 for slot,tag,setup,kind in [(0,'12',"INSERT INTO candidate.facts VALUES(11,NULL,NULL,'p1',1),(13,'foreign','r1','p1',1);",'owner'),(1,'11',"INSERT INTO candidate.facts VALUES(12,'o1','r1','p1',NULL),(13,'foreign','r1','p1',1);",'edge')]:
  require(sql('TRUNCATE candidate.facts; '+setup))
  selected='("candidate_'+str(slot)+'"."type_id" OPERATOR(pg_catalog.=) E'+"'"+tag+"'"+'::pg_catalog.int4) IS TRUE AND '
  if selected not in typed['sql']:raise RuntimeError('Fault injection selector absent')
  broken=typed['sql'].replace(selected,'')
  baseline=value('PREPARE draft_condition(text,bigint) AS SELECT json_build_object(\'truth\','+typed['sql']+'); EXECUTE draft_condition(\'r1\',1);')['truth']
  observed=value('PREPARE draft_condition(text,bigint) AS SELECT json_build_object(\'truth\','+broken+'); EXECUTE draft_condition(\'r1\',1);')['truth']
  observations.append({'id':'missing-selector/'+kind,'expected':{'baseline':False,'broken':True},'observed':{'baseline':baseline,'broken':observed}})
  if observations[-1]['expected']!=observations[-1]['observed']:raise RuntimeError('Missing selector counterexample differs')
 scalar=foundation['scalarArtifacts'][0]
 for case,resource,context_value,expected in [('match',"'r1'","'r1'",True),('resource-mismatch',"'r2'","'r1'",False),('context-mismatch',"'r1'","'r2'",False),('missing-context-diagnostic',"'r1'",'NULL',None)]:
  observed=value('PREPARE draft_scalar(text,bigint,text,text) AS SELECT json_build_object(\'truth\','+scalar['sql']+'); EXECUTE draft_scalar('+resource+',1,NULL,'+context_value+');')['truth']
  observations.append({'id':'scalar/'+case,'expected':expected,'observed':observed})
  if observed!=expected:raise RuntimeError('Scalar native truth differs')
 integer=next(a for a in foundation['scalarArtifacts'] if a['id']=='original-resource-context-integer')
 for case,resource,context_value,expected in [('match','9007199254740993','9007199254740993',True),('resource-mismatch','9007199254740992','9007199254740993',False),('context-mismatch','9007199254740993','9007199254740992',False),('missing-context-diagnostic','9007199254740993','NULL',None)]:
  observed=value('PREPARE draft_integer(text,bigint,numeric,numeric) AS SELECT json_build_object(\'truth\','+integer['sql']+'); EXECUTE draft_integer(\'r1\',1,'+resource+','+context_value+');')['truth']
  observations.append({'id':'integer/'+case,'expected':expected,'observed':observed})
  if observed!=expected:raise RuntimeError('Integer native truth differs')
 for kind,native_type,matching,mismatching in [('decimal','numeric','9007199254740993.125','9007199254740993.124'),('binary','bytea',"pg_catalog.decode('00ff','hex')","pg_catalog.decode('00fe','hex')"),('boolean','bool','TRUE','FALSE')]:
  artifact=next(a for a in foundation['scalarArtifacts'] if a['id']=='original-resource-context-'+kind)
  for case,resource,context_value,expected in [('match',matching,matching,True),('resource-mismatch',mismatching,matching,False),('context-mismatch',matching,mismatching,False),('missing-context-diagnostic',matching,'NULL',None)]:
   observed=value('PREPARE draft_scalar_profile(text,bigint,'+native_type+','+native_type+') AS SELECT json_build_object(\'truth\','+artifact['sql']+'); EXECUTE draft_scalar_profile(\'r1\',1,'+resource+','+context_value+');')['truth']
   observations.append({'id':kind+'/'+case,'expected':expected,'observed':observed})
   if observed!=expected:raise RuntimeError('Native scalar profile truth differs')
 specials=[('nan',"E'NaN'::pg_catalog.numeric"),('infinity',"E'Infinity'::pg_catalog.numeric"),('negative-infinity',"E'-Infinity'::pg_catalog.numeric")]
 for artifact in [a for a in foundation['guardArtifacts'] if a['id'].startswith('negated-')]:
  kind=artifact['id'];matching='9007199254740993.125' if kind=='negated-decimal' else '9007199254740993';mismatching='9007199254740993.124' if kind=='negated-decimal' else '9007199254740992'
  invalid=specials+([('scale','0.0001'),('precision','1e17'),('extreme','1e131071')] if kind=='negated-decimal' else [('fractional','1.5')])+([('upper','9223372036854775808'),('lower','-9223372036854775809')] if kind=='negated-integer-width' else [])+[('missing','NULL')]
  suffix=' ELSE NULL::pg_catalog.bool END)'
  if not artifact['sql'].startswith('(CASE WHEN (') or not artifact['sql'].endswith(suffix):raise RuntimeError('Guard shape differs')
  broken=artifact['sql'].rsplit(' THEN ',1)[1][:-len(suffix)]
  if not broken.startswith('(NOT '):raise RuntimeError('Expected compiled negation for fault control')
  for side in ['resource','context']:
   for case,bad in invalid:
    resource,context_value=(bad,matching) if side=='resource' else (matching,bad)
    def run_guard(program):return value('PREPARE draft_guard(text,bigint,numeric,numeric) AS SELECT json_build_object(\'truth\','+program+'); EXECUTE draft_guard(\'r1\',1,'+resource+','+context_value+');')['truth']
    observed={'guarded':run_guard(artifact['sql']),'removed':run_guard(broken)};expected={'guarded':None,'removed':None if case=='missing' else True}
    observations.append({'id':'guard/'+kind+'/'+side+'/'+case,'expected':expected,'observed':observed})
    if observed!=expected:raise RuntimeError('Native domain guard fault control differs')
  for case,resource,expected_truth in [('valid-match',matching,False),('valid-mismatch',mismatching,True)]:
   context_value=matching
   observed={'guarded':run_guard(artifact['sql']),'removed':run_guard(broken)};expected={'guarded':expected_truth,'removed':expected_truth}
   observations.append({'id':'guard/'+kind+'/'+case,'expected':expected,'observed':observed})
   if observed!=expected:raise RuntimeError('Valid guard domain changed truth')
 record=next(a for a in foundation['guardArtifacts'] if a['id']=='record-string-or-true');suffix=' ELSE NULL::pg_catalog.bool END)'
 if record['sql'].count(' IS TRUE THEN ')!=1 or not record['sql'].endswith(suffix):raise RuntimeError('Record guard shape differs')
 removed=record['sql'].split(' IS TRUE THEN ',1)[1][:-len(suffix)]
 for case,setup,truth in [('invalid-selected',"INSERT INTO candidate.facts VALUES(12,'o1',NULL,'p1',NULL);",None),('invalid-foreign',"INSERT INTO candidate.facts VALUES(13,'o1',NULL,'p1',NULL);",True),('empty','',True),('valid-selected',"INSERT INTO candidate.facts VALUES(12,'o1','r2','p1',NULL);",True)]:
  require(sql('TRUNCATE candidate.facts; '+setup))
  def run_record(program):return value('PREPARE draft_record(text,bigint) AS SELECT json_build_object(\'truth\','+program+'); EXECUTE draft_record(\'r1\',1);')['truth']
  observed={'guarded':run_record(record['sql']),'removed':run_record(removed)};expected={'guarded':truth,'removed':True}
  observations.append({'id':'guard/record/'+case,'expected':expected,'observed':observed})
  if observed!=expected:raise RuntimeError('Native selected-record guard differs')
 tokens={'T':'TRUE','F':'FALSE','U':'NULL'}
 for artifact in [a for a in foundation['foldArtifacts'] if a['id'] in ['rule-fold','rule-fold-reversed']]:
  for case in foundation['expectedDecisions']:
   program='PREPARE draft_fold(bool,bool,bool) AS SELECT row_to_json(f) FROM ('+artifact['sql']+') AS f; EXECUTE draft_fold('+','.join(tokens[case[k]] for k in ['permit','require','forbid'])+');'
   decision=value(program)['decision'];truths={r['id']:value('PREPARE fold_truth(bool,bool,bool) AS SELECT json_build_object(\'truth\','+r['sql']+'); EXECUTE fold_truth('+','.join(tokens[case[k]] for k in ['permit','require','forbid'])+');')['truth'] for r in artifact['ruleTruthSqls']};observed={'decision':decision,'truths':truths};expected={'decision':case['decision'],'truths':{k:None if 'U' in [case[n] for n in ['permit','require','forbid']] else case[k]=='T' for k in ['permit','require','forbid']}};case_id='fold/'+artifact['id']+'/'+''.join(case[k] for k in ['permit','require','forbid'])
   observations.append({'id':case_id,'expected':expected,'observed':observed})
   if observed!=expected:raise RuntimeError('Native rule fold differs')
 for artifact in [a for a in foundation['foldArtifacts'] if a['id'] not in ['rule-fold','rule-fold-reversed']]:
  scoped=artifact['id'].startswith('correlated-')
  for case,project,forbid_truth in [('unknown','NULL',None),('false',"'p2'",False),('true',"'p1'",True)]:
   require(sql("TRUNCATE candidate.ownership,candidate.works_on; INSERT INTO candidate.ownership VALUES('o1','r1','p1'); INSERT INTO candidate.works_on VALUES(1,"+project+');'))
   decision=value('PREPARE correlated_fold(text,bigint) AS SELECT row_to_json(f) FROM ('+artifact['sql']+') AS f; EXECUTE correlated_fold(\'r1\',1);')['decision']
   truths={r['id']:value('PREPARE correlated_truth(text,bigint) AS SELECT json_build_object(\'truth\','+r['sql']+'); EXECUTE correlated_truth(\'r1\',1);')['truth'] for r in artifact['ruleTruthSqls']}
   expected_truths={'permit':True,'require':True,**({'forbid':forbid_truth} if scoped else {})};expected={'decision':('indeterminate' if forbid_truth is None else 'deny' if forbid_truth else 'permit') if scoped else 'permit','truths':expected_truths};observed={'decision':decision,'truths':truths}
   observations.append({'id':'fold/'+artifact['id']+'/'+case,'expected':expected,'observed':observed})
   if observed!=expected:raise RuntimeError('Correlated fold scope differs')
 # Independently supplied truth rows cover all 27 vectors; this isolates the
 # actual decision body from condition compilation and shared scalar guards.
 decision_body=decision_basis['artifacts'][0]['decisionSql']
 decision_program="WITH candidate_rule_truths(rule_index,effect,truth) AS MATERIALIZED (VALUES (0::pg_catalog.int4,E'permit'::pg_catalog.text COLLATE pg_catalog.\"C\",$1::pg_catalog.bool),(1::pg_catalog.int4,E'require'::pg_catalog.text COLLATE pg_catalog.\"C\",$2::pg_catalog.bool),(2::pg_catalog.int4,E'forbid'::pg_catalog.text COLLATE pg_catalog.\"C\",$3::pg_catalog.bool)) SELECT pg_catalog.json_build_object('decision',(SELECT decision FROM ("+decision_body+") d),'truths',pg_catalog.json_build_object('permit',$1::pg_catalog.bool,'require',$2::pg_catalog.bool,'forbid',$3::pg_catalog.bool))"
 for permit in [False,True,None]:
  for required in [False,True,None]:
   for forbidden in [False,True,None]:
    truths={'permit':permit,'require':required,'forbid':forbidden};params=','.join('NULL' if v is None else 'TRUE' if v else 'FALSE' for v in truths.values());name='-'.join('u' if v is None else 't' if v else 'f' for v in truths.values())
    expected={'decision':'indeterminate' if None in truths.values() else 'permit' if permit and required and not forbidden else 'deny','truths':truths}
    observed=value('PREPARE actual_decision(bool,bool,bool) AS '+decision_program+'; EXECUTE actual_decision('+params+');')
    observations.append({'id':'decision-sql/'+name,'expected':expected,'observed':observed})
    if observed!=expected:raise RuntimeError('Actual decision body differs: '+name)
 empty_decision=next(a['decisionSql'] for a in decision_basis['artifacts'] if a['id']=='empty-selection')
 observed=value("SELECT pg_catalog.json_build_object('decision',(SELECT decision FROM ("+empty_decision+") d));")
 observations.append({'id':'decision-sql/empty-selection','expected':{'decision':'deny'},'observed':observed})
 if observed!={'decision':'deny'}:raise RuntimeError('Empty selection does not deny')
 for artifact in foundation['disclosureArtifacts']:
  if artifact['id']=='disclosure-unknown-disclosure':require(sql("TRUNCATE candidate.ownership,candidate.works_on; INSERT INTO candidate.ownership VALUES('o1','r1','p1'); INSERT INTO candidate.works_on VALUES(1,NULL);"))
  observed=value('PREPARE draft_disclosure(text,bigint) AS SELECT row_to_json(f) FROM ('+artifact['sql']+') AS f; EXECUTE draft_disclosure(\'r1\',1);');expected=artifact['expected']
  observations.append({'id':artifact['id'],'expected':expected,'observed':observed})
  if observed!=expected:raise RuntimeError('Native disclosure differs: '+artifact['id'])
 if any(digest(p)!=h for p,h in sources.items()):raise RuntimeError('Source changed during native replay')
 receipt={'status':'passed','sourceDigests':sources,'engine':version,'observations':observations,'covers':['US-056-AC2'],'nativeImplementationQualified':False,'decisionBodyProgram':decision_program,'emptyDecisionSql':empty_decision,'scope':'Adds actual parsed decision body execution for all 27 independently supplied permit/require/forbid truth vectors and empty selection; complete truthful CTE rows are synthetic and condition compilation is excluded. Executes seventeen disclosure-metadata programs, including ordered 100/101-field arrays, protected defaults, mask equivalence/conflict, withhold precedence and requested-field error order. Adds six empty-disclosure rule-truth fold programs: shared-parameter nulls make all mapped scalar rules Unknown, and correlated endpoint diagnostics isolate a single Unknown forbid, with reverse order and unscoped target/action controls. No output release, authenticated facts or general disclosure refinement is proven. Actual original Rust mixed source/IR to draft Truss condition SQL on PostgreSQL 17.9 synthetic raw fact projections. Boolean/Unknown native truth, correlation, int4 typed shared-home selection and four intrinsic resource/context diagnostics per string, exact integer, decimal, binary and Boolean profile; selected raw Record string columns are additionally guarded before authored OR True; other record-bound scalar columns remain unqualified; decimal/binary/Boolean compiler fixtures deliberately edit and repin the salary declaration; foreign type 13 rows carry otherwise matching raw and graph fields. Nullable Project carriers and NULL required context deliberately violate logical admission in Unknown controls; they are not admitted facts/context. Excluded administrator execution, limited bigint Staff values and synthetic homes do not qualify graph codecs, source/issuer/cut completeness, forced RLS, effect/disclosure composition, privacy or authorization.'}
finally:
 container=context['container']
 if container is None and context['creation_attempted']:
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==context['name']]
  if len(matches)>1:raise RuntimeError('Ambiguous creation outcome')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('No native result')
Path('docs/helix/04-build/evidence/security/truss-candidate-condition-native.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations)}))
