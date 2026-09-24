"""Local native tables demonstrate schema versus protocol/configuration context."""
import json,tempfile
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable,write_deltalake
base=Path('fixtures/delta/tables');base.mkdir(exist_ok=True);results=[]
with tempfile.TemporaryDirectory(prefix='umf-delta-') as work:
 for name,table in [('partitioned',pa.table({'id':pa.array([1,2],type=pa.int64()),'region':['east','west']})),('timestamp-ntz',pa.table({'id':[1,2],'local_time':pa.array([0,1000000],type=pa.timestamp('us'))}))]:
  path=Path(work)/name;write_deltalake(path,table,partition_by=['region'] if name=='partitioned' else None,configuration={'delta.appendOnly':'true'})
  dt=DeltaTable(path);dt.alter.add_constraint({'positive_id':'id > 0'});dt=DeltaTable(path)
  rejected=False
  try:
   bad=table.slice(0,1).set_column(0,'id',pa.array([-1],type=pa.int64()));write_deltalake(path,bad,mode='append')
  except Exception:rejected=True
  assert rejected
  target=base/name;target.mkdir(exist_ok=True);actions=[]
  for log in sorted((path/'_delta_log').glob('*.json')):
   raw=log.read_text();(target/log.name).write_text(raw);actions.extend(json.loads(line) for line in raw.splitlines())
  metadata=[a['metaData'] for a in actions if 'metaData' in a][-1];protocol=[a['protocol'] for a in actions if 'protocol' in a][-1]
  assert json.loads(metadata['schemaString'])==json.loads(dt.schema().to_json());assert metadata['configuration']['delta.constraints.positive_id']=='id > 0'
  results.append({'id':name,'version':dt.version(),'rows':dt.to_pyarrow_table().num_rows,'schema':json.loads(dt.schema().to_json()),'protocol':protocol,'metadata':metadata,'invalidAppendRejected':rejected})
assert 'timestampNtz' in results[1]['protocol']['readerFeatures']
(base/'results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4','results':results},indent=2)+'\n');print([(r['id'],r['protocol'],r['invalidAppendRejected']) for r in results])
