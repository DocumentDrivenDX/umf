"""Native schema conversion matrix. Evidence for a future browser projection, not that implementation."""
import itertools,json,hashlib
from pathlib import Path
import pyarrow as pa
import pyspark
from pyspark.sql import types as t
from pyspark.sql.pandas.types import to_arrow_schema,from_arrow_schema
assert pyspark.__version__=='4.0.1' and pa.__version__=='21.0.0'
base=Path('fixtures/projections/spark-arrow');base.mkdir(exist_ok=True)
field=lambda name,dt,nullable=True,metadata=None:t.StructField(name,dt,nullable,metadata)
values=[('boolean',t.BooleanType()),('byte',t.ByteType()),('short',t.ShortType()),('integer',t.IntegerType()),('long',t.LongType()),('float',t.FloatType()),('double',t.DoubleType()),('decimal',t.DecimalType(38,18)),('string',t.StringType()),('binary',t.BinaryType()),('date',t.DateType()),('timestamp',t.TimestampType()),('timestamp-ntz',t.TimestampNTZType()),('null',t.NullType()),('variant',t.VariantType()),('duration-day',t.DayTimeIntervalType(0,0)),('duration-full',t.DayTimeIntervalType()),('year-month',t.YearMonthIntervalType()),('calendar-interval',t.CalendarIntervalType()),('char',t.CharType(5)),('varchar',t.VarcharType(20)),('collated',t.StringType('UTF8_LCASE')),('array',t.ArrayType(t.StringType(),False)),('map',t.MapType(t.StringType(),t.ArrayType(t.LongType(),False),False)),('nested',t.StructType([field('amount',t.DecimalType(10,2),False),field('when',t.TimestampNTZType())])),('duplicate-nested',t.StructType([field('same',t.StringType()),field('same',t.IntegerType())]))]
cases=[{'id':name,'schema':t.StructType([field('value',dt,False)])} for name,dt in values]
cases.append({'id':'metadata','schema':t.StructType([field('value',t.StringType(),True,{'comment':'meaning','identity':True,'exact':9223372036854775807})])})
cases.append({'id':'duplicate-top','schema':t.StructType([field('same',t.StringType()),field('same',t.IntegerType())])})
cases.append({'id':'nullable-null','schema':t.StructType([field('value',t.NullType(),True)])})
def differences(a,b,path=''):
 if type(a)!=type(b):return [path]
 if isinstance(a,dict):
  return [path+'/'+k for k in a.keys()^b.keys()]+[p for k in a.keys()&b.keys() for p in differences(a[k],b[k],path+'/'+k)]
 if isinstance(a,list):
  if len(a)!=len(b):return [path]
  return [p for i,(x,y) in enumerate(zip(a,b)) for p in differences(x,y,path+'/'+str(i))]
 return [] if a==b else [path]
rows=[]
for c in cases:
 source=c['schema'].jsonValue();(base/(c['id']+'.spark.json')).write_text(json.dumps(source,separators=(',',':')))
 for utc,large,strict in itertools.product([True,False],repeat=3):
  id=c['id']+'-'+''.join('1' if x else '0' for x in [utc,large,strict]);row={'id':id,'case':c['id'],'options':{'timestamp_utc':utc,'prefers_large_types':large,'error_on_duplicated_field_names_in_struct':strict}}
  try:arrow=to_arrow_schema(c['schema'],**row['options'])
  except Exception as e:row.update(status='rejected',errorType=type(e).__name__);rows.append(row);continue
  raw=arrow.serialize().to_pybytes();(base/(id+'.arrow')).write_bytes(raw)
  assert pa.ipc.read_schema(pa.BufferReader(raw)).equals(arrow,check_metadata=True)
  row.update(status='converted',sha256=hashlib.sha256(raw).hexdigest(),arrowDescription=str(arrow),recovery=[])
  for prefer in [False,True]:
   recovered=from_arrow_schema(arrow,prefer_timestamp_ntz=prefer).jsonValue();row['recovery'].append({'prefer_timestamp_ntz':prefer,'schema':recovered,'changedPaths':sorted(differences(source,recovered))})
  rows.append(row)
assert len(rows)==232
assert sum(r['status']=='converted' for r in rows)==188
assert all(r['status']==('rejected' if r['case'] in ['null','year-month','calendar-interval','char','varchar'] or (r['case']=='duplicate-nested' and r['options']['error_on_duplicated_field_names_in_struct']) else 'converted') for r in rows)
# Native target-only recovery must expose known semantic losses.
for name,path in [('metadata','/fields/0/metadata'),('collated','/fields/0/metadata/__COLLATIONS'),('duration-day','/fields/0/type')]:
 assert any(r['case']==name and any(any(p.startswith(path) for p in x['changedPaths']) for x in r['recovery']) for r in rows if r['status']=='converted')
report={'spark':pyspark.__version__,'pyarrow':pa.__version__,'sourceCases':len(cases),'configurations':8,'converted':188,'rejected':44,'results':rows}
(base/'native-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
