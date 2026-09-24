"""Native PyArrow consumption boundaries, independent of UMF's framing traversal."""
from pathlib import Path
import json,struct
import pyarrow as pa
base=Path('fixtures/arrow/ipc-inputs');results=[]
cases=json.loads((base/'manifest.json').read_text())['cases']
original=pa.ipc.open_stream((base/'int64.stream.arrow').read_bytes()).read_all()
sink=pa.BufferOutputStream()
with pa.ipc.new_stream(sink,original.schema,options=pa.ipc.IpcWriteOptions(use_legacy_format=True)) as writer:writer.write_table(original)
(base/'int64.legacy.arrow').write_bytes(sink.getvalue().to_pybytes())
cases.append({'file':'int64.legacy.arrow','format':'stream'})
for c in cases:
    raw=(base/c['file']).read_bytes();reader=pa.BufferReader(raw)
    if c['format']=='file':reader.seek(8)
    frames=[]
    while True:
        start=reader.tell()
        try:message=pa.ipc.read_message(reader)
        except EOFError:break
        prefix=8 if struct.unpack_from('<i',raw,start)[0]==-1 else 4
        frames.append({'offset':start,'prefixLength':prefix,'metadataOffset':start+prefix,'metadataLength':message.metadata.size,'bodyOffset':start+prefix+message.metadata.size,'bodyLength':message.body.size if message.body else 0,'kind':{'schema':'Schema','record batch':'RecordBatch','dictionary':'DictionaryBatch'}[message.type]})
        assert reader.tell()==frames[-1]['bodyOffset']+frames[-1]['bodyLength']
    result={'file':c['file'],'format':c['format'],'frames':frames,'eosOffset':start}
    if c['format']=='file':
        length=struct.unpack_from('<i',raw,len(raw)-10)[0];result['footer']={'offset':len(raw)-10-length,'length':length}
        assert reader.tell()==result['footer']['offset']
    else:assert reader.tell()==len(raw)
    results.append(result)
(base/'layout-oracle-results.json').write_text(json.dumps({'oracle':'pyarrow '+pa.__version__,'cases':results},indent=2)+'\n');print({'layouts':len(results)})
