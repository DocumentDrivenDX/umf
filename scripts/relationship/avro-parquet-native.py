"""Pin source-shaped Avro/Parquet evidence without inferring associations."""
import hashlib
import json
import pathlib
import pyarrow as pa
import pyarrow.parquet as pq

assert pa.__version__ == '21.0.0'
base = pathlib.Path('fixtures/relationship-native')
target = base / 'parquet-value-and-id.parquet'
customer_type = pa.struct([pa.field('id', pa.string(), nullable=False)])
schema = pa.schema([
    pa.field('customer_value', customer_type, nullable=False),
    pa.field('customer_id', pa.string(), nullable=False),
])
table = pa.Table.from_arrays([
    pa.array([], type=customer_type),
    pa.array([], type=pa.string()),
], schema=schema)
pq.write_table(table, target, version='2.6', compression='NONE')
observed = pq.read_schema(target)
assert observed.equals(schema, check_metadata=False)
metadata = pq.read_metadata(target)
assert metadata.num_rows == 0
assert metadata.schema.column(0).path == 'customer_value.id'
assert metadata.schema.column(1).path == 'customer_id'
source = target.read_bytes()
print(json.dumps({
    'runtime': 'PyArrow 21.0.0', 'format': metadata.format_version,
    'nativeColumns': [metadata.schema.column(i).path for i in range(metadata.num_columns)],
    'rows': metadata.num_rows, 'sha256': hashlib.sha256(source).hexdigest(),
    'bytes': len(source), 'authoredRelationshipInferred': False,
}, sort_keys=True))
