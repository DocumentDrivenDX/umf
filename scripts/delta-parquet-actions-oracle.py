"""Compare projected JSON actions with independently read PyArrow checkpoint rows."""
import json,datetime
from decimal import Decimal
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/delta/parquet-actions')
grammar=json.load(open('spec/extensions/delta-log/action-schema.json'))['properties']
def lower(value,typ,schema,path,omitted):
 if value is None:return None
 if 'anyOf' in schema:schema=next(s for s in schema['anyOf'] if s.get('type')!='null')
 if pa.types.is_struct(typ):
  out={}
  for f in typ:
   child=schema.get('properties',{}).get(f.name)
   ptr=path+'/'+f.name.replace('~','~0').replace('/','~1')
   if value[f.name] is None and child is not None and f.name not in schema.get('required',[]):omitted.append(ptr);continue
   out[f.name]=lower(value[f.name],f.type,child or {},ptr,omitted)
  return out
 if pa.types.is_map(typ):
  assert len({k for k,v in value})==len(value)
  return {k:lower(v,typ.item_type,schema.get('additionalProperties',{}) if isinstance(schema.get('additionalProperties'),dict) else {},path+'/'+k,omitted) for k,v in value}
 if pa.types.is_list(typ):return [lower(v,typ.value_type,schema.get('items',{}),path+'/'+str(i),omitted) for i,v in enumerate(value)]
 if pa.types.is_timestamp(typ):
  digits={'ms':3,'us':6,'ns':9}[typ.unit];n=value if isinstance(value,int) else pa.scalar(value,type=typ).cast(pa.int64()).as_py();seconds,fraction=divmod(n,10**digits);dt=datetime.datetime(1970,1,1)+datetime.timedelta(seconds=seconds)
  return dt.isoformat(timespec='seconds')+'.'+str(fraction).zfill(digits)+('Z' if typ.tz else '')
 if pa.types.is_date(typ):return value.isoformat()
 if isinstance(value,Decimal):return value
 if isinstance(value,float):return Decimal(str(value))
 assert isinstance(value,(str,int,bool)),(path,typ)
 return value
def native(s):
 if not s.is_valid:return None
 if pa.types.is_timestamp(s.type):return s.value
 if pa.types.is_struct(s.type):return {f.name:native(s[f.name]) for f in s.type}
 if pa.types.is_map(s.type):return [(native(e['key']),native(e['value'])) for e in s.values]
 if pa.types.is_list(s.type):return [native(x) for x in s.values]
 return s.as_py()
results=[]
for c in [*json.load(open(base/'results.json'))['results'],*json.load(open(base/'authored-results.json'))['results']]:
 table=pq.read_table(c['path']);raw=[{f.name:native(table.column(f.name)[i]) for f in table.schema} for i in range(table.num_rows)]
 r=dict(id=c['id'],nativeRows=len(raw),status=c['status'])
 if c['status']=='projected':
  expected=[];omitted=[]
  for i,row in enumerate(raw):
   fields=[f for f in table.schema if row[f.name] is not None];assert len(fields)==1
   f=fields[0];paths=[];expected.append({f.name:lower(row[f.name],f.type,grammar.get(f.name,{}),'/'+f.name,paths)})
   omitted.extend(dict(row=i+1,path=p) for p in paths)
  actual=[json.loads(line,parse_float=Decimal) for line in (base/(c['id']+'.jsonl')).read_text().splitlines()]
  assert actual==expected,c['id'];assert omitted==c['omittedNullFields'],c['id']
  r['actionsAgree']=True;r['omittedFields']=len(omitted)
 results.append(r)
report=dict(pyarrow=pa.__version__,files=len(results),projected=sum(r['status']=='projected' for r in results),actions=sum(r['nativeRows'] for r in results if r['status']=='projected'),results=results)
(base/'oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
