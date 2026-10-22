"""Actual owner-derived original field/operator/action lineage; not native admission."""
import copy,hashlib,json,subprocess
from pathlib import Path
root=Path('docs/helix/04-build/evidence/security');foundation=root/'weft-handoff.json';prior=json.loads(foundation.read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
if prior['status']!='passed' or any(sha(p)!=h for p,h in prior['sourceDigests'].items()):raise RuntimeError('Original owner source changed')
binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff')
if sha(binary)!=prior['binarySha256']:raise RuntimeError('Original owner executable changed')
sources={str(Path(__file__)):sha(__file__),str(foundation):sha(foundation),str(binary):sha(binary),**prior['sourceDigests']}
text=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
source=next(a for a in prior['artifacts'] if a['id']=='natural-count-self-join')
request=copy.deepcopy(source['request']);ontology=json.loads(request['ontologyJson']);policy=json.loads(request['policyJson']);profile=json.loads(request['queryProfileJson'])
qualified=lambda element:{'documentId':'domain','moduleId':'m','elementId':element}
operators=['predicate','order','group','join','aggregate']
ontology['revision']='ontology-original-use-1';ontology['actions']+=['querySalary','unrelatedOriginal']
resource=next(t for t in ontology['entities'] if t['type']==qualified('Resource'));salary=next(f for f in resource['fields'] if f['ref']==qualified('salary'))
salary['queryUse']={operator:'original-authorized' for operator in operators}
policy['ontology']['revision']=ontology['revision'];policy['revision']='policy-original-use-1'
policy['rules']+=[{'id':'salary-original','effect':'permit','actions':['querySalary'],'target':[qualified('Resource')],'condition':{'op':'eq','left':{'kind':'subject','field':qualified('staffId')},'right':{'kind':'constant','field':qualified('staffId'),'value':{'string':'Alice'}}},'disclosure':[]},{'id':'unrelated-broad','effect':'permit','actions':['unrelatedOriginal'],'target':[qualified('Resource')],'condition':{'op':'literal','value':True},'disclosure':[]}]
request['ontologyJson']=text(ontology);request['policyJson']=text(policy)
profile.update(id='original-use-inspection',ontologySha256=hashlib.sha256(request['ontologyJson'].encode()).hexdigest(),policySha256=hashlib.sha256(request['policyJson'].encode()).hexdigest())
profile['bindings']=[{'target':qualified('Resource'),'field':qualified('salary'),'operator':operator,'originalAction':'querySalary'} for operator in operators]
# Bind the physical home and source-derived field classification into the owner
# profile; native renderer inputs cannot be substituted behind the same profile.
query_home={'schema':'security_raw','table':'original_salary_source','fields':[{'ref':qualified('resourceId'),'column':'id','family':'string','protected':False},{'ref':qualified('salary'),'column':'salary','family':'integer','protected':True}]}
document=json.loads(request['modules'][0]['documentJson'])
columns={'Staff':{'staffId':'id'},'Project':{'projectId':'id'},'Resource':{'resourceId':'id','salary':'salary'},'Assignment':{'assignmentStaff':'employee_id','assignmentProject':'project_id','active':'active'},'Ownership':{'ownerResource':'resource_id','ownerProject':'project_id'}}
homes={'Staff':'employee','Project':'project','Resource':'resource','Assignment':'m2m_employee_project','Ownership':'m2m_resource_project'}
physical_types=[]
for t in ontology['entities']+ontology['associations']:
 name=t['type']['elementId'];record=next(e for e in document['modules'][0]['elements'] if e['id']==name);native_key=next(k for k in record['keys'] if k['id']==t['keyId'])
 mapped=lambda ref:{'ref':ref,'column':columns[name][ref['elementId']]}
 physical={'type':t['type'],'keyId':t['keyId'],'keyFields':[mapped(qualified(f['element'])) for f in native_key['fields']],'fields':[mapped(f['ref']) for f in t['fields'] if f['ref']['elementId'] in columns[name]],'home':{'schema':'security_raw','table':homes[name]}}
 if 'endpoints' in t:physical['endpoints']=t['endpoints']
 physical_types.append(physical)
request['bindingJson']=text({'version':'truss.security.raw-query-home/0.2.0','target':qualified('Resource'),'subject':ontology['subject'],'types':physical_types,'home':query_home})
profile['binding']['sha256']=hashlib.sha256(request['bindingJson'].encode()).hexdigest()
request['queryProfileJson']=text(profile)
queries=[('predicate',"SELECT r.resourceId FROM Resource r WHERE r.salary=333"),('order','SELECT r.resourceId FROM Resource r ORDER BY r.salary'),('group','SELECT COUNT(*) FROM Resource r GROUP BY r.salary'),('join','SELECT r.resourceId FROM Resource r JOIN Resource s ON r.salary=s.salary'),('aggregate','SELECT SUM(r.salary) FROM Resource r')]
observations=[];artifacts=[]
for operator,sql in queries:
 selected=copy.deepcopy(request);selected['sql']=sql
 result=subprocess.run([str(binary)],input=text(selected),capture_output=True,text=True,timeout=10)
 if result.returncode or result.stderr:raise RuntimeError(operator+': '+result.stderr)
 handoff=json.loads(result.stdout)
 salary_uses=[u for u in handoff['uses'] if u['field']==qualified('salary')]
 if not salary_uses or any(u['operator']!=operator or u['originalAction']!='querySalary' or u['target']!=qualified('Resource') for u in salary_uses):raise RuntimeError('Original operator/action lineage differs')
 if handoff['sqlSha256']!=hashlib.sha256(sql.encode()).hexdigest():raise RuntimeError('SQL source differs')
 observations.append({'id':operator,'expectedAction':'querySalary','operator':operator,'observedActions':[u['originalAction'] for u in salary_uses]})
 artifacts.append({'id':operator,'request':selected,'handoff':handoff})
# Binding changes cannot be made independently of the captured profile source.
for id,change in [('omitted-binding',lambda p:p['bindings'].pop()),('duplicate-binding',lambda p:p['bindings'].append(copy.deepcopy(p['bindings'][0]))),('read-is-not-original',lambda p:p['bindings'][0].update(originalAction='read')),('wrong-field',lambda p:p['bindings'][0].update(field=qualified('resourceId')))]:
 changed=copy.deepcopy(profile);change(changed);selected=copy.deepcopy(request);selected['queryProfileJson']=text(changed);selected['sql']=queries[0][1]
 result=subprocess.run([str(binary)],input=text(selected),capture_output=True,text=True,timeout=10)
 if not result.returncode or result.stdout:raise RuntimeError('Invalid original-use profile exported: '+id)
 observations.append({'id':id,'expectedExport':False,'exitCode':result.returncode,'diagnostic':json.loads(result.stderr)})
# An owner can deliberately select another *new* profile. It must never be treated
# as the old installation merely because its unrelated action has a broad permit.
changed=copy.deepcopy(profile);changed['revision']='different-original-action';changed['bindings'][0]['originalAction']='unrelatedOriginal'
selected=copy.deepcopy(request);selected['queryProfileJson']=text(changed);selected['sql']=queries[0][1]
result=subprocess.run([str(binary)],input=text(selected),capture_output=True,text=True,timeout=10)
if result.returncode or result.stderr:raise RuntimeError('Separately selected profile refused')
changed_handoff=json.loads(result.stdout)
if changed_handoff['profile']['sha256']==artifacts[0]['handoff']['profile']['sha256']:raise RuntimeError('Different original action lost profile identity')
artifacts.append({'id':'separate-unrelated-action-profile','request':selected,'handoff':changed_handoff})
observations.append({'id':'separate-unrelated-action-profile','expectedDifferentProfile':True,'observedDifferentProfile':True})
if any(sha(p)!=h for p,h in sources.items()):raise RuntimeError('Owner source changed')
receipt={'status':'passed','sourceDigests':sources,'observations':observations,'artifacts':artifacts,'scope':'Actual source-owner mapping executable derives all five protected salary field/operator/querySalary action bindings from immutable authored schema/ontology/policy/profile and SQL lineage. Invalid bindings refuse. A deliberately selected unrelated-action profile is a different source identity, not a native grant or substitute for the installed profile. Application/native lowering, protected routine/catalog/actor/current authority/final publication and complete B08 remain unqualified.'}
(root/'weft-original-use.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','checks':len(observations),'artifacts':len(artifacts)}))
