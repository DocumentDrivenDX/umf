"""Independent C++ Arrow schema read/re-emission, without claiming data conformance."""
import json,hashlib
from pathlib import Path
import pyarrow as pa
base=Path('fixtures/arrow');report=json.loads((base/'capability-results.json').read_text());results=[]
for row in report['results']:
    if row['status']=='unsupported':continue
    path=base/(row['id']+'.arrow');raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==row['sha256']
    with pa.ipc.open_stream(raw) as reader:
        schema=reader.schema
        assert len(schema)==len(row['after']['fields'])
        assert (schema.metadata or {})=={m['key'].encode():m['value'].encode() for m in row['after']['metadata']}
        assert reader.read_all().num_rows==0
    for field,expected in zip(schema,row['after']['fields']):
        assert field.name==expected['name'] and field.nullable==expected['nullable']
        assert (field.metadata or {})=={m['key'].encode():m['value'].encode() for m in expected['metadata']}
    sink=pa.BufferOutputStream()
    with pa.ipc.new_stream(sink,schema):pass
    data=sink.getvalue().to_pybytes();(base/(row['id']+'.python.arrow')).write_bytes(data)
    with pa.ipc.open_stream(data) as reader:assert reader.schema.equals(schema,check_metadata=True)
    results.append({'id':row['id'],'schema':str(schema),'metadataEqual':True,'nativeReemissionEqual':True})
(base/'schema-oracle-results.json').write_text(json.dumps({'oracle':'pyarrow '+pa.__version__,'cases':len(results),'scope':'Schema-only IPC, metadata and native schema equality. No record batches, dictionary data, unknown FlatBuffer fields or browser evidence.','results':results},indent=2)+'\n')
print(f'Arrow: {len(results)} JavaScript-produced schemas read and re-emitted by PyArrow {pa.__version__}')
