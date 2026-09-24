import hashlib,json
from pathlib import Path
import pyarrow as pa
assert pa.__version__=='21.0.0'
base=Path('fixtures/parquet/arrow-nested');cases=[]
for c in json.loads((base/'map-label-probes.json').read_text())['cases']:
 raw=Path(c['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==c['sha256']
 schema=pa.ipc.read_schema(pa.BufferReader(raw));typ=schema.field('lookup').type
 name=(typ.key_field if c['role']=='key' else typ.item_field).name
 assert name==c['role'];assert name!=c['proposedName'];cases.append({**c,'nativeName':name,'requestedLabelRetained':False})
(base/'map-label-oracle.json').write_text(json.dumps({'pyarrow':pa.__version__,'cases':cases,'scope':'PyArrow IPC reader normalizes MAP key/value role names; raw FlatBuffers field edits do not establish native rename support.'},indent=2)+'\n');print({'normalizationCounterexamples':len(cases)})
