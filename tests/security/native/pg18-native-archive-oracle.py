"""Independent P07 fixture declarations and complete native-label correspondence."""
import json,re
FIXTURES=[
 ('local','COLUMN','security_mask_write.resource.amount','MASKED WITH VALUE 207'),
 ('local','COLUMN','archive_names."Case".note',"MASKED WITH VALUE 'archivé ''quoted''\nline'"),
 ('local','COLUMN','archive_names."case".note',"MASKED WITH VALUE 'archivé ''quoted''\nline'"),
 ('local','SCHEMA','archive_names','TRUSTED'),
 ('shared','ROLE','umf_sec_archive_unused','MASKED')]
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def identity(row,database):
 if row['catalog']=='pg_seclabel':return canonical([row['catalog'],database,row['classoid'],row['objoid'],row['objsubid'],row['provider']])
 if row['catalog']=='pg_shseclabel':return canonical([row['catalog'],row['classoid'],row['objoid'],row['provider']])
 raise ValueError('Unknown native label catalog')
def rows(capture):
 result={}
 if not isinstance(capture,dict):raise ValueError('Exact capture object required')
 if set(capture)!=set(['database','localCount','sharedCount','rows']):raise ValueError('Exact capture required')
 database=capture['database']
 if not isinstance(database,dict) or set(database)!={'oid','name'} or not isinstance(database['name'],str) or not database['name'] or '\x00' in database['name']:raise ValueError('Exact database identity required')
 def oid(value):return isinstance(value,str) and re.fullmatch(r'[1-9][0-9]{0,9}',value) is not None and int(value)<=4294967295
 if not oid(database['oid']):raise ValueError('Canonical native database OID required')
 if any(type(capture[key]) is not int or not 0<=capture[key]<=4096 for key in ['localCount','sharedCount']):raise ValueError('Exact bounded integer counts required')
 if not isinstance(capture['rows'],list) or len(capture['rows'])>4096 or len(capture['rows'])!=capture['localCount']+capture['sharedCount']:raise ValueError('Complete bounded native row list required')
 for row in capture['rows']:
  if not isinstance(row,dict) or row.get('catalog') not in ['pg_seclabel','pg_shseclabel']:raise ValueError('Exact native catalog scope required')
  expected={'catalog','classoid','objoid','provider','label','labelUtf8Hex'}|({'objsubid'} if row['catalog']=='pg_seclabel' else set())
  if set(row)!=expected or any(not isinstance(v,str) for v in row.values()):raise ValueError('Exact native string carriers required')
  if not oid(row['classoid']) or not oid(row['objoid']) or not row['provider'] or '\x00' in row['provider'] or '\x00' in row['label']:raise ValueError('Exact native text/OID carriers required')
  if row['catalog']=='pg_seclabel' and (re.fullmatch(r'0|[1-9][0-9]{0,9}',row['objsubid']) is None or int(row['objsubid'])>2147483647):raise ValueError('Canonical native subobject required')
  if row['label'].encode('utf8').hex()!=row['labelUtf8Hex']:raise ValueError('Original UTF8 bytes required')
  key=identity(row,capture['database'])
  if key in result:raise ValueError('Duplicate native identity')
  result[key]=row
 if sum(r['catalog']=='pg_seclabel' for r in result.values())!=capture['localCount'] or sum(r['catalog']=='pg_shseclabel' for r in result.values())!=capture['sharedCount']:raise ValueError('Complete populations required')
 return result
def matches(capture,baseline,expected):
 try:
  if capture['database']!=baseline['database']:return False
  want=rows(baseline)
  for row in expected:
   key=identity(row,capture['database'])
   if key in want:return False
   want[key]=row
  return canonical(sorted(rows(capture).values(),key=lambda r:identity(r,capture['database'])))==canonical(sorted(want.values(),key=lambda r:identity(r,capture['database'])))
 except (ValueError,KeyError,TypeError,UnicodeError):return False
