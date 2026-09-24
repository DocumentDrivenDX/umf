import json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow as pa
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='rows_parquet_thrift');base=Path('fixtures/parquet/rows');manifest=json.loads((base/'results.json').read_text());results=[]
def physical(e,s):
 t=e.type;v=s.as_py();names=['BOOLEAN','INT32','INT64','INT96','FLOAT','DOUBLE','BYTE_ARRAY','FIXED_LEN_BYTE_ARRAY'];out={'type':names[t]}
 if pa.types.is_decimal(s.type):
  sign,digits,exponent=v.as_tuple();n=int(''.join(str(x) for x in digits))*(-1 if sign else 1);power=exponent+(e.scale or 0);assert power>=0;n*=10**power
  if t in [1,2]:v=n
  else:v=n.to_bytes(e.type_length if t==7 else max(1,(n.bit_length()+8)//8),'big',signed=True)
 if t==0:out['value']=v
 elif t in [1,2]:
  if pa.types.is_temporal(s.type):v=s.cast(pa.int32() if t==1 else pa.int64()).as_py()
  bits=32 if t==1 else 64
  if v>=2**(bits-1):v-=2**bits
  out['value']=str(v)
 elif t==3:
  n=s.cast(pa.int64()).as_py();days,ns=divmod(n,86400000000000);out['hex']=struct.pack('<QI',ns,2440588+days).hex()
 elif t in [4,5]:out['hex']=struct.pack('<f' if t==4 else '<d',v).hex()
 else:out['hex']=(v.encode() if isinstance(v,str) else v).hex()
 return {'kind':'physical','value':out}
def field(n,v):return {'index':n['index'],'name':n['e'].name,'value':v}
def record(fields):return {'kind':'record','fields':fields}
def interpret(n,s,in_repeated=False):
 e=n['e'];children=n['children'];logical=e.logicalType;kind='LIST' if (e.converted_type==3 or logical and logical.LIST is not None) else 'MAP' if (e.converted_type==1 or logical and logical.MAP is not None) else None
 if not s.is_valid:return None
 if e.repetition_type==2 and not in_repeated:return {'kind':'repeated','items':[interpret(n,v,True) for v in s.values]}
 if e.type is not None:return physical(e,s)
 if kind=='LIST':
  repeated=children[0];rc=repeated['children'];direct=repeated['e'].type is not None or len(rc)>1 or rc and rc[0]['e'].repetition_type==2 or repeated['e'].name in ['array',e.name+'_tuple'];items=[interpret(repeated,v,True) if direct else record([field(rc[0],interpret(rc[0],v))]) for v in s.values];return record([field(repeated,{'kind':'repeated','items':items})])
 if kind=='MAP':
  repeated=children[0];items=[]
  for i in range(len(s.values)):
   items.append(record([field(child,interpret(child,s.values.field(j)[i])) for j,child in enumerate(repeated['children'])]))
  return record([field(repeated,{'kind':'repeated','items':items})])
 return record([field(child,interpret(child,s[i])) for i,child in enumerate(children)])
for c in manifest['results']:
 if c['status']!='assembled':continue
 raw=Path(c['path']).read_bytes();size=int.from_bytes(raw[-8:-4],'little');metadata=m.FileMetaData();metadata.read(TCompactProtocol(TMemoryBuffer(raw[-8-size:-8])));cursor=0
 def node():
  global cursor
  i=cursor;cursor+=1;e=metadata.schema[i];return {'index':i,'e':e,'children':[node() for _ in range(e.num_children or 0)]}
 root=node();table=pq.read_table(c['path']);actual=json.loads((base/(c['id']+'.json')).read_text());expected=[record([field(n,interpret(n,table.column(j)[i])) for j,n in enumerate(root['children'])]) for i in range(table.num_rows)]
 assert actual==expected,c['id'];results.append({'id':c['id'],'rows':table.num_rows,'nativeRowValuesMatch':True})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 rows reconstructed through pinned native Thrift schema','files':len(results),'rows':sum(r['rows'] for r in results),'results':results},indent=2)+'\n');print({'files':len(results),'rows':sum(r['rows'] for r in results)})
