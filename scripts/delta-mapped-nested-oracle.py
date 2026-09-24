import json,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable
base=Path('fixtures/delta/mapped-nested');report=json.loads((base/'native-results.json').read_text());results=[]
with tempfile.TemporaryDirectory(prefix='umf-nested-candidates-') as work:
 for row in report['results']:
  source=base/row['id'];original=json.loads((source/'context.json').read_text());changed=json.loads((source/'renamed.json').read_text());assert original['protocol']==changed['protocol'];expected=json.loads(json.dumps(original));schema=json.loads(expected['metaData']['schemaString']);schema['fields'][1]['name']='lines';schema['fields'][1]['type']['elementType']['fields'][0]['name']='quantity';schema['fields'][2]['type']['valueType']['fields'][0]['name']='amount';assert json.loads(changed['metaData']['schemaString'])==schema
  expected['metaData']['schemaString']=changed['metaData']['schemaString'];assert changed==expected
  path=Path(work)/row['id'];log=path/'_delta_log';log.mkdir(parents=True);file=path/'part.parquet';file.write_bytes((source/'part.parquet').read_bytes());assert hashlib.sha256(file.read_bytes()).hexdigest()==row['parquetSha256'];add=json.loads((source/'add.json').read_text())
  (log/'00000000000000000000.json').write_text('\n'.join(json.dumps(a) for a in [{'protocol':original['protocol']},{'metaData':original['metaData']},{'add':add}])+'\n')
  def read():return json.loads(json.dumps(sorted(pa.RecordBatchReader.from_stream(DeltaTable(path).scan()).read_all().to_pylist(),key=lambda r:r['id'])))
  assert read()==row['before'];(log/'00000000000000000001.json').write_text(json.dumps({'metaData':changed['metaData']})+'\n');actual=read();assert actual==row['after'];assert hashlib.sha256(file.read_bytes()).hexdigest()==row['parquetSha256'];results.append({'id':row['id'],'rows':len(actual),'dataFileUnchanged':True})
assert len(results)==4
(base/'oracle-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','results':results},indent=2)+'\n');print({'cases':4,'rowsCompared':16,'dataFilesUnchanged':4})
