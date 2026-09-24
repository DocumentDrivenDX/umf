"""Extract native IPC metadata with PyArrow; retain source provenance and raw buffers."""
from pathlib import Path
import json,hashlib,struct
import pyarrow as pa
source=Path('fixtures/arrow/ipc-inputs');base=Path('fixtures/arrow/metadata');base.mkdir(exist_ok=True)
results=[]
previous=base/'manifest.json'
if previous.exists():
    results=[c for c in json.loads(previous.read_text())['cases'] if c.get('producer')=='flatc 23.5.26']
    for case in results:assert hashlib.sha256((base/case['file']).read_bytes()).hexdigest()==case['sha256']
for case in json.loads((source/'manifest.json').read_text())['cases']:
    raw=(source/case['file']).read_bytes();reader=pa.BufferReader(raw)
    if case['format']=='file':reader.seek(8)
    index=0
    while True:
        try:message=pa.ipc.read_message(reader)
        except EOFError:break
        metadata=message.metadata.to_pybytes();name=case['file']+'.'+str(index)+'.bin';(base/name).write_bytes(metadata)
        results.append({'file':name,'source':case['file'],'kind':message.type,'rootType':'Message','sha256':hashlib.sha256(metadata).hexdigest()});index+=1
    if case['format']=='file':
        length=struct.unpack('<I',raw[-10:-6])[0];metadata=raw[-10-length:-10];name=case['file']+'.footer.bin';(base/name).write_bytes(metadata)
        results.append({'file':name,'source':case['file'],'kind':'footer','rootType':'Footer','sha256':hashlib.sha256(metadata).hexdigest()})
(base/'manifest.json').write_text(json.dumps({'producer':'pyarrow '+pa.__version__,'cases':results},indent=2)+'\n');print({'metadataRoots':len(results)})
