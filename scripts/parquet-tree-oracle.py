import hashlib,json
from pathlib import Path
import pyarrow.parquet as pq
base=Path('fixtures/parquet/schema');base.mkdir(parents=True,exist_ok=True);m=json.loads(Path('fixtures/parquet/capture-results.json').read_text());results=[]
for c in m['results']:
 raw=Path(c['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==c['sha256'];p=pq.ParquetFile(c['path']);leaves=[]
 for i in range(len(p.schema)):
  col=p.schema.column(i);leaves.append({'ordinal':i,'pathString':col.path,'physicalType':col.physical_type,'definitionLevel':col.max_definition_level,'repetitionLevel':col.max_repetition_level})
 expected={'leaves':leaves,'rowGroups':p.metadata.num_row_groups,'rows':str(p.metadata.num_rows)};(base/(c['id']+'.expected.json')).write_text(json.dumps(expected,indent=2)+'\n');results.append({'id':c['id'],'path':c['path'],'sha256':c['sha256']})
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0','files':len(results),'results':results},indent=2)+'\n');print({'files':len(results)})
