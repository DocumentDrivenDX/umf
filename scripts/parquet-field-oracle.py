import json
from pathlib import Path
import pyarrow,pyarrow.parquet as pq
assert pyarrow.__version__=='21.0.0'
report=json.loads(Path('fixtures/parquet/field-metadata.json').read_text());rows=[]
for c in report['results']:
    assert Path(c['path']).read_bytes()==Path(c['exported']).read_bytes()
    original=pq.ParquetFile(c['path']);recovered=pq.ParquetFile(c['exported'])
    assert original.schema.equals(recovered.schema)
    rows.append({'id':c['id'],'nativeSchemaAgrees':True,'arrowSchema':str(recovered.schema_arrow)})
original=pq.read_table('fixtures/parquet/rename/none.parquet');renamed=pq.read_table('fixtures/parquet/field-exports/renamed.parquet')
assert original.rename_columns(['renamed',*original.column_names[1:]]).equals(renamed,check_metadata=True)
Path('fixtures/parquet/field-oracle.json').write_text(json.dumps({'pyarrow':pyarrow.__version__,'cases':rows,'renamedRows':renamed.num_rows,'renameAgrees':True},indent=2)+'\n')
print({'schemas':len(rows),'renamedRows':renamed.num_rows})
