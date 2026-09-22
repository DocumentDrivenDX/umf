import json,hashlib
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
native=json.loads(Path('fixtures/validation/nullability-parquet-native.json').read_text());cases={r['id']:r for r in native['cases']};recovered=json.loads(Path('fixtures/validation/nullability-parquet-recovered.json').read_text())
for r in recovered['rows']:
 original=cases[r['id']];path=Path(r['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==original['sha256']
 f=pq.ParquetFile(path);assert f.schema.equals(pq.ParquetFile(original['path']).schema)
 assert json.loads(json.dumps(f.read().to_pylist()))==original['output']
paths=['scripts/core-ideals/nullability-parquet-recovery-native.py','fixtures/validation/nullability-parquet-native.json','fixtures/validation/nullability-parquet-recovered.json']
result={'runtime':'PyArrow '+pa.__version__,'nativeRecoveredFiles':len(recovered['rows']),'exactSchemaAndValues':True,'fingerprints':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/nullability-parquet-recovery-native.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'nativeRecoveredFiles':result['nativeRecoveredFiles'],'exactSchemaAndValues':True}))
