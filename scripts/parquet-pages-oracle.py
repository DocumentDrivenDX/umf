import json,struct,hashlib
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='pages_parquet_thrift')
def convert(v,code,detail=None):
 if code==12:return {spec[1]:convert(getattr(v,spec[1]),spec[0],spec[2] if len(spec)==4 else None) for spec in detail.thrift_spec.values() if getattr(v,spec[1]) is not None}
 if code in [3,6,8,10]:return str(v)
 if code in [2,11]:return v
 if code==18:return {'hex':v.hex()}
 if code==4:return {'bits':struct.pack('<d',v).hex()}
 if code in [14,15]:return [convert(item,*(detail if isinstance(detail,tuple) else (detail,))) for item in v]
 raise AssertionError((code,detail))
base=Path('fixtures/parquet/pages');report=json.loads((base/'results.json').read_text());results=[]
for c in report['results']:
 raw=Path(c['path']).read_bytes();native=pq.ParquetFile(c['path']);native.read();pages=0
 for p in c.get('pages',[]):
  # Append a sentinel and read the remaining bytes back to obtain native consumed length.
  remaining=raw[p['offset']:];transport=TMemoryBuffer(remaining);obj=m.PageHeader();obj.read(TCompactProtocol(transport));tail=transport.read(len(remaining));consumed=len(remaining)-len(tail);assert consumed==p['headerBytes']
  observed=convert(obj,12,m.PageHeader);expected=json.loads(json.dumps(p['header']))
  if 'data_page_header_v2' in expected:expected['data_page_header_v2'].setdefault('is_compressed',True)
  assert observed==expected,(c['id'],p['offset'],observed,expected)
  assert p['bodyOffset']==p['offset']+consumed and p['bodyBytes']==obj.compressed_page_size;pages+=1
 results.append({'id':c['id'],'status':c['status'],'nativeReadable':True,'pagesCompared':pages,'rows':native.metadata.num_rows})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'thriftpy2 0.5.3 / PyArrow 21.0.0','files':len(results),'pagesCompared':sum(r['pagesCompared'] for r in results),'results':results},indent=2)+'\n');print({'files':len(results),'pagesCompared':sum(r['pagesCompared'] for r in results)})
