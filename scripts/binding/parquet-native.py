"""Independent native file check for the residual-only physical binding profile."""
import hashlib
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

assert pa.__version__ == '21.0.0'
case = json.loads(Path('fixtures/binding/parquet/case.json').read_text())
path = Path(case['native'])
source = path.read_bytes()
native = pq.ParquetFile(path)
assert native.schema_arrow.field('value').type == pa.int32()
assert native.read().to_pylist() == [{'value': None}, {'value': 0}, {'value': 7}]
metadata = native.schema_arrow.metadata or {}
assert metadata[b'future.meaning'] == b'unclassified'
assert metadata[b'future.exact'] == b'9007199254740993'
proof = {
    'scope': 'Native source validity and retained byte archive only; no binding index or layout enforcement claim',
    'runtime': f'PyArrow {pa.__version__}',
    'source': str(path),
    'sourceSha256': hashlib.sha256(source).hexdigest(),
    'rows': 3,
    'unknownMetadataRetained': True,
}
Path('fixtures/binding/parquet/native-oracle.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'runtime': proof['runtime'], 'rows': proof['rows']}))
