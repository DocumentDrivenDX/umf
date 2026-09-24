"""Independent named metadata from thriftpy2's generated Parquet IDL classes."""
import json,struct,hashlib
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
source=Path('native/parquet/sources');manifest=json.loads((source/'manifest.json').read_text())
for f in manifest['files']:assert hashlib.sha256((source/f['local']).read_bytes()).hexdigest()==f['sha256']
m=thriftpy2.load(str(source/'parquet.thrift'),module_name='oracle_parquet_thrift')
def convert(v,code,detail=None):
 if code==12:
  return {spec[1]:convert(getattr(v,spec[1]),spec[0],spec[2] if len(spec)==4 else None) for spec in detail.thrift_spec.values() if getattr(v,spec[1]) is not None}
 if code in [3,6,8,10]:return str(v)
 if code in [2,11]:return v
 if code==18:return {'hex':v.hex()}
 if code==4:return {'bits':struct.pack('<d',v).hex()}
 if code in [14,15]:return [convert(item,*(detail if isinstance(detail,tuple) else (detail,))) for item in v]
 raise AssertionError((code,detail))
base=Path('fixtures/parquet/metadata');base.mkdir(parents=True,exist_ok=True);cases=json.loads(Path('fixtures/parquet/capture-results.json').read_text())['results'];results=[]
for c in cases:
 raw=Path(c['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==c['sha256'];length=struct.unpack('<I',raw[-8:-4])[0];obj=m.FileMetaData();obj.read(TCompactProtocol(TMemoryBuffer(raw[len(raw)-8-length:-8])));expected=convert(obj,12,m.FileMetaData);(base/(c['id']+'.expected.json')).write_text(json.dumps(expected,indent=2)+'\n');results.append({'id':c['id'],'path':c['path'],'sha256':c['sha256']})
(base/'manifest.json').write_text(json.dumps({'runtime':'thriftpy2 0.5.3','idlCommit':manifest['commit'],'files':len(results),'results':results},indent=2)+'\n');print({'files':len(results)})
