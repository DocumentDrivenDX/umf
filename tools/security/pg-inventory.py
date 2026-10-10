"""Host-owned PostgreSQL inventory witness. No compiler/production qualification.
A stable cut is required externally; equality is neither authentication nor a
substitute for exhaustive inventory and participating writer/release guards.
"""
import json
INVENTORY_SQL="""SELECT json_build_object(
 'engine',json_build_object('version',version(),'number',current_setting('server_version_num')),
 'namespace',(SELECT json_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text) FROM pg_namespace WHERE nspname='security_raw'),
 'objects',(SELECT json_agg(json_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'settings',c.reloptions) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw'),
 'columns',(SELECT json_agg(json_build_object('table',c.relname,'position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'collation',a.attcollation::text,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='security_raw' AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT json_agg(json_build_object('table',c.relname,'name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw'),
 'policies',(SELECT json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'permissive',permissive,'using',qual,'check',with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='security_raw'),
 'views',(SELECT json_agg(json_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid),'settings',c.reloptions) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relkind='v'),
 'routines',(SELECT json_agg(json_build_object('name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid),'definer',p.prosecdef,'settings',p.proconfig) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_raw'),
 'roles',(SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypass',rolbypassrls,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'validUntil',rolvaliduntil,'settings',rolconfig) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'umf_sec_%' OR rolname='postgres'),
 'memberships',(SELECT coalesce(json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid,member),'[]'::json) FROM pg_auth_members WHERE pg_get_userbyid(member) LIKE 'umf_sec_%' OR pg_get_userbyid(roleid) LIKE 'umf_sec_%')
);"""
def canonical(value):
 encoded=json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
 if len(encoded)>16000000:raise ValueError('Inventory bound exceeded')
 return encoded
class StableCutInventoryAdmission:
 """Trusted host pins an independently collected, qualified inventory by value.
 A caller-provided expected snapshot cannot establish native qualification.
 Provider and operation must belong to the same externally guarded stable cut.
 """
 def __init__(self,expected):self.__expected=canonical(expected)
 def read(self,read_current,operation):
  try:
   if canonical(read_current())!=self.__expected:return {'status':'refused','rows':[]}
   rows=json.loads(canonical(operation()))
   return {'status':'admitted','rows':rows}
  except Exception:
   # Missing inventory/data or an unknown provider outcome publishes no partial
   # rows or raw native diagnostic detail.
   return {'status':'refused','rows':[]}
