"""Typed native values for every pinned Parquet checkpoint/sidecar; no data reads."""
import hashlib,json
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/delta/checkpoint-upstream');manifest=json.loads((base/'manifest.json').read_text());results=[]
def scalar(s):
 if not s.is_valid:return None
 t=s.type
 if pa.types.is_struct(t):return {f.name:scalar(s[f.name]) for f in t}
 if pa.types.is_map(t):
  pairs=s.values
  keys=[x.as_py() for x in pairs.field(0)];assert all(isinstance(k,str) for k in keys) and len(set(keys))==len(keys)
  return {k:scalar(pairs.field(1)[i]) for i,k in enumerate(keys)}
 if pa.types.is_list(t) or pa.types.is_large_list(t):return [scalar(x) for x in s.values]
 if pa.types.is_timestamp(t):return {'$timestamp':{'unit':t.unit,'value':str(s.cast(pa.int64()).as_py())}}
 if pa.types.is_date32(t):return {'$dateDays':s.cast(pa.int32()).as_py()}
 if pa.types.is_int64(t):return {'$int64':str(s.as_py())}
 if pa.types.is_decimal(t):return {'$decimal':format(s.as_py(),'f')}
 if pa.types.is_binary(t):return {'$bytes':s.as_py().hex()}
 return s.as_py()
for f in manifest['files']:
 raw=(base/f['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==f['sha256']
 if not f['path'].endswith('.parquet'):continue
 p=pq.ParquetFile(base/f['path']);t=p.read();rows=[{field.name:scalar(t.column(i)[r]) for i,field in enumerate(t.schema)} for r in range(t.num_rows)]
 id=str(len(results));(base/'typed').mkdir(exist_ok=True);(base/'typed'/(id+'.json')).write_text(json.dumps(rows,indent=2)+'\n');(base/'typed'/(id+'.schema.txt')).write_text(str(t.schema)+'\n')
 results.append({'id':id,'path':f['path'],'rows':t.num_rows,'sha256':f['sha256'],'codecs':sorted(set(p.metadata.row_group(g).column(c).compression for g in range(p.metadata.num_row_groups) for c in range(p.metadata.num_columns)))})
report={'runtime':'PyArrow 21.0.0','files':len(results),'rows':sum(r['rows'] for r in results),'results':results};(base/'native-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
# Authored boundaries exercise each physical decimal representation independently.
from decimal import Decimal
boundary=base/'decimal-boundaries';boundary.mkdir(exist_ok=True);cases=[]
for id,precision,scale,wide in [('int32',8,5,False),('int64',18,5,False),('fixed128',38,9,False),('fixed256',70,20,True)]:
 decimal_type=pa.decimal256(precision,scale) if wide else pa.decimal128(precision,scale)
 maximum='9'*(precision-scale)+'.'+'9'*scale
 values=[{'value':Decimal(maximum)},{'value':Decimal('-'+maximum)},{'value':Decimal('0')},{'value':None},None]
 table=pa.table({'stats':pa.array(values,type=pa.struct([('value',decimal_type)]))})
 path=boundary/(id+'.parquet');pq.write_table(table,path,store_decimal_as_integer=True)
 native=pq.read_table(path);expected=[{'stats':scalar(native.column(0)[i])} for i in range(native.num_rows)]
 (boundary/(id+'.json')).write_text(json.dumps(expected,indent=2)+'\n');cases.append({'id':id,'precision':precision,'scale':scale,'physicalType':pq.ParquetFile(path).schema.column(0).physical_type,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(boundary/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0','cases':cases},indent=2)+'\n')
print({'decimalBoundaryFiles':len(cases)})
