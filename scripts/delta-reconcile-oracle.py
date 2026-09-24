import hashlib,json,tempfile
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable
base=Path('fixtures/delta/history');expected=json.loads((base/'native-results.json').read_text());results=[]
with tempfile.TemporaryDirectory(prefix='umf-reconciled-') as work:
 for case in expected['results']:
  path=Path(work)/case['version'];log=path/'_delta_log';log.mkdir(parents=True)
  for name,digest in expected['files'].items():
   raw=(base/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==digest;(path/name).write_bytes(raw)
  (log/'00000000000000000000.json').write_bytes((base/('snapshot-'+case['version']+'.jsonl')).read_bytes())
  t=DeltaTable(path);rows=pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist()
  actual={'version':case['version'],'paths':sorted(Path(p).name for p in t.file_uris()),'rows':sorted(rows,key=lambda r:r['id']),'job':t.transaction_version('job'),'other':t.transaction_version('other'),'name':t.metadata().name,'description':t.metadata().description,'protocol':{'minReaderVersion':t.protocol().min_reader_version,'minWriterVersion':t.protocol().min_writer_version}}
  assert actual==case,(actual,case);results.append(actual)
(base/'oracle-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','versions':len(results),'results':results},indent=2)+'\n');print({'versions':len(results),'nativeObservationsMatch':True})
