import hashlib,json
from pathlib import Path
import pyarrow as pa
base=Path('fixtures/arrow');report=json.loads((base/'public-ipc-results.json').read_text())
assert report['exported']==48 and report['blocked']==4
count=0
for row in report['results']:
    if row['status']=='blocked':continue
    data=(base/row['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==row['sha256']
    with pa.ipc.open_stream(data) as actual,pa.ipc.open_stream((base/(row['id']+'.arrow')).read_bytes()) as expected:
        assert actual.schema.equals(expected.schema,check_metadata=True),row['id']
        assert actual.read_all().num_rows==0
    count+=1
with pa.ipc.open_stream((base/'edited.umf.arrow').read_bytes()) as edited:
    assert edited.schema.names==['edited_field']
    assert edited.schema.field(0).type==pa.bool_()
assert count==48
(base/'public-ipc-oracle-results.json').write_text(json.dumps({'oracle':'pyarrow '+pa.__version__,'schemas':count,'metadataAndNativeTypeEquality':True,'editedFieldVerified':True,'scope':'Schema-only IPC, compared with the pinned native baseline. No record-batch, dictionary-value, unknown FlatBuffer or arbitrary stream import claim.'},indent=2)+'\n')
print('Arrow public IPC: 48 native schemas and edited field verified independently')
