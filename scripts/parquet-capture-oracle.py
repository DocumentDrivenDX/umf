import json,hashlib
from pathlib import Path
import pyarrow.parquet as pq
base=Path('fixtures/parquet');report=json.loads((base/'capture-results.json').read_text());results=[]
for c in report['results']:
 original=Path(c['path']);exported=base/'exports'/(c['id']+'.parquet');a=original.read_bytes();b=exported.read_bytes();assert a==b and hashlib.sha256(b).hexdigest()==c['sha256'];native=pq.ParquetFile(original);recovered=pq.ParquetFile(exported);assert native.read().equals(recovered.read(),check_metadata=True);assert native.schema.equals(recovered.schema);assert native.metadata.serialized_size==c['footerRegion']['length'];assert len(a)-8-native.metadata.serialized_size==c['footerRegion']['offset'];results.append({'id':c['id'],'rows':native.metadata.num_rows,'footerSize':native.metadata.serialized_size})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0','files':len(results),'results':results},indent=2)+'\n');print({'files':len(results),'nativeRowsCompared':sum(r['rows'] for r in results)})
