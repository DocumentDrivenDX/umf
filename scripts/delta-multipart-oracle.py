import hashlib,json,tempfile
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable
base=Path('fixtures/delta/multipart');native=json.loads((base/'native-results.json').read_text());results=[]
with tempfile.TemporaryDirectory(prefix='umf-checkpoint-lowered-') as tmp:
 for case in native['results']:
  path=Path(tmp)/case['version'];log=path/'_delta_log';log.mkdir(parents=True)
  for name,digest in json.load(open('fixtures/delta/checkpoint/native-results.json'))['dataFiles'].items():
   raw=(Path('fixtures/delta/history')/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==digest;(path/name).write_bytes(raw)
  (log/'00000000000000000000.json').write_bytes((base/('snapshot-'+case['version']+'.jsonl')).read_bytes());t=DeltaTable(path)
  actual={'version':case['version'],'rows':sorted(pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist(),key=lambda r:r['id']),'paths':sorted(Path(p).name for p in t.file_uris()),'job':t.transaction_version('job'),'other':t.transaction_version('other')};assert actual==case,(actual,case);results.append(actual)
(base/'oracle-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','results':results},indent=2)+'\n');print({'versions':len(results),'nativeObservationsMatch':True})
