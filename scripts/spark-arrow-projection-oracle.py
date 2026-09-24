"""Read actual UMF-produced Arrow schemas and compare native schema plus both recoveries."""
import json
from pathlib import Path
import pyarrow as pa
from pyspark.sql.pandas.types import from_arrow_schema
base=Path('fixtures/projections/spark-arrow');report=json.loads((base/'native-results.json').read_text());count=0
for row in report['results']:
 if row['status']!='converted':continue
 expected=pa.ipc.read_schema(pa.BufferReader((base/(row['id']+'.arrow')).read_bytes()));actual=pa.ipc.read_schema(pa.BufferReader((base/(row['id']+'.projected.arrow')).read_bytes()))
 assert expected.equals(actual,check_metadata=True),row['id']
 for recovery in row['recovery']:assert from_arrow_schema(actual,prefer_timestamp_ntz=recovery['prefer_timestamp_ntz']).jsonValue()==recovery['schema'],row['id']
 count+=1
assert count==188
(base/'projection-oracle-results.json').write_text(json.dumps({'nativeArrowSchemas':count,'nativeRecoveries':2*count,'pyarrow':pa.__version__},indent=2)+'\n');print({'nativeArrowSchemas':count,'nativeRecoveries':2*count})
