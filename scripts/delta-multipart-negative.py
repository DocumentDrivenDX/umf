import json
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/delta/multipart');m=json.load(open(base/'manifest.json'));first=pq.read_table(m['parts'][0]['path']);cases=[]
for kind in ['v2-feature','duplicate-action']:
 rows=first.to_pylist()
 if kind=='v2-feature':
  for r in rows:
   if r.get('protocol'):r['protocol'].update(minReaderVersion=3,minWriterVersion=7,readerFeatures=['v2Checkpoint'],writerFeatures=['v2Checkpoint'])
 else:rows.append(next(r for r in rows if r.get('add')))
 p=base/(kind+'.parquet');pq.write_table(pa.Table.from_pylist(rows,schema=first.schema),p,compression='snappy');cases.append({'id':kind,'path':str(p),'replaces':0})
(base/'negative-manifest.json').write_text(json.dumps({'cases':cases},indent=2)+'\n')
