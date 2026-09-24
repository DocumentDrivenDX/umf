import json,tempfile
from pathlib import Path
from deltalake import DeltaTable
base=Path('fixtures/delta/table-context');native=json.loads(Path('fixtures/delta/tables/results.json').read_text());count=0
with tempfile.TemporaryDirectory(prefix='umf-delta-context-') as work:
 for row in native['results']:
  value=json.loads((base/(row['id']+'.exported.json')).read_text());assert value=={'protocol':row['protocol'],'metaData':row['metadata']}
  path=Path(work)/row['id'];log=path/'_delta_log';log.mkdir(parents=True)
  (log/'00000000000000000000.json').write_text(json.dumps({'protocol':value['protocol']})+'\n'+json.dumps({'metaData':value['metaData']})+'\n')
  table=DeltaTable(path);assert json.loads(table.schema().to_json())==row['schema'];assert table.metadata().configuration==row['metadata']['configuration'];assert table.metadata().partition_columns==row['metadata']['partitionColumns'];assert table.protocol().min_reader_version==row['protocol']['minReaderVersion'];assert table.protocol().min_writer_version==row['protocol']['minWriterVersion'];assert set(table.protocol().reader_features or [])==set(row['protocol'].get('readerFeatures',[]));assert set(table.protocol().writer_features or [])==set(row['protocol'].get('writerFeatures',[]));count+=1
assert count==2
Path('fixtures/delta/table-oracle-results.json').write_text(json.dumps({'metadataOnlyTables':count,'runtime':'deltalake 1.6.4'},indent=2)+'\n');print({'metadataOnlyTables':count})
