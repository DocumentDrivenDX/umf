import base64,hashlib,json
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
base=Path('fixtures/parquet/arrow-schema')
original=pa.ipc.read_schema(pa.BufferReader(base64.b64decode(pq.read_metadata(base/'stored.parquet').metadata[b'ARROW:schema'])))
cases=[]
for output in json.loads((base/'reencoded.json').read_text())['outputs']:
    decoded=pa.ipc.read_schema(pa.BufferReader(bytes.fromhex(output['ipcHex'])))
    expected=original.set(0,original.field(0).with_name('renamed_events')) if output['edited'] else original
    assert decoded.equals(expected,check_metadata=True)
    cases.append({'format':output['format'],'edited':output['edited'],'schemaAndMetadataEqual':True})
report={'pyarrow':pa.__version__,'sourceSha256':hashlib.sha256((base/'reencoded.json').read_bytes()).hexdigest(),'cases':cases,'scope':'Native reading of re-encoded, optionally renamed embedded Arrow schemas; no Parquet file or row rewrite.'}
(base/'reencoded-oracle.json').write_text(json.dumps(report,indent=2)+'\n');print({'schemas':len(cases),'nativeSchemaMetadataEqual':True})
