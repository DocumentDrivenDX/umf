"""Independent excluded-host inventory for the fixed raw write installation."""
import hashlib
from pathlib import Path

def collect(value,check,oracle,sources):
 path='tools/security/pg-inventory.py';data=Path(path).read_bytes()
 if hashlib.sha256(data).hexdigest()!=sources[path]:raise RuntimeError('Unpinned inventory collector')
 module={'__name__':'reviewed_write_inventory'};exec(compile(data,path,'exec'),module)
 inventory=value(module['INVENTORY_SQL'].replace("'security_raw'","'security_write'"))
 check('inventory:objects',['action_grant','action_grant_pkey','allowed_mutations','resource','resource_pkey'],[o['name'] for o in inventory['objects']])
 check('inventory:resource-forced-owner',[True,True,'umf_sec_guardian'],[[o['rls'],o['force'],o['owner']] for o in inventory['objects'] if o['name']=='resource'][0])
 check('inventory:resource-columns',[['id','text',True],['owner_project','text',True],['value','text',True]],[[c['name'],c['type'],c['notNull']] for c in inventory['columns'] if c['table']=='resource'])
 check('inventory:resource-collations',['C','C','C'],value("SELECT json_agg(co.collname ORDER BY a.attnum) FROM pg_attribute a JOIN pg_collation co ON co.oid=a.attcollation WHERE a.attrelid='security_write.resource'::regclass AND a.attnum>0 AND NOT a.attisdropped"))
 check('inventory:resource-constraints',[["f","FOREIGN KEY (owner_project) REFERENCES security_raw.project(id)",True],["p","PRIMARY KEY (id)",True]],[[c['kind'],c['definition'],c['validated']] for c in inventory['constraints'] if c['table']=='resource'])
 check('inventory:ordinary-memberships',[],inventory['memberships'])
 inventory['triggers']=value("SELECT json_agg(json_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'routine',p.proname,'schema',n.nspname) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid='security_write.resource'::regclass AND NOT t.tgisinternal")
 check('inventory:trigger',[{'name':'resource_mutation','enabled':'O','definition':'CREATE TRIGGER resource_mutation BEFORE INSERT OR DELETE OR UPDATE ON security_write.resource FOR EACH ROW EXECUTE FUNCTION security_write.check_mutation()','routine':'check_mutation','schema':'security_write'}],inventory['triggers'])
 check('inventory:routines',['can_action','check_mutation'],[r['name'] for r in inventory['routines']])
 for r in inventory['routines']:
  check('inventory:routine-owner-definer-settings:'+r['name'],['umf_sec_guardian',True,['search_path=pg_catalog']],[r['owner'],r['definer'],r['settings']])
 check('inventory:policies',['resource_create','resource_delete','resource_read','resource_update'],[p['name'] for p in inventory['policies']])
 for policy in inventory['policies']:
  action={'resource_create':'create','resource_delete':'delete','resource_read':'read','resource_update':'update'}[policy['name']]
  expression="security_write.can_action(owner_project, '"+action+"'::text)"
  command={'create':'INSERT','delete':'DELETE','read':'SELECT','update':'UPDATE'}[action]
  check('inventory:policy:'+policy['name'],[command,['public'],'PERMISSIVE',None if action=='create' else expression,expression if action in ['create','update'] else None],[policy['command'],policy['roles'],policy['permissive'],policy['using'],policy['check']])
 inventory['authorityDependencies']=value(module['INVENTORY_SQL'])
 dependency=inventory['authorityDependencies']
 dependency_columns={'employee':[['id','text',True],['native_login','text',True]],'m2m_employee_project':[['employee_id','text',True],['project_id','text',True],['active','boolean',True]],'project':[['id','text',True],['company_id','text',True]]}
 expected_constraints={'employee':[['u','UNIQUE (native_login)',True],['p','PRIMARY KEY (id)',True]],'m2m_employee_project':[['f','FOREIGN KEY (employee_id) REFERENCES security_raw.employee(id)',True],['p','PRIMARY KEY (employee_id, project_id)',True],['f','FOREIGN KEY (project_id) REFERENCES security_raw.project(id)',True]],'project':[['f','FOREIGN KEY (company_id) REFERENCES security_raw.company(id)',True],['p','PRIMARY KEY (id)',True]]}
 for table in dependency_columns:
  check('inventory:dependency-owner:'+table,'umf_sec_guardian',next(o['owner'] for o in dependency['objects'] if o['name']==table))
  check('inventory:dependency-columns:'+table,dependency_columns[table],[[c['name'],c['type'],c['notNull']] for c in dependency['columns'] if c['table']==table])
  check('inventory:dependency-keys:'+table,expected_constraints[table],[[c['kind'],c['definition'],c['validated']] for c in dependency['constraints'] if c['table']==table])
 for role in inventory['roles']:
  if role['name'] in oracle['actors'] or role['name']=='umf_sec_guardian':
   check('inventory:role-authority:'+role['name'],[role['name']!='umf_sec_guardian',False,False,False,False,False],[role['login'],role['superuser'],role['bypass'],role['createRole'],role['createDb'],role['replication']])
 inventory['privileges']={}
 inventory['authorityPrivileges']={}

 for actor in oracle['actors']:
  role="'"+actor+"'"
  actual=value("SELECT json_build_object('schemaUsage',has_schema_privilege("+role+",'security_write','USAGE'),'schemaCreate',has_schema_privilege("+role+",'security_write','CREATE'),'tables',(SELECT json_agg(json_build_object('name',c.relname,'select',has_table_privilege("+role+",c.oid,'SELECT'),'insert',has_table_privilege("+role+",c.oid,'INSERT'),'update',has_table_privilege("+role+",c.oid,'UPDATE'),'delete',has_table_privilege("+role+",c.oid,'DELETE'),'truncate',has_table_privilege("+role+",c.oid,'TRUNCATE'),'references',has_table_privilege("+role+",c.oid,'REFERENCES'),'trigger',has_table_privilege("+role+",c.oid,'TRIGGER')) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_write' AND c.relkind='r'),'canAction',has_function_privilege("+role+",'security_write.can_action(text,text)','EXECUTE'),'triggerExecute',has_function_privilege("+role+",'security_write.check_mutation()','EXECUTE'),'sequenceUsage',has_sequence_privilege("+role+",'security_write.allowed_mutations','USAGE'),'sequenceSelect',has_sequence_privilege("+role+",'security_write.allowed_mutations','SELECT'),'sequenceUpdate',has_sequence_privilege("+role+",'security_write.allowed_mutations','UPDATE'))")
  expected={'schemaUsage':True,'schemaCreate':False,'tables':[{'name':t,**{a:t=='resource' for a in ['select','insert','update','delete']},**{a:False for a in ['truncate','references','trigger']}} for t in ['action_grant','resource']],'canAction':True,'triggerExecute':False,'sequenceUsage':False,'sequenceSelect':False,'sequenceUpdate':False}
  check('inventory:exact-privileges:'+actor,expected,actual);inventory['privileges'][actor]=actual
  columns=value("SELECT json_agg(json_build_object('table',c.relname,'column',a.attname,'select',has_column_privilege("+role+",c.oid,a.attnum,'SELECT'),'insert',has_column_privilege("+role+",c.oid,a.attnum,'INSERT'),'update',has_column_privilege("+role+",c.oid,a.attnum,'UPDATE'),'references',has_column_privilege("+role+",c.oid,a.attnum,'REFERENCES')) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_write' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped")
  expected_column_privileges=[{'table':table,'column':column,'select':table=='resource','insert':table=='resource','update':table=='resource','references':False} for table,names in [('action_grant',['employee_id','project_id','action']),('resource',['id','owner_project','value'])] for column in names]
  check('inventory:exact-column-privileges:'+actor,expected_column_privileges,columns);actual['columns']=columns

  authority=value("SELECT json_build_object('create',has_schema_privilege("+role+",'security_raw','CREATE'),'tables',(SELECT json_agg(json_build_object('table',c.relname,'select',has_table_privilege("+role+",c.oid,'SELECT'),'insert',has_table_privilege("+role+",c.oid,'INSERT'),'update',has_table_privilege("+role+",c.oid,'UPDATE'),'delete',has_table_privilege("+role+",c.oid,'DELETE'),'truncate',has_table_privilege("+role+",c.oid,'TRUNCATE'),'references',has_table_privilege("+role+",c.oid,'REFERENCES'),'trigger',has_table_privilege("+role+",c.oid,'TRIGGER')) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relname IN ('employee','m2m_employee_project','project')),'columns',(SELECT json_agg(json_build_object('table',c.relname,'column',a.attname,'select',has_column_privilege("+role+",c.oid,a.attnum,'SELECT'),'insert',has_column_privilege("+role+",c.oid,a.attnum,'INSERT'),'update',has_column_privilege("+role+",c.oid,a.attnum,'UPDATE'),'references',has_column_privilege("+role+",c.oid,a.attnum,'REFERENCES')) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relname IN ('employee','m2m_employee_project','project') AND a.attnum>0 AND NOT a.attisdropped))")
  expected_authority={'create':False,'tables':[{'table':table,**{action:False for action in ['select','insert','update','delete','truncate','references','trigger']}} for table in sorted(dependency_columns)],'columns':[{'table':table,'column':column[0],**{action:False for action in ['select','insert','update','references']}} for table in sorted(dependency_columns) for column in dependency_columns[table]]}
  check('inventory:private-authority-privileges:'+actor,expected_authority,authority);inventory['authorityPrivileges'][actor]=authority
 inventory['authentication']=value("SELECT json_agg(json_build_object('type',type,'method',auth_method,'error',error)) FROM pg_hba_file_rules")
 hosts=[r for r in inventory['authentication'] if r['type'].startswith('host')]
 check('inventory:scram',True,bool(hosts) and all(r['method']=='scram-sha-256' and r['error'] is None for r in hosts))
 return inventory
