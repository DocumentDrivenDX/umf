import json,math,struct
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/parquet/values');report=json.loads((base/'results.json').read_text());results=[];differences={}
def compare(v,s):
 if not s.is_valid:assert v is None;return
 t=s.type;native=s.as_py()
 if pa.types.is_struct(t):
  assert v['kind']=='struct' and [f['name'] for f in v['fields']]==[f.name for f in t]
  for i,f in enumerate(v['fields']):compare(f['value'],s[i])
 elif pa.types.is_list(t):
  assert v['kind']=='list' and len(v['items'])==len(s.values)
  for item,scalar in zip(v['items'],s.values):compare(item,scalar)
 elif pa.types.is_map(t):
  assert v['kind']=='map' and v['duplicateKeys']=='last-value' and len(v['entries'])==len(s.values)
  for i,item in enumerate(v['entries']):compare(item['key'],s.values.field(0)[i]);compare(item['value'],s.values.field(1)[i])
 elif pa.types.is_decimal(t):assert v['kind']=='decimal' and v['value']==format(native,'f')
 elif pa.types.is_string(t):assert v['kind'] in ['string','enum','json'] and v['value']==native
 elif pa.types.is_binary(t) or pa.types.is_fixed_size_binary(t):assert v['kind']=='bytes' and bytes.fromhex(v['value'])==native
 elif pa.types.is_integer(t):assert v['kind']==('uint' if pa.types.is_unsigned_integer(t) else 'int') and v['bits']==t.bit_width and int(v['value'])==native
 elif pa.types.is_boolean(t):assert v['kind']=='bool' and v['value']==native
 elif pa.types.is_floating(t):assert v['kind']=='float' and (math.isnan(native) and v['value']=='NaN' or float(v['value'])==native)
 elif pa.types.is_timestamp(t):
  if v['kind']=='int96':
   days,ns=divmod(s.cast(pa.int64()).as_py(),86400000000000);assert v['value']==struct.pack('<QI',ns,2440588+days).hex();differences[c['id']]=differences.get(c['id'],0)+1
  else:assert v['kind']=='timestamp' and v['unit']=={'ms':'MILLIS','us':'MICROS','ns':'NANOS'}[t.unit] and v['isAdjustedToUTC']==(t.tz is not None) and int(v['value'])==s.cast(pa.int64()).as_py(),(c['id'],v,str(t))
 elif pa.types.is_time(t):assert v['kind']=='time' and v['unit']=={'ms':'MILLIS','us':'MICROS','ns':'NANOS'}[t.unit] and int(v['value'])==s.cast(pa.int32() if t.bit_width==32 else pa.int64()).as_py()
 elif pa.types.is_date32(t):assert v['kind']=='date' and int(v['value'])==s.cast(pa.int32()).as_py()
 else:raise AssertionError(str(t))
for c in report['results']:
 if c['status']!='projected':continue
 table=pq.ParquetFile(c['path']).read();actual=json.loads((base/(c['id']+'.json')).read_text());assert len(actual)==table.num_rows
 for i,row in enumerate(actual):
  assert row['kind']=='struct' and [f['name'] for f in row['fields']]==table.schema.names
  for j,f in enumerate(row['fields']):compare(f['value'],table.column(j)[i])
 results.append({'id':c['id'],'rows':table.num_rows,'nativeValuesCompared':True,'int96NativeTimestampViews':differences.get(c['id'],0)})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 native typed scalars and ordered maps','files':len(results),'rows':sum(r['rows'] for r in results),'int96NativeTimestampViews':differences,'results':results},indent=2)+'\n');print({'files':len(results),'rows':sum(r['rows'] for r in results)})
