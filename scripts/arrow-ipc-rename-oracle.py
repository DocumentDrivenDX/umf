"""Independent C++ reads of UMF-renamed complete IPC datasets."""
import json
from pathlib import Path
import pyarrow as pa
base=Path('fixtures/arrow/ipc-inputs');results=[]
for case in json.loads((base/'layout-oracle-results.json').read_text())['cases']:
    reader=pa.ipc.open_file if case['format']=='file' else pa.ipc.open_stream
    original=reader((base/case['file']).read_bytes()).read_all()
    renamed=reader((base/(case['file']+'.renamed.arrow')).read_bytes()).read_all()
    schema=original.schema.set(0,original.schema.field(0).with_name('renamed_field_with_a_longer_name'))
    expected=pa.Table.from_arrays(original.columns,schema=schema)
    assert renamed.equals(expected,check_metadata=True),case['file']
    results.append({'file':case['file'],'rows':renamed.num_rows,'expectedName':renamed.schema.names[0],'dataAndMetadataEqualExceptName':True})
(base/'rename-oracle-results.json').write_text(json.dumps({'oracle':'pyarrow '+pa.__version__,'cases':results},indent=2)+'\n');print({'verifiedRenames':len(results)})
