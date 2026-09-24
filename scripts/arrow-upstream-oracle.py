"""Independent reads and full-table comparisons for the complete pinned binary corpus."""
import json
from pathlib import Path
import pyarrow as pa
base=Path('fixtures/arrow/upstream');report=json.loads((base/'results.json').read_text());results=[]
for case in report['results']:
    path=case['path'];opener=pa.ipc.open_file if path.endswith('.arrow_file') else pa.ipc.open_stream
    try:original=opener((base/path).read_bytes()).read_all()
    except Exception as error:results.append({'path':path,'status':'native-original-unsupported','message':str(error)});continue
    if case['renameStatus']!='renamed':results.append({'path':path,'status':'umf-transform-blocked','rows':original.num_rows});continue
    renamed=opener((base/'transformed'/path).read_bytes()).read_all()
    schema=original.schema.set(0,original.schema.field(0).with_name('umf_renamed_field'))
    expected=pa.Table.from_arrays(original.columns,schema=schema)
    assert renamed.equals(expected,check_metadata=True),path
    results.append({'path':path,'status':'equal','rows':original.num_rows})
output={'oracle':'pyarrow '+pa.__version__,'commit':report['commit'],'cases':len(results),'equal':sum(c['status']=='equal' for c in results),'results':results}
assert len(results)==182 and output['equal']==179
assert [c['path'] for c in results if c['status']!='equal']==['0.14.1/generated_decimal.arrow_file','0.14.1/generated_primitive_no_batches.arrow_file','0.14.1/generated_primitive_zerolength.arrow_file']
assert all(c['status'] in ['equal','umf-transform-blocked'] for c in results)
(base/'oracle-results.json').write_text(json.dumps(output,indent=2)+'\n');print({k:v for k,v in output.items() if k!='results'});print([c for c in results if c['status']!='equal'])
