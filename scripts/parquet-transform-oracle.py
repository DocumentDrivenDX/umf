import json,hashlib,importlib.util
from pathlib import Path
import pyarrow.parquet as pq
# Independent Apache Thrift protocol reader used by the original footer oracle.
spec=importlib.util.spec_from_file_location('footer_oracle','scripts/parquet-footer-oracle.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
base=Path('fixtures/parquet/transforms');report=json.loads((base/'results.json').read_text());results=[]
for c in report['results']:
 wire=(base/'wire'/(c['id']+'.compact')).read_bytes();transport=module.TMemoryBuffer(wire);value=module.read(module.TCompactProtocol(transport),module.T.STRUCT);expected=json.loads(Path('fixtures/parquet/footer',c['id']+'.expected.json').read_text())['value'];assert value==expected and transport.cstringio_buf.tell()==len(wire)
 if c['wireOnly']:results.append({'id':c['id'],'wireEqual':True});continue
 original=pq.ParquetFile(c['path']);path=base/'exports'/(c['id']+'.parquet');edited=pq.ParquetFile(path);raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==c['outputSha256'];assert raw[:c['unchangedPrefixBytes']]==Path(c['path']).read_bytes()[:c['unchangedPrefixBytes']]
 assert original.schema.equals(edited.schema);assert original.read().equals(edited.read(),check_metadata=False)
 length=int.from_bytes(raw[-8:-4],'little');changed=module.read(module.TCompactProtocol(module.TMemoryBuffer(raw[-8-length:-8])),module.T.STRUCT)
 assert [f for f in value['fields'] if f['id']!=5]==[f for f in changed['fields'] if f['id']!=5] # Exact column metadata/statistics/offsets, including unsupported PyArrow statistic types.
 for key,v in (original.metadata.metadata or {}).items():assert edited.metadata.metadata[key]==v
 for entry in report['additions']:assert edited.metadata.metadata[entry['key'].encode()]==entry.get('value','').encode()
 # PyArrow exposes absent KeyValue.value as empty bytes; inspect exact wire separately.
 results.append({'id':c['id'],'wireEqual':True,'rows':original.metadata.num_rows,'schemaEqual':True,'valuesEqual':True,'columnMetadataEqual':True})
(base/'oracle-results.json').write_text(json.dumps({'wireRuntime':'Apache Thrift 0.22.0','nativeRuntime':'PyArrow 21.0.0','wireFiles':len(results),'transformed':sum('rows' in r for r in results),'rows':sum(r.get('rows',0) for r in results),'results':results},indent=2)+'\n');print({'wireFiles':len(results),'rows':sum(r.get('rows',0) for r in results)})
