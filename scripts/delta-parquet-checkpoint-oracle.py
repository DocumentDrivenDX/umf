import json,tempfile
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable
base=Path('fixtures/delta/parquet-checkpoint');native=json.load(open(base/'native-results.json'));results=[]
with tempfile.TemporaryDirectory(prefix='umf-parquet-recovered-') as tmp:
 for expected in native['results']:
  path=Path(tmp)/(expected['id']+'-'+expected['version']);log=path/'_delta_log';log.mkdir(parents=True)
  for p in Path('fixtures/delta/history').glob('*.parquet'):(path/p.name).write_bytes(p.read_bytes())
  (log/'00000000000000000000.json').write_bytes((base/(expected['id']+'-'+expected['version']+'.jsonl')).read_bytes());t=DeltaTable(path)
  actual={'id':expected['id'],'version':expected['version'],'rows':sorted(pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist(),key=lambda r:r['id']),'paths':sorted(Path(p).name for p in t.file_uris()),'job':t.transaction_version('job'),'other':t.transaction_version('other')};assert actual==expected,(actual,expected);results.append(actual)
(base/'oracle-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','results':results},indent=2)+'\n');print({'nativeSnapshotsAgree':len(results)})
