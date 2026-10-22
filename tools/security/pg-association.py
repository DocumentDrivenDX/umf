"""Reviewed PostgreSQL 17.9 raw-junction binding witness, not a graph adapter.
Trusted host supplies selected logical type homes and association definitions.
Native descriptors establish physical correspondence, never issuer authentication.
Externally stable inventory/fact cuts and separate lifecycle guards are required.
"""
import json
DESCRIPTORS_SQL="""SELECT json_build_object('engine',current_setting('server_version_num'),'tables',(
 SELECT json_agg(json_build_object('home',json_build_object('catalog',current_database(),'schema',n.nspname,'table',c.relname),
 'columns',(SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'deterministic',coalesce(co.collisdeterministic,true)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'keys',(SELECT coalesce(json_agg(json_build_object('primary',k.contype='p','validated',k.convalidated,'columns',(SELECT json_agg(a.attname ORDER BY x.position) FROM unnest(k.conkey) WITH ORDINALITY x(number,position) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.number)) ORDER BY k.conname),'[]'::json) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype IN ('p','u')),
 'foreignKeys',(SELECT coalesce(json_agg(json_build_object('validated',k.convalidated,'deferrable',k.condeferrable,'update',k.confupdtype,'delete',k.confdeltype,
 'columns',(SELECT json_agg(a.attname ORDER BY x.position) FROM unnest(k.conkey) WITH ORDINALITY x(number,position) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.number),
 'target',json_build_object('catalog',current_database(),'schema',tn.nspname,'table',tc.relname),
 'targetColumns',(SELECT json_agg(a.attname ORDER BY x.position) FROM unnest(k.confkey) WITH ORDINALITY x(number,position) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.number),
 'triggers',(SELECT json_agg(t.tgenabled ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgconstraint=k.oid)) ORDER BY k.conname),'[]'::json) FROM pg_constraint k JOIN pg_class tc ON tc.oid=k.confrelid JOIN pg_namespace tn ON tn.oid=tc.relnamespace WHERE k.conrelid=c.oid AND k.contype='f')) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relkind='r'));
"""
def key(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
def copied(value):
 encoded=key(value)
 if len(encoded)>16000000:raise ValueError('Association source bound exceeded')
 return json.loads(encoded)
def logical_ref(value):
 if not isinstance(value,dict) or set(value)!=set(['documentId','moduleId','elementId']) or any(not isinstance(x,str) or not x or len(x)>4096 for x in value.values()):raise ValueError('Unknown logical identity')
 return key(value)
class AssociationAdmission:
 """Pins selected semantics/type homes by value. Refusal happens before operation.
 Admitted subset: ordered natural junction keys, nonnullable deterministic text
 endpoint keys and validated nondeferrable/no-action FKs with active triggers.
 """
 def __init__(self,type_bindings,definitions):
  type_bindings=copied(type_bindings);definitions=copied(definitions)
  def columns(value):return isinstance(value,list) and 1<=len(value)<=64 and len(set(value))==len(value) and all(isinstance(c,str) and 0<len(c)<=4096 for c in value)
  def home(value):return isinstance(value,dict) and set(value)==set(['catalog','schema','table']) and all(isinstance(v,str) and 0<len(v)<=4096 for v in value.values())
  for binding in type_bindings:
   if set(binding)!=set(['logicalType','home','keyColumns']) or not home(binding['home']) or not columns(binding['keyColumns']):raise ValueError('Unsupported type-home meaning')
  for definition in definitions:
   if set(definition)!=set(['logicalType','home','endpoints']) or not home(definition['home']) or not 1<=len(definition['endpoints'])<=4:raise ValueError('Unsupported association meaning')
   logical_ref(definition['logicalType']);roles=set()
   for endpoint in definition['endpoints']:
    if set(endpoint)!=set(['role','logicalType','columns']) or not isinstance(endpoint['role'],str) or not endpoint['role'] or endpoint['role'] in roles or not columns(endpoint['columns']):raise ValueError('Unsupported endpoint meaning')
    logical_ref(endpoint['logicalType']);roles.add(endpoint['role'])
  self.__types={logical_ref(t['logicalType']):t for t in type_bindings}
  self.__definitions=copied(definitions)
  if len(self.__types)!=len(type_bindings) or not 1<=len(self.__types)<=64 or not 1<=len(self.__definitions)<=64:raise ValueError('Duplicate/bounded definitions')
 def valid(self,mapping,inventory):
  try:
   mapping=copied(mapping);inventory=copied(inventory)
   if inventory['engine']!='170009' or set(mapping)!=set(['version','associations']) or mapping['version']!='pg-raw-association-map/0.1.0' or len(mapping['associations'])!=len(self.__definitions):return False
   tables={key(t['home']):t for t in inventory['tables']}
   if len(tables)!=len(inventory['tables']):return False
   native_types={}
   for name,binding in self.__types.items():
    table=tables[key(binding['home'])];columns={c['name']:c for c in table['columns']}
    if len(columns)!=len(table['columns']) or not binding['keyColumns']:return False
    if not any(k['primary'] and k['validated'] and k['columns']==binding['keyColumns'] for k in table['keys']):return False
    for column in binding['keyColumns']:
     native=columns[column]
     if native['type']!='text' or not native['notNull'] or not native['deterministic']:return False
    native_types[name]=binding
   seen=set()
   for selected,candidate in zip(self.__definitions,mapping['associations']):
    identity=logical_ref(candidate['logicalType'])
    if identity!=logical_ref(selected['logicalType']) or identity in seen or set(candidate)!=set(['logicalType','home','keyColumns','endpoints']):return False
    seen.add(identity);table=tables[key(candidate['home'])]
    if candidate['home']!=selected['home'] or len(candidate['endpoints'])!=len(selected['endpoints']):return False
    columns={c['name']:c for c in table['columns']};natural_key=[];roles=set()
    for expected,endpoint in zip(selected['endpoints'],candidate['endpoints']):
     if set(endpoint)!=set(['role','logicalType','columns']) or endpoint['role']!=expected['role'] or endpoint['columns']!=expected['columns'] or endpoint['role'] in roles or logical_ref(endpoint['logicalType'])!=logical_ref(expected['logicalType']):return False
     roles.add(endpoint['role']);binding=native_types[logical_ref(endpoint['logicalType'])]
     if len(endpoint['columns'])!=len(binding['keyColumns']) or len(set(endpoint['columns']))!=len(endpoint['columns']):return False
     for column in endpoint['columns']:
      native=columns[column]
      if native['type']!='text' or not native['notNull'] or not native['deterministic']:return False
     matching=[fk for fk in table['foreignKeys'] if fk['columns']==endpoint['columns'] and fk['target']==binding['home'] and fk['targetColumns']==binding['keyColumns']]
     if len(matching)!=1:return False
     fk=matching[0]
     if not fk['validated'] or fk['deferrable'] or fk['update']!='a' or fk['delete']!='a' or not fk['triggers'] or any(mode not in ['O','A'] for mode in fk['triggers']):return False
     natural_key.extend(endpoint['columns'])
    if candidate['keyColumns']!=natural_key or not any(k['primary'] and k['validated'] and k['columns']==natural_key for k in table['keys']):return False
   return True
  except Exception:return False
 def read(self,mapping,current_inventory,operation):
  try:
   if not self.valid(mapping,current_inventory()):return {'status':'refused','rows':[]}
   return {'status':'admitted','rows':copied(operation())}
  except Exception:return {'status':'refused','rows':[]}
